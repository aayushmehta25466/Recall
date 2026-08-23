import { CATEGORIES } from '../../shared/types/taxonomy.js';
import { updateBookmark, getActiveBookmarks } from '../../database/indexeddb/db.js';
import { moveBookmarkToCategory, cleanupEmptyFolders } from '../folder-manager/manager.js';

const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';
const VALID_CATEGORIES = Object.values(CATEGORIES).filter(c => c !== CATEGORIES.UNCATEGORIZED);
// ponytail: 15 per request — keeps context small enough for free models while
// amortizing request overhead. Drop to 8 if responses get truncated.
const BATCH_SIZE = 15;

const SYSTEM_PROMPT = `You are a precise bookmark categorization assistant. Your output MUST be a valid JSON object mapping indices to classification results.

CRITICAL RULES:
1. Output ONLY a JSON object: {"0":{"category":"...","subcategory":"...","tags":["..."]},"1":{...}}
2. NO explanations, NO questions, NO markdown fences, NO additional text
3. Each input bookmark index maps to exactly one output key
4. Return EXACTLY {bookmarkCount} entries in the object (keys "0" through "{lastIndex}")
5. Assign EXACTLY ONE category per bookmark from this list: ${VALID_CATEGORIES.join(', ')}
6. subcategory = short specific label like "Frontend", "Videos", "Research", "Deals"
7. tags = array of 2-5 lowercase hyphenated tags derived from title/URL/domain, e.g. ["react-tutorial","hooks","frontend"]
8. If uncertain about category, pick the closest match — never use "Uncategorized"
9. If a bookmark has insufficient data, still classify by domain/URL pattern

Output format example for 2 bookmarks:
{"0":{"category":"Development","subcategory":"Frontend","tags":["react","tutorial","spa"]},"1":{"category":"News & Media","subcategory":"Tech News","tags":["ai","industry","daily"]}}`;

/**
 * Parse AI response with 4 fallback strategies (Metrolist pattern).
 * Returns map of { index: { category, subcategory, tags } } or {} on total failure.
 */
function parseClassificationResponse(raw, expectedCount) {
  if (!raw) return {};

  // Strategy 1: direct parse after stripping markdown fences
  let jsonStr = raw.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();

  // Strategy 2: extract first { to last } in case model added prose
  const firstBrace = jsonStr.indexOf('{');
  const lastBrace = jsonStr.lastIndexOf('}');
  if (firstBrace !== -1 && lastBrace > firstBrace) {
    jsonStr = jsonStr.substring(firstBrace, lastBrace + 1);
  }

  try {
    const parsed = JSON.parse(jsonStr);
    if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) {
      return parsed;
    }
  } catch (_) { /* fall through */ }

  // Strategy 3: normalize single quotes and retry
  try {
    const parsed = JSON.parse(jsonStr.replace(/'/g, '"'));
    if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) {
      return parsed;
    }
  } catch (_) { /* fall through */ }

  // Strategy 4: regex-extract individual entries like "0":{"category":"X",...}
  const results = {};
  const entryRegex = /"(\d+)"\s*:\s*\{[^{}]*\}/g;
  let match;
  while ((match = entryRegex.exec(raw)) !== null) {
    try {
      results[match[1]] = JSON.parse(match[0].split(':').slice(1).join(':'));
    } catch (_) { /* skip malformed entry */ }
  }
  if (Object.keys(results).length > 0) return results;

  console.error('All parsing strategies failed. Raw:', raw?.substring(0, 300));
  return {};
}

/** Validate + sanitize one AI result entry. Case-insensitive category match. */
function sanitizeResult(result) {
  if (!result || typeof result !== 'object') return null;
  if (!result.category) return null;
  // Normalize casing: "development" → "Development", "news & media" → "News & Media"
  const match = VALID_CATEGORIES.find(
    c => c.toLowerCase() === String(result.category).trim().toLowerCase()
  );
  if (!match) return null;
  return {
    category: match,
    subcategory: typeof result.subcategory === 'string' ? result.subcategory : '',
    tags: Array.isArray(result.tags)
      ? result.tags.filter(t => typeof t === 'string').slice(0, 5)
      : [],
  };
}

/**
 * Send a batch of uncategorized bookmarks to AI for classification.
 * Returns { results: map, error: string|null } so failures surface in the UI.
 */
async function classifyBatch(bookmarks, settings) {
  const userPrompt = bookmarks.map((b, i) =>
    `[${i}] "${b.title || 'untitled'}" — ${b.url}`
  ).join('\n');

  const systemPrompt = SYSTEM_PROMPT.replace('{bookmarkCount}', bookmarks.length)
    .replace('{lastIndex}', String(bookmarks.length - 1));

  try {
    const res = await fetch(OPENROUTER_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${settings.openrouterApiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'chrome-extension://bookmarkly',
        'X-Title': 'Bookmarkly',
      },
      body: JSON.stringify({
        model: settings.openrouterModel || 'google/gemini-2.5-flash-lite',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        temperature: 0.1,
        // Gemini 2.5 "thinking" burns tokens before output — exclude it and
        // budget generously so the JSON never truncates mid-array.
        reasoning: { exclude: true },
        max_tokens: bookmarks.length * 200 + 200,
      }),
    });

    if (!res.ok) {
      const errBody = await res.text().catch(() => '');
      console.error(`OpenRouter API error: ${res.status} ${res.statusText}`, errBody);
      let msg = `API ${res.status}`;
      try { msg = JSON.parse(errBody).error?.message || msg; } catch (_) {}
      return { results: {}, error: msg };
    }
    const data = await res.json();
    const raw = data.choices?.[0]?.message?.content?.trim();
    if (!raw) {
      // Reasoning models may put everything in reasoning and nothing in content
      console.warn('OpenRouter returned empty content:', JSON.stringify(data).substring(0, 500));
      return { results: {}, error: 'Empty response (model returned no content)' };
    }

    const results = parseClassificationResponse(raw, bookmarks.length);
    if (Object.keys(results).length === 0) {
      return { results: {}, error: 'Could not parse AI response as JSON' };
    }
    return { results, error: null };
  } catch (e) {
    console.error('Batch classification failed:', e.message);
    return { results: {}, error: e.message };
  }
}

/**
 * Move the Chrome bookmark(s) for a URL into its category folder and
 * sync the chromeFolder field in IndexedDB. Folder view groups by
 * chromeFolder, so without this the UI keeps showing "Uncategorized".
 */
async function moveChromeBookmark(url, category, subcategory) {
  try {
    const matches = await chrome.bookmarks.search({ url });
    for (const m of matches) {
      await moveBookmarkToCategory(m.id, category, subcategory);
    }
    const newPath = subcategory
      ? `Engine Organized / ${category} / ${subcategory}`
      : `Engine Organized / ${category}`;
    await updateBookmark(url, { chromeFolder: newPath });
  } catch (e) {
    console.warn(`Chrome folder move failed for ${url}:`, e.message);
  }
}

/**
 * Run batch AI classification on all uncategorized bookmarks.
 * Processes in batches of BATCH_SIZE to keep context under control.
 * Returns { processed, categorized, errors } counts.
 */
export async function runBatchCategorize(settings, onProgress) {
  if (!settings.openrouterApiKey) {
    console.warn('Batch categorize: no API key set');
    return { processed: 0, categorized: 0, errors: ['No API key set'] };
  }

  const all = await getActiveBookmarks();
  const uncategorized = all.filter(b => b.category === 'Uncategorized' || !b.category);
  console.log(`Batch categorize: ${uncategorized.length} uncategorized bookmarks found`);
  if (uncategorized.length === 0) return { processed: 0, categorized: 0, errors: [] };

  let processed = 0;
  let categorized = 0;
  const errors = [];

  for (let i = 0; i < uncategorized.length; i += BATCH_SIZE) {
    const batch = uncategorized.slice(i, i + BATCH_SIZE);
    const { results, error } = await classifyBatch(batch, settings);
    if (error) errors.push(`Batch ${i / BATCH_SIZE + 1}: ${error}`);

    for (let j = 0; j < batch.length; j++) {
      const sanitized = sanitizeResult(results[String(j)]);
      if (sanitized) {
        await updateBookmark(batch[j].url, {
          category: sanitized.category,
          subcategory: sanitized.subcategory,
          tags: sanitized.tags,
        });
        // Move the actual Chrome bookmark so folder view reflects the category
        await moveChromeBookmark(batch[j].url, sanitized.category, sanitized.subcategory);
        categorized++;
      }
      processed++;
    }

    if (onProgress) onProgress(processed, uncategorized.length);
  }

  // Remove now-empty folders (e.g. leftover Uncategorized)
  if (categorized > 0) await cleanupEmptyFolders();

  return { processed, categorized, errors };
}

/**
 * Get all uncategorized bookmarks with details for review.
 */
export async function getUncategorizedBookmarks() {
  const all = await getActiveBookmarks();
  return all.filter(b => b.category === 'Uncategorized' || !b.category);
}
