import { CATEGORIES } from '../../shared/types/taxonomy.js';

/**
 * Hierarchical taxonomy tree.
 * Structure: Category → Group → Subcategory[]
 *
 * A bookmark's subcategory is the full path: "Group / Subcategory"
 * e.g. "Web / Frontend", "Data & AI / ML", "Content / Tutorials"
 *
 * Groups are intermediate folders for visual organization.
 * Leaf nodes are the actual subcategories assigned to bookmarks.
 */
export const taxonomyTree = {
  [CATEGORIES.DEVELOPMENT]: {
    'Web': ['Frontend', 'Backend', 'API', 'Documentation'],
    'Mobile': ['iOS', 'Android'],
    'DevOps & Cloud': ['DevOps', 'Cloud', 'Security'],
    'Data & AI': ['Database', 'AI', 'ML', 'LLM', 'Robotics'],
    'Languages & Tools': ['Programming Languages', 'Architecture', 'Testing', 'Extensions', 'Open Source'],
  },
  [CATEGORIES.LEARNING]: {
    'Content': ['Courses', 'Tutorials', 'Videos', 'Blogs', 'Books', 'Lectures'],
    'References': ['Cheat Sheets', 'References', 'Research Papers'],
  },
  [CATEGORIES.BUSINESS]: {
    'Operations': ['SaaS', 'Marketing', 'Finance', 'Legal', 'HR', 'Accounting', 'Sales'],
    'Strategy': ['Startups', 'Product Management', 'Analytics'],
  },
  [CATEGORIES.DESIGN]: {
    'Visual': ['UI/UX', 'Typography', 'Colors', 'Icons', 'Illustrations', 'Assets'],
    'Resources': ['Inspiration', 'Tools', 'Guidelines'],
  },
  [CATEGORIES.PRODUCTIVITY]: {
    'Tools': ['Task Management', 'Note Taking', 'Calendars', 'Collaboration', 'Communication'],
  },
  [CATEGORIES.ENTERTAINMENT]: {
    'Media': ['Gaming', 'Movies', 'Music', 'Streaming'],
    'Leisure': ['Hobbies', 'Humor', 'Comics'],
  },
  [CATEGORIES.NEWS_MEDIA]: {
    'Sources': ['Tech News', 'World News', 'Magazines', 'Newsletters', 'Podcasts'],
  },
  [CATEGORIES.SHOPPING]: {
    'Products': ['Electronics', 'Clothing', 'Home', 'Books', 'Software', 'Subscriptions'],
  },
  [CATEGORIES.PERSONAL]: {
    'Life': ['Travel', 'Health', 'Recipes', 'Finances', 'Fitness', 'Real Estate', 'Vehicles'],
  },
};

/**
 * Flatten the tree into an array of valid paths: ["Web / Frontend", ...]
 * Used by AI prompts and sanitization.
 */
export function flattenSubcategoryPaths(category) {
  const groups = taxonomyTree[category];
  if (!groups) return [];
  const paths = [];
  for (const [group, leaves] of Object.entries(groups)) {
    for (const leaf of leaves) {
      paths.push(`${group} / ${leaf}`);
    }
  }
  return paths;
}

/**
 * Validate a subcategory path against the taxonomy.
 * Accepts exact match or leaf-only match (backwards compat for old flat values).
 * Returns the canonical path or empty string if invalid.
 */
export function validateSubcategory(category, subcategory) {
  if (!subcategory || typeof subcategory !== 'string') return '';
  const trimmed = subcategory.trim();
  if (!trimmed) return '';

  const paths = flattenSubcategoryPaths(category);

  // Exact path match: "Web / Frontend"
  const exact = paths.find(p => p.toLowerCase() === trimmed.toLowerCase());
  if (exact) return exact;

  // Leaf-only match (backwards compat): "Frontend" → "Web / Frontend"
  const leaf = trimmed.split(' / ').pop().trim();
  const byLeaf = paths.find(p => {
    const parts = p.split(' / ');
    return parts[parts.length - 1].toLowerCase() === leaf.toLowerCase();
  });
  if (byLeaf) return byLeaf;

  // Group-only match: "Web" → first leaf under that group
  for (const [group, leaves] of Object.entries(taxonomyTree[category] || {})) {
    if (group.toLowerCase() === trimmed.toLowerCase()) {
      return `${group} / ${leaves[0]}`;
    }
  }

  return '';
}

/**
 * Backwards-compatible validator (matches old isValidSubcategory signature).
 * Returns true if the subcategory path is valid for the given category.
 */
export function isValidSubcategory(category, subcategory) {
  return validateSubcategory(category, subcategory) !== '';
}

/**
 * Build the taxonomy tree as a formatted string for AI system prompts.
 * Shows the full hierarchy so the model knows exactly what's allowed.
 */
export function buildTaxonomyPrompt() {
  const lines = [];
  for (const [category, groups] of Object.entries(taxonomyTree)) {
    lines.push(`\n${category}:`);
    for (const [group, leaves] of Object.entries(groups)) {
      lines.push(`  ${group}: ${leaves.join(', ')}`);
    }
  }
  return lines.join('\n');
}
