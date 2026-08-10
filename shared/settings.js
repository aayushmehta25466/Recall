const DEFAULT_SETTINGS = {
  autoOrganize: true,
  duplicatePolicy: 'keep_oldest', // 'keep_oldest' | 'overwrite'
  openrouterApiKey: '',
  openrouterModel: 'openrouter/free',
  // Theme
  theme: 'auto', // 'auto' | 'dark' | 'light'
  // Trash
  trashAutoPurgeDays: 30, // 7 | 30 | 0 (never)
  trashMaxSize: 500,
  // Sort
  defaultSort: 'manual', // 'manual' | 'date_desc' | 'date_asc' | 'title_asc' | 'title_desc' | 'category'
  categoryOrder: [
    'Development', 'Learning', 'Business', 'Design', 'Productivity',
    'Entertainment', 'News & Media', 'Shopping', 'Personal', 'Uncategorized'
  ],
  // Custom rules
  customDomainMappings: {},
  // AI
  semanticSearch: false,
  aiTagSuggest: true,
  // Import/Export
  lastExportDate: null,
};

export async function getSettings() {
  return new Promise((resolve) => {
    chrome.storage.sync.get('settings', (data) => {
      resolve({ ...DEFAULT_SETTINGS, ...data.settings });
    });
  });
}

export async function saveSettings(settings) {
  return new Promise((resolve) => {
    chrome.storage.sync.set({ settings }, resolve);
  });
}
