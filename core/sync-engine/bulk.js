import { extractMetadata } from '../metadata-extractor/extractor.js';
import { inferContentType } from '../metadata-extractor/inferrence.js';
import { getDomainMapping } from '../taxonomy/domainMappings.js';
import { getScoreForKeywords } from '../taxonomy/keywordRules.js';
import { classifyWithAI } from '../ai-classifier/classifier.js';
import { createBookmark } from '../../shared/types/bookmark.js';
import { saveBookmark, getBookmark } from '../../database/indexeddb/db.js';
import { moveBookmarkToCategory, cleanupEmptyFolders, clearFolderCache, mergeDuplicateEngineFolders } from '../folder-manager/manager.js';
import { normalizeUrl } from '../duplicate-detector/detector.js';
import { getSettings } from '../../shared/settings.js';
import { validateSubcategory } from '../taxonomy/categories.js';

import { CATEGORIES } from '../../shared/types/taxonomy.js';

const SKIP_PROTOCOLS = ['chrome:', 'chrome-extension:', 'about:', 'file:', 'javascript:'];
const SKIP_DOMAINS = ['chromewebstore.google.com', 'chrome.google.com'];
const VALID_CATEGORIES = Object.values(CATEGORIES);
// ponytail: 10 concurrent fetches — fast enough to not hammer servers,
// slow enough to avoid Chrome extension fetch quotas.
const CONCURRENT_LIMIT = 10;

function canFetch(url) {
  try {
    const u = new URL(url);
    if (SKIP_PROTOCOLS.includes(u.protocol)) return false;
    if (SKIP_DOMAINS.some(d => u.hostname === d || u.hostname.endsWith('.' + d))) return false;
    return true;
  } catch {
    return false;
  }
}

function flattenTree(nodes, parentPath = '', arr = []) {
  for (const node of nodes) {
    const currentPath = (node.id && !node.url && node.title && !['0', '1', '2'].includes(node.id))
      ? (parentPath ? `${parentPath} / ${node.title}` : node.title)
      : parentPath;

    if (node.url) {
      arr.push({ ...node, chromeFolder: parentPath || '' });
    }
    if (node.children) {
      flattenTree(node.children, currentPath, arr);
    }
  }
  return arr;
}

function sendProgress(current, total, url) {
  chrome.runtime.sendMessage({
    type: 'SYNC_PROGRESS',
    current,
    total,
    url,
  }).catch(() => {});
}

/**
 * Fast classification: custom rules → domain → keywords. No AI, no network.
 * Used for instant save during sync and new bookmark creation.
 */
export function classifyFast(metadata, url, settings) {
  // 1. Custom domain mappings
  if (settings.customDomainMappings?.[metadata.domain]) {
    const custom = settings.customDomainMappings[metadata.domain];
    const cat = custom.category;
    const sub = validateSubcategory(cat, custom.subcategory || '');
    return { category: cat, subcategory: sub };
  }

  // 2. Built-in domain mappings
  const domainMatch = getDomainMapping(metadata.domain);
  if (domainMatch) {
    const cat = domainMatch.category;
    const sub = validateSubcategory(cat, domainMatch.subcategory);
    return { category: cat, subcategory: sub };
  }

  // 3. Keyword scoring — keys are now "Category/Group/Leaf"
  const fullText = `${metadata.title} ${metadata.description} ${metadata.keywords.join(' ')} ${url}`;
  const scores = getScoreForKeywords(fullText);
  let topScore = 0;
  let topKey = null;
  for (const [key, score] of Object.entries(scores)) {
    if (score > topScore) {
      topScore = score;
      topKey = key;
    }
  }
  if (topKey) {
    // Key format: "Development/Web / Frontend" — split on first "/" only
    const firstSlash = topKey.indexOf('/');
    const cat = topKey.substring(0, firstSlash);
    const sub = topKey.substring(firstSlash + 1);
    return { category: cat, subcategory: validateSubcategory(cat, sub) };
  }

  return { category: 'Uncategorized', subcategory: '' };
}

/**
 * Full classification: fast rules → AI fallback.
 */
export async function classifyBookmark(metadata, url, settings) {
  const fast = classifyFast(metadata, url, settings);
  if (fast.category !== 'Uncategorized') return fast;

  if (settings.openrouterApiKey) {
    const aiResult = await classifyWithAI({ ...metadata, url }, settings);
    if (aiResult) {
      return { category: aiResult.category, subcategory: aiResult.subcategory };
    }
  }

  // Log why this bookmark is uncategorized
  console.log(`Uncategorized: ${url} (domain: ${metadata.domain}, title: ${metadata.title?.substring(0, 50)})`);
  return fast;
}

async function fetchHtml(url) {
  try {
    const res = await fetch(url, { redirect: 'follow' });
    if (!res.ok) return '';
    const ct = res.headers.get('content-type') || '';
    if (!ct.includes('text/html')) return '';
    return await res.text();
  } catch {
    return '';
  }
}

/**
 * Process a single bookmark: fetch metadata, classify, save to IndexedDB.
 * Returns { chromeId, category, subcategory } for Chrome folder move, or null.
 */
async function processBookmark(node, settings, processedUrls) {
  const norm = normalizeUrl(node.url);
  if (processedUrls.has(norm)) return null;
  processedUrls.add(norm);

  if (!canFetch(node.url)) {
    const bookmarkObj = createBookmark({
      url: node.url,
      title: node.title,
      chromeFolder: node.chromeFolder || '',
      category: 'Uncategorized',
      dateAdded: new Date(node.dateAdded || Date.now()).toISOString()
    });
    await saveBookmark(bookmarkObj);
    return null;
  }

  // Check if bookmark is already in an Engine Organized folder
  const chromeFolder = node.chromeFolder || '';
  let isOrganized = chromeFolder.startsWith('Engine Organized');

  // Preserve existing categories — but reclassify if Uncategorized
  const existing = await getBookmark(node.url);
  const hasRealCategory = existing && existing.category && existing.category !== 'Uncategorized';

  let category, subcategory;

  if (isOrganized) {
    // Extract category/subcategory from Chrome folder path
    // "Engine Organized / Development / Web / Frontend" → category="Development", subcategory="Web / Frontend"
    const parts = chromeFolder.split(' / ').map(s => s.trim()).filter(Boolean);
    // Skip "Engine Organized" (index 0), category is index 1, rest is subcategory
    const extractedCategory = parts[1] || 'Uncategorized';
    const extractedSubcategory = parts.length > 2 ? parts.slice(2).join(' / ') : '';

    // Validate category against taxonomy — if invalid, fall back to AI classification
    if (VALID_CATEGORIES.includes(extractedCategory)) {
      category = extractedCategory;
      subcategory = extractedSubcategory;
      console.log(`Bookmark already organized: ${node.url} → ${category} / ${subcategory}`);
    } else {
      console.log(`Invalid category "${extractedCategory}" in Chrome folder, reclassifying: ${node.url}`);
      isOrganized = false; // Fall through to classification
    }
  }

  if (!isOrganized && hasRealCategory) {
    // Keep existing real category from IndexedDB
    category = existing.category;
    subcategory = existing.subcategory || '';
  } else {
    // Need to classify — fetch metadata and use AI
    const html = await fetchHtml(node.url);
    const metadata = extractMetadata(html, node.url);
    const contentType = inferContentType(metadata, node.url);
    ({ category, subcategory } = await classifyBookmark(metadata, node.url, settings));

    const bookmarkObj = createBookmark({
      url: node.url,
      title: metadata.title || node.title,
      description: metadata.description,
      siteName: metadata.siteName,
      domain: metadata.domain,
      language: metadata.language,
      author: metadata.author,
      keywords: metadata.keywords,
      contentType,
      category,
      subcategory,
      chromeFolder: node.chromeFolder || '',
      dateAdded: new Date(node.dateAdded || Date.now()).toISOString()
    });
    await saveBookmark(bookmarkObj);
    return { chromeId: node.id, category, subcategory };
  }

  // Save to IndexedDB (for organized or existing bookmarks — no fetch needed)
  const bookmarkObj = createBookmark({
    url: node.url,
    title: node.title,
    category,
    subcategory,
    chromeFolder: node.chromeFolder || '',
    dateAdded: new Date(node.dateAdded || Date.now()).toISOString()
  });
  await saveBookmark(bookmarkObj);
  return null; // No need to move — already in correct folder
}

/**
 * Run N promises concurrently with a limit.
 */
async function mapWithLimit(items, limit, fn) {
  const results = [];
  let i = 0;
  async function worker() {
    while (i < items.length) {
      const idx = i++;
      results[idx] = await fn(items[idx], idx);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, () => worker()));
  return results;
}

/**
 * Bulk sync with parallel fetching and Chrome moves.
 */
export async function runBulkSync(moveInChrome = true) {
  console.log('Starting bulk sync...');
  clearFolderCache();
  await mergeDuplicateEngineFolders(); // ponytail: merge any duplicate folders first
  const settings = await getSettings();
  const tree = await chrome.bookmarks.getTree();
  const allBookmarks = flattenTree(tree);
  const total = allBookmarks.length;
  console.log(`Bulk sync: ${total} bookmarks found in Chrome`);

  sendProgress(0, total, '');

  const processedUrls = new Set();
  let processed = 0;
  let saved = 0;
  let skipped = 0;
  let failed = 0;
  const moveToQueue = [];

  // Phase 1: Process bookmarks concurrently (fetch + classify + save)
  const results = await mapWithLimit(allBookmarks, CONCURRENT_LIMIT, async (node, idx) => {
    try {
      const result = await processBookmark(node, settings, processedUrls);
      processed++;
      if (result) {
        saved++;
        moveToQueue.push(result);
      } else if (processedUrls.has(normalizeUrl(node.url))) {
        skipped++;
      }
      sendProgress(processed, total, node.url);
      return result;
    } catch (e) {
      processed++;
      failed++;
      console.warn('Failed on', node.url, e);
      sendProgress(processed, total, node.url);
      return null;
    }
  });

  console.log(`Bulk sync phase 1 done: ${saved} saved, ${skipped} skipped (dupes), ${failed} failed`);

  // Phase 2: Move bookmarks in Chrome concurrently
  if (moveInChrome && moveToQueue.length > 0) {
    console.log(`Phase 2: Moving ${moveToQueue.length} bookmarks in Chrome...`);
    await mapWithLimit(moveToQueue, CONCURRENT_LIMIT, async ({ chromeId, category, subcategory }) => {
      try {
        await moveBookmarkToCategory(chromeId, category, subcategory);
      } catch (e) {
        console.warn('Failed to move bookmark:', chromeId, e);
      }
    });
    await cleanupEmptyFolders();
  }

  sendProgress(total, total, '');
  console.log('Bulk sync completed.');
}
