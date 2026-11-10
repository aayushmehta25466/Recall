import { getSettings } from '../../shared/settings.js';
import { getActiveBookmarks, updateBookmark } from '../../database/indexeddb/db.js';
import { moveBookmarkToCategory, getFolderPath } from '../folder-manager/manager.js';
import { findMatchingRuleIn, normalizeRules } from '../taxonomy/ruleEngine.js';

function domainFromUrl(url) {
  try {
    return new URL(url).hostname;
  } catch {
    return '';
  }
}

function contextFor(bookmark) {
  return {
    url: bookmark.url || '',
    domain: bookmark.domain || domainFromUrl(bookmark.url),
    title: bookmark.title || '',
    description: bookmark.description || '',
    siteName: bookmark.siteName || '',
    author: bookmark.author || '',
    language: bookmark.language || '',
    keywords: Array.isArray(bookmark.keywords) ? bookmark.keywords : [],
    tags: Array.isArray(bookmark.tags) ? bookmark.tags : [],
    contentType: bookmark.contentType || '',
    category: bookmark.category || '',
  };
}

function sameList(a, b) {
  if (a.length !== b.length) return false;
  return a.every((value, i) => value === b[i]);
}

/**
 * Pure planning step: returns only the bookmarks a rule would change.
 * Never emits an Uncategorized result and never clears a category.
 */
export function planRuleApplication(bookmarks, settings) {
  const updates = [];
  // Normalize once — applying to a large library otherwise re-validates the
  // whole ruleset for every bookmark.
  const rules = normalizeRules(settings);

  for (const bookmark of bookmarks) {
    if (!bookmark?.url) continue;
    const match = findMatchingRuleIn(contextFor(bookmark), rules);
    if (!match || match.category === 'Uncategorized') continue;

    const existingTags = Array.isArray(bookmark.tags) ? bookmark.tags : [];
    const tags = match.tags?.length
      ? [...new Set([...existingTags, ...match.tags])]
      : existingTags;

    const category = match.category;
    const subcategory = match.subcategory || '';
    const unchanged =
      category === (bookmark.category || '') &&
      subcategory === (bookmark.subcategory || '') &&
      sameList(tags, existingTags);
    if (unchanged) continue;

    updates.push({ url: bookmark.url, category, subcategory, tags });
  }

  return updates;
}

/**
 * Apply the current ruleset to every active bookmark: update the record and
 * move the native Chrome bookmark into the matching folder.
 * Returns the number of bookmarks updated.
 */
export async function applyRulesToExisting() {
  const settings = await getSettings();
  const bookmarks = await getActiveBookmarks();
  const updates = planRuleApplication(bookmarks, settings);

  for (const update of updates) {
    await updateBookmark(update.url, {
      category: update.category,
      subcategory: update.subcategory,
      tags: update.tags,
    });

    try {
      await moveBookmarkToCategory(update.url, update.category, update.subcategory);
      await updateBookmark(update.url, {
        chromeFolder: getFolderPath(update.category, update.subcategory),
      });
    } catch (e) {
      console.warn(`Rule move failed for ${update.url}:`, e.message);
    }
  }

  return updates.length;
}
