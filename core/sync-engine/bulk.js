import { extractMetadata } from '../metadata-extractor/extractor.js';
import { inferContentType } from '../metadata-extractor/inferrence.js';
import { getDomainMapping } from '../taxonomy/domainMappings.js';
import { getScoreForKeywords } from '../taxonomy/keywordRules.js';
import { classifyWithAI } from '../ai-classifier/classifier.js';
import { createBookmark } from '../../shared/types/bookmark.js';
import { saveBookmark, getBookmark } from '../../database/indexeddb/db.js';
import { moveBookmarkToCategory, cleanupEmptyFolders } from '../folder-manager/manager.js';
import { normalizeUrl } from '../duplicate-detector/detector.js';
import { getSettings } from '../../shared/settings.js';

const SKIP_PROTOCOLS = ['chrome:', 'chrome-extension:', 'about:', 'file:', 'javascript:'];
const SKIP_DOMAINS = ['chromewebstore.google.com', 'chrome.google.com'];

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
    // Build folder path: skip root nodes (id "0", "1", "2")
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
    return { category: custom.category, subcategory: custom.subcategory || '' };
  }

  // 2. Built-in domain mappings
  const domainMatch = getDomainMapping(metadata.domain);
  if (domainMatch) {
    return { category: domainMatch.category, subcategory: domainMatch.subcategory };
  }

  // 3. Keyword scoring
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
    const [cat, subcat] = topKey.split('/');
    return { category: cat, subcategory: subcat };
  }

  return { category: 'Uncategorized', subcategory: '' };
}

/**
 * Full classification: fast rules → AI fallback.
 * Used by batch categorizer for uncategorized bookmarks.
 */
export async function classifyBookmark(metadata, url, settings) {
  const fast = classifyFast(metadata, url, settings);
  if (fast.category !== 'Uncategorized') return fast;

  // AI fallback
  if (settings.openrouterApiKey) {
    const aiResult = await classifyWithAI({ ...metadata, url }, settings);
    if (aiResult) {
      return { category: aiResult.category, subcategory: aiResult.subcategory };
    }
  }

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
 * Bulk sync: Phase 1 — save all to IndexedDB with fast classification.
 * Phase 2 — move in Chrome after all saved.
 */
export async function runBulkSync(moveInChrome = true) {
  console.log('Starting bulk sync...');
  const settings = await getSettings();
  const tree = await chrome.bookmarks.getTree();
  const allBookmarks = flattenTree(tree);
  const total = allBookmarks.length;
  console.log(`Bulk sync: ${total} bookmarks found in Chrome`);

  sendProgress(0, total, '');

  const processedUrls = new Set();
  const moveToQueue = [];
  let current = 0;
  let saved = 0;
  let skipped = 0;
  let failed = 0;

  // ─── Phase 1: Fetch + classify fast + save to IndexedDB ───
  for (const node of allBookmarks) {
    current++;
    const norm = normalizeUrl(node.url);
    if (processedUrls.has(norm)) {
      skipped++;
      sendProgress(current, total, node.url);
      continue;
    }
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
      saved++;
      sendProgress(current, total, node.url);
      continue;
    }

    try {
      // Preserve existing categories — never wipe AI/user-categorized bookmarks.
      // Uncategorized (or missing) records get re-classified on every sync.
      const existing = await getBookmark(node.url);
      const hasRealCategory = existing && existing.category && existing.category !== 'Uncategorized';

      let category, subcategory;
      if (hasRealCategory) {
        category = existing.category;
        subcategory = existing.subcategory || '';
      } else {
        const html = await fetchHtml(node.url);
        const metadata = extractMetadata(html, node.url);
        ({ category, subcategory } = await classifyBookmark(metadata, node.url, settings));
      }

      const html = await fetchHtml(node.url);
      const metadata = extractMetadata(html, node.url);
      const contentType = inferContentType(metadata, node.url);

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
      saved++;

      if (moveInChrome && node.id) {
        moveToQueue.push({ chromeId: node.id, category, subcategory });
      }

      sendProgress(current, total, node.url);
    } catch (e) {
      failed++;
      console.warn('Failed on', node.url, e);
      sendProgress(current, total, node.url);
    }
  }

  console.log(`Bulk sync phase 1 done: ${saved} saved, ${skipped} skipped (dupes), ${failed} failed`);

  // ─── Phase 2: Move bookmarks in Chrome (after all saved to DB) ───
  if (moveToQueue.length > 0) {
    console.log(`Phase 2: Moving ${moveToQueue.length} bookmarks in Chrome...`);
    for (const { chromeId, category, subcategory } of moveToQueue) {
      try {
        await moveBookmarkToCategory(chromeId, category, subcategory);
      } catch (e) {
        console.warn('Failed to move bookmark:', chromeId, e);
      }
    }
    await cleanupEmptyFolders();
  }

  sendProgress(total, total, '');
  console.log('Bulk sync completed.');
}
