const HISTORY_KEY = 'searchHistory';
const MAX_HISTORY = 20;

/**
 * Get search history from chrome.storage.local.
 * Returns array of recent queries (newest first).
 */
export async function getSearchHistory() {
  return new Promise((resolve) => {
    chrome.storage.local.get(HISTORY_KEY, (data) => {
      resolve(data[HISTORY_KEY] || []);
    });
  });
}

/**
 * Add a query to search history.
 * Removes duplicates and limits to MAX_HISTORY entries.
 */
export async function addToHistory(query) {
  if (!query || query.trim().length < 2) return;

  const trimmed = query.trim();
  const history = await getSearchHistory();

  // Remove if already exists (move to top)
  const filtered = history.filter(h => h.query !== trimmed);

  // Add to top
  filtered.unshift({
    query: trimmed,
    timestamp: Date.now(),
  });

  // Limit size
  const limited = filtered.slice(0, MAX_HISTORY);

  return new Promise((resolve) => {
    chrome.storage.local.set({ [HISTORY_KEY]: limited }, resolve);
  });
}

/**
 * Remove a specific query from history.
 */
export async function removeFromHistory(query) {
  const history = await getSearchHistory();
  const filtered = history.filter(h => h.query !== query);

  return new Promise((resolve) => {
    chrome.storage.local.set({ [HISTORY_KEY]: filtered }, resolve);
  });
}

/**
 * Clear all search history.
 */
export async function clearHistory() {
  return new Promise((resolve) => {
    chrome.storage.local.remove(HISTORY_KEY, resolve);
  });
}

/**
 * Get recent queries for autocomplete.
 * Returns array of query strings (newest first).
 */
export async function getRecentQueries(limit = 5) {
  const history = await getSearchHistory();
  return history.slice(0, limit).map(h => h.query);
}

/**
 * Search history for matching queries.
 * Returns queries that contain the input string.
 */
export async function searchHistory(query) {
  if (!query || query.trim().length === 0) {
    return getRecentQueries(10);
  }

  const history = await getSearchHistory();
  const q = query.toLowerCase();

  return history
    .filter(h => h.query.toLowerCase().includes(q))
    .slice(0, 10)
    .map(h => h.query);
}
