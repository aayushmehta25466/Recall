import { CATEGORIES } from '../../shared/types/taxonomy.js';

const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';

const VALID_CATEGORIES = Object.values(CATEGORIES).filter(c => c !== CATEGORIES.UNCATEGORIZED);

const SYSTEM_PROMPT = `You are a bookmark classifier. Given a bookmark's URL, title, and description, assign it to the best category and subcategory.

Available categories: ${VALID_CATEGORIES.join(', ')}

Reply with ONLY a JSON object, no other text:
{"category": "Category", "subcategory": "Subcategory"}

Rules:
- Pick the single best category from the list above
- Subcategory is a short specific label (e.g. "Frontend", "Videos", "API", "Research Papers")
- If nothing fits, use "Uncategorized" with empty subcategory
- Never add explanations, only JSON`;

// In-memory cache for AI classification results (URL → result)
const aiCache = new Map();
const MAX_CACHE_SIZE = 500;

/**
 * Classify a bookmark using OpenRouter AI.
 * Returns { category, subcategory } or null on failure.
 * Caches results to avoid re-classifying the same URL.
 */
export async function classifyWithAI(metadata, settings) {
  const { openrouterApiKey, openrouterModel } = settings;
  if (!openrouterApiKey) return null;

  const url = metadata.url || '';

  // Check cache first
  if (aiCache.has(url)) {
    return aiCache.get(url);
  }

  const userMessage = `URL: ${url}
Title: ${metadata.title || ''}
Description: ${metadata.description || ''}
Domain: ${metadata.domain || ''}
Keywords: ${(metadata.keywords || []).join(', ')}`;

  try {
    const res = await fetch(OPENROUTER_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${openrouterApiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'chrome-extension://bookmark-engine',
        'X-Title': 'Bookmark Engine',
      },
      body: JSON.stringify({
        model: openrouterModel,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: userMessage },
        ],
        temperature: 0,
        max_tokens: 100,
      }),
    });

    if (!res.ok) {
      console.error('OpenRouter API error:', res.status);
      return null;
    }

    const data = await res.json();
    const content = data.choices?.[0]?.message?.content?.trim();
    if (!content) return null;

    const jsonStr = content.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    const parsed = JSON.parse(jsonStr);

    // Validate against the actual category values
    if (parsed.category && VALID_CATEGORIES.includes(parsed.category)) {
      const result = {
        category: parsed.category,
        subcategory: parsed.subcategory || '',
      };
      // Cache the result
      if (aiCache.size >= MAX_CACHE_SIZE) {
        const firstKey = aiCache.keys().next().value;
        aiCache.delete(firstKey);
      }
      aiCache.set(url, result);
      return result;
    }

    return null;
  } catch (e) {
    console.error('AI classification failed:', e);
    return null;
  }
}
