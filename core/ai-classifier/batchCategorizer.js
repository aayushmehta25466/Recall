import { CATEGORIES } from '../../shared/types/taxonomy.js';
import { updateBookmark, getActiveBookmarks } from '../../database/indexeddb/db.js';

const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';
const VALID_CATEGORIES = Object.values(CATEGORIES).filter(c => c !== CATEGORIES.UNCATEGORIZED);
const BATCH_SIZE = 3;

const SYSTEM_PROMPT = `Classify bookmarks into exactly one category. Reply with ONLY a JSON object, nothing else.

Categories: Development, Learning, Business, Design, Productivity, Entertainment, News & Media, Shopping, Personal

Output format: {"0":{"category":"...","subcategory":"...","tags":["..."]}}

subcategory = short label like "Frontend", "Videos", "Research"
tags = 2-3 lowercase hyphenated tags like "react-tutorial"`;

const SUBCATEGORY_PROMPT = `You are a bookmark classifier. Reply with ONLY valid JSON. No prose, no explanation.`;

/**
 * Send a batch of uncategorized bookmarks to AI for classification.
 * Returns map of { index: { category, subcategory, tags } }.
 */
async function classifyBatch(bookmarks, settings) {
  const userPrompt = bookmarks.map((b, i) =>
    `[${i}] "${b.title || 'untitled'}" — ${b.url}`
  ).join('\n');
  let raw = '';

  try {
    const res = await fetch(OPENROUTER_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${settings.openrouterApiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'chrome-extension://bookmark-engine',
        'X-Title': 'Bookmark Engine',
      },
      body: JSON.stringify({
        model: settings.openrouterModel || 'openrouter/free',
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: userPrompt },
        ],
        temperature: 0,
        max_tokens: 1500,
      }),
    });

    if (!res.ok) {
      console.error(`OpenRouter API error: ${res.status} ${res.statusText}`);
      const errBody = await res.text().catch(() => '');
      console.error('Response body:', errBody);
      return {};
    }
    const data = await res.json();
    raw = data.choices?.[0]?.message?.content?.trim();
    if (!raw) {
      console.warn('OpenRouter returned empty content:', JSON.stringify(data));
      return {};
    }

    // Try to extract JSON object from response (model may wrap it in prose)
    let jsonStr = raw.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    // Find first { to last } in case model added prose before/after
    const firstBrace = jsonStr.indexOf('{');
    const lastBrace = jsonStr.lastIndexOf('}');
    if (firstBrace !== -1 && lastBrace > firstBrace) {
      jsonStr = jsonStr.substring(firstBrace, lastBrace + 1);
    }
    // Normalize single quotes to double quotes
    jsonStr = jsonStr.replace(/'/g, '"');
    const parsed = JSON.parse(jsonStr);
    return typeof parsed === 'object' && parsed !== null ? parsed : {};
  } catch (e) {
    console.error('Batch classification failed:', e.message);
    console.error('Raw response:', raw?.substring(0, 200));
    return {};
  }
}

/**
 * Run batch AI classification on all uncategorized bookmarks.
 * Returns { processed, categorized } counts.
 */
export async function runBatchCategorize(settings, onProgress) {
  if (!settings.openrouterApiKey) {
    console.warn('Batch categorize: no API key set');
    return { processed: 0, categorized: 0 };
  }

  const all = await getActiveBookmarks();
  const uncategorized = all.filter(b => b.category === 'Uncategorized' || !b.category);
  console.log(`Batch categorize: ${uncategorized.length} uncategorized bookmarks found`);
  if (uncategorized.length === 0) return { processed: 0, categorized: 0 };

  let processed = 0;
  let categorized = 0;

  for (let i = 0; i < uncategorized.length; i += BATCH_SIZE) {
    const batch = uncategorized.slice(i, i + BATCH_SIZE);
    const results = await classifyBatch(batch, settings);

    for (let j = 0; j < batch.length; j++) {
      const result = results[String(j)];
      if (result && result.category && result.category !== 'Uncategorized') {
        await updateBookmark(batch[j].url, {
          category: result.category,
          subcategory: result.subcategory || '',
          tags: result.tags || [],
        });
        categorized++;
      }
      processed++;
    }

    if (onProgress) onProgress(processed, uncategorized.length);
  }

  return { processed, categorized };
}

/**
 * Get all uncategorized bookmarks with details for review.
 */
export async function getUncategorizedBookmarks() {
  const all = await getActiveBookmarks();
  return all.filter(b => b.category === 'Uncategorized' || !b.category);
}
