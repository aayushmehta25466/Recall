import { CATEGORIES } from '../../shared/types/taxonomy.js';

export const taxonomyTree = {
  [CATEGORIES.DEVELOPMENT]: [
    'Frontend', 'Backend', 'Mobile', 'DevOps', 'Cloud', 'Security', 
    'Database', 'API', 'AI', 'ML', 'LLM', 'Robotics', 'Open Source', 
    'Programming Languages', 'Documentation', 'Architecture', 'Testing', 'Extensions'
  ],
  [CATEGORIES.LEARNING]: [
    'Courses', 'Tutorials', 'Videos', 'Blogs', 'Books', 
    'Cheat Sheets', 'References', 'Research Papers', 'Lectures'
  ],
  [CATEGORIES.BUSINESS]: [
    'SaaS', 'Marketing', 'Finance', 'Legal', 'HR', 
    'Accounting', 'Sales', 'Startups', 'Product Management', 'Analytics'
  ],
  [CATEGORIES.DESIGN]: [
    'UI/UX', 'Inspiration', 'Tools', 'Typography', 'Colors', 
    'Icons', 'Illustrations', 'Assets', 'Guidelines'
  ],
  [CATEGORIES.PRODUCTIVITY]: [
    'Task Management', 'Note Taking', 'Calendars', 'Collaboration', 'Communication'
  ],
  [CATEGORIES.ENTERTAINMENT]: [
    'Gaming', 'Movies', 'Music', 'Streaming', 'Hobbies', 'Humor', 'Comics'
  ],
  [CATEGORIES.NEWS_MEDIA]: [
    'Tech News', 'World News', 'Magazines', 'Newsletters', 'Podcasts'
  ],
  [CATEGORIES.SHOPPING]: [
    'Electronics', 'Clothing', 'Home', 'Books', 'Software', 'Subscriptions'
  ],
  [CATEGORIES.PERSONAL]: [
    'Travel', 'Health', 'Recipes', 'Finances', 'Fitness', 'Real Estate', 'Vehicles'
  ]
};

export function isValidSubcategory(category, subcategory) {
  if (!taxonomyTree[category]) return false;
  return taxonomyTree[category].includes(subcategory);
}
