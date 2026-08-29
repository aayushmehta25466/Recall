import { getActiveBookmarks } from '../../database/indexeddb/db.js';

const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';

/**
 * AI-powered semantic search. Sends query + bookmark summaries to AI,
 * returns ranked list of matching URLs.
 * Only used when local search returns < 3 results and query has > 3 words.
 */
export async function semanticSearch(query, settings) {
  if (!settings.openrouterApiKey || !settings.semanticSearch) return [];
  if (query.split(/\s+/).length < 3) return [];

  const bookmarks = await getActiveBookmarks();
  if (bookmarks.length === 0) return [];

  // Build a compact index of bookmarks (title + url + category + tags)
  const summaries = bookmarks.slice(0, 200).map((b, i) =>
    `[${i}] ${b.title || 'untitled'} | ${b.category || 'Uncategorized'} | ${(b.tags || []).join(',')} | ${b.url}`
  ).join('\n');

  const systemPrompt = `You are a bookmark search engine. Given a user query and a list of bookmarks, return the indices of the most relevant bookmarks ranked by relevance.

Reply with ONLY a JSON array of indices, most relevant first. Example: [3, 17, 42]
If nothing matches, reply with empty array: []`;

  const userPrompt = `Query: ${query}

Bookmarks:
${summaries}`;

  try {
    const res = await fetch(OPENROUTER_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${settings.openrouterApiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'chrome-extension://recall',
        'X-Title': 'Bookmark Engine',
      },
      body: JSON.stringify({
        model: settings.openrouterModel || 'openrouter/free',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        temperature: 0,
        max_tokens: 200,
      }),
    });

    if (!res.ok) return [];
    const data = await res.json();
    const content = data.choices?.[0]?.message?.content?.trim();
    if (!content) return [];

    const jsonStr = content.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    const indices = JSON.parse(jsonStr);

    if (!Array.isArray(indices)) return [];

    // Map indices back to bookmarks
    return indices
      .filter(i => i >= 0 && i < bookmarks.length)
      .map(i => bookmarks[i])
      .slice(0, 10);
  } catch (e) {
    console.error('Semantic search failed:', e);
    return [];
  }
}
