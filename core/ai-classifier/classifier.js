import { CATEGORIES } from '../../shared/types/taxonomy.js';
import { validateSubcategory, buildTaxonomyPrompt } from '../taxonomy/categories.js';

const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';

const VALID_CATEGORIES = Object.values(CATEGORIES).filter(c => c !== CATEGORIES.UNCATEGORIZED);

const TAXONOMY_TEXT = buildTaxonomyPrompt();

const SYSTEM_PROMPT = `You are a bookmark classifier. Given a bookmark's URL, title, and description, assign it to the best category and subcategory.

ALLOWED HIERARCHICAL CATEGORY → SUBCATEGORY structure (closed list — nothing else exists):
${TAXONOMY_TEXT}

Reply with ONLY a JSON object, no other text:
{"category": "Category", "subcategory": "Group / Leaf"}

Rules:
- "category" MUST be one of: ${VALID_CATEGORIES.join(', ')}
- "subcategory" MUST be the FULL PATH in format "Group / Leaf" — e.g. "Web / Frontend", "Data & AI / ML", "Content / Tutorials"
- NEVER invent new groups or leaves — only use what's listed above
- If no subcategory fits well, use "" (empty string)
- If nothing fits at all, use "Uncategorized" with empty subcategory
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
        'HTTP-Referer': 'chrome-extension://recall',
        'X-Title': 'Recall',
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
      const rawSub = typeof parsed.subcategory === 'string' ? parsed.subcategory.trim() : '';
      const sub = validateSubcategory(parsed.category, rawSub);
      const result = {
        category: parsed.category,
        subcategory: sub,
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
