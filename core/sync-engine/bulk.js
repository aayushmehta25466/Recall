import { extractMetadata } from '../metadata-extractor/extractor.js';
import { inferContentType } from '../metadata-extractor/inferrence.js';
import { getDomainMapping } from '../taxonomy/domainMappings.js';
import { getScoreForKeywords } from '../taxonomy/keywordRules.js';
import { classifyWithAI } from '../ai-classifier/classifier.js';
import { createBookmark } from '../../shared/types/bookmark.js';
import { saveBookmark, getBookmark } from '../../database/indexeddb/db.js';
import { moveBookmarkToCategory, cleanupEmptyFolders, clearFolderCache, mergeDuplicateEngineFolders } from '../folder-manager/manager.js';
import { parseEngineFolderPath } from '../folder-manager/paths.js';
import { normalizeUrl } from '../duplicate-detector/detector.js';
import { getSettings } from '../../shared/settings.js';
import { validateSubcategory } from '../taxonomy/categories.js';
import { api, broadcast } from '../../shared/platform.js';

const SKIP_PROTOCOLS = ['chrome:', 'chrome-extension:', 'about:', 'file:', 'javascript:'];
const SKIP_DOMAINS = ['chromewebstore.google.com', 'chrome.google.com'];
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

// Walk the tree into a flat list. The root container and its immediate children
// (the bar on Chrome, "Bookmarks Toolbar" on Firefox) are the browser's own
// chrome, not user folders — they never contribute to `chromeFolder`. This keeps
// the stored path in the same shape getFolderPath() produces, without depending
// on engine-specific node ids ("1" vs "toolbar_____").
function flattenTree(nodes, parentPath = '', arr = [], depth = 0) {
  for (const node of nodes) {
    const contributes = !node.url && depth >= 2 && node.title;
    const currentPath = contributes
      ? (parentPath ? `${parentPath} / ${node.title}` : node.title)
      : parentPath;

    if (node.url) {
      arr.push({ ...node, chromeFolder: parentPath || '' });
    }
    if (node.children) {
      flattenTree(node.children, currentPath, arr, depth + 1);
    }
  }
  return arr;
}

function sendProgress(current, total, url) {
  broadcast({ type: 'SYNC_PROGRESS', current, total, url });
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
 *
 * `useAI` lets a caller keep AI opt-in (bookmark creation uses the
 * `autoAiCategorize` setting); bulk sync leaves it on.
 */
export async function classifyBookmark(metadata, url, settings, { useAI = true } = {}) {
  const fast = classifyFast(metadata, url, settings);
  if (fast.category !== 'Uncategorized') return fast;

  if (useAI && settings.openrouterApiKey) {
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
 * Returns { url, category, subcategory } when the bookmark still needs a native
 * move, or null when it is already where it belongs.
 *
 * Order matters — it keeps expensive work off already-handled bookmarks:
 *   1. Anything inside the engine tree is trusted from its folder path.
 *   2. A real category already in IndexedDB is kept (moved only if never placed).
 *   3. Only genuinely unknown bookmarks are fetched and classified (fast → AI).
 */
async function processBookmark(node, settings, processedUrls) {
  const norm = normalizeUrl(node.url);
  if (processedUrls.has(norm)) return null;
  processedUrls.add(norm);

  const chromeFolder = node.chromeFolder || '';

  if (!canFetch(node.url)) {
    const bookmarkObj = createBookmark({
      url: node.url,
      title: node.title,
      chromeFolder,
      category: 'Uncategorized',
      dateAdded: new Date(node.dateAdded || Date.now()).toISOString()
    });
    await saveBookmark(bookmarkObj);
    return null;
  }

  // 1. Already filed inside the engine tree (by a past run, or by the user):
  //    read the category off the folder path and stop. No fetch, no AI, no move.
  //    This is what makes install/re-run syncs idempotent.
  const organized = parseEngineFolderPath(chromeFolder);
  if (organized) {
    console.log(`Bookmark already organized: ${node.url} → ${organized.category} / ${organized.subcategory}`);
    const bookmarkObj = createBookmark({
      url: node.url,
      title: node.title,
      category: organized.category,
      subcategory: organized.subcategory,
      chromeFolder,
      dateAdded: new Date(node.dateAdded || Date.now()).toISOString()
    });
    await saveBookmark(bookmarkObj);
    return null;
  }

  // 2. Already classified in IndexedDB: keep the category and never re-fetch.
  //    Only queue a move for a bookmark that isn't in any folder yet — one the
  //    user has placed somewhere is respected as-is rather than dragged back.
  const existing = await getBookmark(node.url);
  if (existing && existing.category && existing.category !== 'Uncategorized') {
    const category = existing.category;
    const subcategory = existing.subcategory || '';
    const bookmarkObj = createBookmark({
      url: node.url,
      title: node.title,
      category,
      subcategory,
      chromeFolder,
      dateAdded: new Date(node.dateAdded || Date.now()).toISOString()
    });
    await saveBookmark(bookmarkObj);
    return chromeFolder ? null : { url: node.url, category, subcategory };
  }

  // 3. Genuinely new: fetch metadata, classify (fast rules → AI fallback), and
  //    let phase 2 move it into the engine tree.
  const html = await fetchHtml(node.url);
  const metadata = extractMetadata(html, node.url);
  const contentType = inferContentType(metadata, node.url);
  const { category, subcategory } = await classifyBookmark(metadata, node.url, settings);

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
    chromeFolder,
    dateAdded: new Date(node.dateAdded || Date.now()).toISOString()
  });
  await saveBookmark(bookmarkObj);
  return { url: node.url, category, subcategory };
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
  const tree = await api.bookmarks.getTree();
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
    await mapWithLimit(moveToQueue, CONCURRENT_LIMIT, async ({ url, category, subcategory }) => {
      try {
        await moveBookmarkToCategory(url, category, subcategory);
      } catch (e) {
        console.warn('Failed to move bookmark:', url, e);
      }
    });
    await cleanupEmptyFolders();
    await mergeDuplicateEngineFolders(); // cleanup again after moves
  }

  sendProgress(total, total, '');
  console.log('Bulk sync completed.');
}
