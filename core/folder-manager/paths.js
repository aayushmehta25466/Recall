import { CATEGORIES } from '../../shared/types/taxonomy.js';
import { validateSubcategory } from '../taxonomy/categories.js';

/**
 * Root folder name for everything the engine files natively.
 * Single source of truth for folder creation, path building, and detection.
 */
export const ENGINE_ROOT_FOLDER = 'Engine Organized';

/**
 * Build the native Chrome folder path for a category/subcategory pair.
 * Mirrors the hierarchy created by getTargetFolderId().
 * "Development" + "Web / Frontend" → "Engine Organized / Development / Web / Frontend"
 */
export function getFolderPath(category, subcategory) {
  let path = `${ENGINE_ROOT_FOLDER} / ${category}`;
  if (subcategory) path += ` / ${subcategory}`;
  return path;
}

/**
 * Inverse of getFolderPath: read the category/subcategory back out of a native
 * folder path.
 *
 * Returns null when the bookmark is NOT inside the engine tree. Otherwise returns
 * { category, subcategory }; an unrecognized category folder resolves to
 * "Uncategorized" (never sent to AI — the user's arrangement is preserved).
 *
 * Tolerant by design: the engine root may appear anywhere in the path (a browser
 * bar folder can prefix it, e.g. Firefox "Bookmarks Toolbar / Engine Organized / …"),
 * and both the root and category comparisons are case-insensitive.
 */
export function parseEngineFolderPath(chromeFolder) {
  if (!chromeFolder) return null;

  const parts = chromeFolder.split(' / ').map(s => s.trim()).filter(Boolean);
  const rootIndex = parts.findIndex(p => p.toLowerCase() === ENGINE_ROOT_FOLDER.toLowerCase());
  if (rootIndex === -1) return null;

  const rawCategory = parts[rootIndex + 1] || '';
  const category = Object.values(CATEGORIES)
    .find(c => c.toLowerCase() === rawCategory.toLowerCase());

  if (!category) return { category: CATEGORIES.UNCATEGORIZED, subcategory: '' };

  const rawSub = parts.slice(rootIndex + 2).join(' / ');
  return { category, subcategory: validateSubcategory(category, rawSub) };
}
