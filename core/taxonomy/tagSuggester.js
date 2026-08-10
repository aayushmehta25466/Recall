import { getActiveBookmarks, updateBookmark } from '../../database/indexeddb/db.js';

const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';

const SYSTEM_PROMPT = `You are a tag suggester for bookmarks. Given a list of bookmarks, suggest 2-5 concise, relevant tags for each.

Reply with ONLY a JSON object mapping each bookmark index to an array of tag strings.
Example: {"0": ["react", "tutorial"], "1": ["news", "tech"]}

Rules:
- Tags should be lowercase, hyphenated if multi-word (e.g. "machine-learning")
- Be specific but not overly narrow
- Prefer existing tags when they fit
- Max 5 tags per bookmark`;

/**
 * Suggest tags for a batch of bookmarks using AI.
 * Returns a map of { index: [tags] }.
 */
async function suggestTagsForBatch(bookmarks, settings) {
  const batch = bookmarks.map((b, i) =>
    `[${i}] ${b.title || 'untitled'} | ${b.url} | ${b.category || ''} | ${b.description || ''}`
  ).join('\n');

  const userPrompt = `Suggest tags for these bookmarks:\n${batch}`;

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
        temperature: 0.2,
        max_tokens: 500,
      }),
    });

    if (!res.ok) return {};
    const data = await res.json();
    const content = data.choices?.[0]?.message?.content?.trim();
    if (!content) return {};

    const jsonStr = content.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    const parsed = JSON.parse(jsonStr);
    return typeof parsed === 'object' && parsed !== null ? parsed : {};
  } catch {
    return {};
  }
}

/**
 * Run tag suggestions for all bookmarks without tags.
 * Processes in batches of 20.
 */
export async function runTagSuggestions(settings, onProgress) {
  if (!settings.openrouterApiKey || !settings.aiTagSuggest) return 0;

  const all = await getActiveBookmarks();
  const untagged = all.filter(b => !b.tags || b.tags.length === 0);
  if (untagged.length === 0) return 0;

  const BATCH_SIZE = 20;
  let totalSuggested = 0;

  for (let i = 0; i < untagged.length; i += BATCH_SIZE) {
    const batch = untagged.slice(i, i + BATCH_SIZE);
    const suggestions = await suggestTagsForBatch(batch, settings);

    for (let j = 0; j < batch.length; j++) {
      const tags = suggestions[String(j)];
      if (Array.isArray(tags) && tags.length > 0) {
        await updateBookmark(batch[j].url, { tags });
        totalSuggested++;
      }
    }

    if (onProgress) {
      onProgress(Math.min(i + BATCH_SIZE, untagged.length), untagged.length);
    }
  }

  return totalSuggested;
}
