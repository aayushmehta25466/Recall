import { CARD, BADGE, BADGE_DARK } from '../../shared/ui.js';

// Theme detection
chrome.storage.sync.get('settings', (data) => {
  const theme = data.settings?.theme || 'auto';
  const isDark = theme === 'dark' || (theme === 'auto' && window.matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.classList.toggle('dark', isDark);
  document.documentElement.classList.toggle('light', !isDark);
});

// Search history helper
const HISTORY_KEY = 'searchHistory';
const MAX_HISTORY = 20;

async function getSearchHistory() {
  return new Promise((resolve) => {
    chrome.storage.local.get(HISTORY_KEY, (data) => {
      resolve(data[HISTORY_KEY] || []);
    });
  });
}

async function addToHistory(query) {
  if (!query || query.trim().length < 2) return;
  const trimmed = query.trim();
  const history = await getSearchHistory();
  const filtered = history.filter(h => h.query !== trimmed);
  filtered.unshift({ query: trimmed, timestamp: Date.now() });
  const limited = filtered.slice(0, MAX_HISTORY);
  return new Promise((resolve) => {
    chrome.storage.local.set({ [HISTORY_KEY]: limited }, resolve);
  });
}

async function removeFromHistory(query) {
  const history = await getSearchHistory();
  const filtered = history.filter(h => h.query !== query);
  return new Promise((resolve) => {
    chrome.storage.local.set({ [HISTORY_KEY]: filtered }, resolve);
  });
}

async function getRecentQueries(limit = 5) {
  const history = await getSearchHistory();
  return history.slice(0, limit).map(h => h.query);
}

document.addEventListener('DOMContentLoaded', () => {
  const searchInput = document.getElementById('searchInput');
  const resultsContainer = document.getElementById('resultsContainer');
  const actionBar = document.getElementById('actionBar');
  const searchHistory = document.getElementById('searchHistory');
  const statsBar = document.getElementById('statsBar');
  const categoryFilters = document.getElementById('categoryFilters');
  const selectedUrls = new Set();
  let currentCategory = 'all';
  let allResults = [];

  // Auto-focus search input
  searchInput.focus();

  // Keyboard shortcuts
  document.addEventListener('keydown', (e) => {
    // Ctrl+K or Cmd+K to focus search
    if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
      e.preventDefault();
      searchInput.focus();
      searchInput.select();
    }
    // Escape to clear search
    if (e.key === 'Escape') {
      searchInput.value = '';
      searchInput.dispatchEvent(new Event('input'));
      searchInput.blur();
    }
  });

  // Navigation buttons
  document.getElementById('homeBtn').addEventListener('click', () => {
    chrome.tabs.create({ url: chrome.runtime.getURL('extension/options/options.html#home') });
  });

  document.getElementById('settingsBtn').addEventListener('click', () => {
    chrome.tabs.create({ url: chrome.runtime.getURL('extension/options/options.html#settings') });
  });

  document.getElementById('closeBtn').addEventListener('click', () => {
    chrome.windows.getCurrent((win) => {
      chrome.sidePanel.close({ windowId: win.id });
    });
  });

  // Quick actions
  document.getElementById('organizeBtn').addEventListener('click', async () => {
    const btn = document.getElementById('organizeBtn');
    btn.disabled = true;
    btn.innerHTML = '<svg class="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg> Organizing...';
    chrome.runtime.sendMessage({ type: 'START_BULK_SYNC' }, () => {
      btn.disabled = false;
      btn.innerHTML = '<svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/></svg> Organize All';
      loadStats();
    });
  });

  document.getElementById('trashBtn').addEventListener('click', () => {
    chrome.tabs.create({ url: chrome.runtime.getURL('extension/options/options.html#trash') });
  });

  // Search input
  searchInput.addEventListener('input', async (e) => {
    const query = e.target.value.trim();
    selectedUrls.clear();

    if (query.length > 0) {
      searchHistory.classList.add('hidden');
      await addToHistory(query);

      chrome.runtime.sendMessage({ type: 'SEARCH', query }, (response) => {
        if (response && response.results) {
          allResults = response.results;
          filterAndRender();
          updateActionBar();
        }
      });
    } else {
      allResults = [];
      filterAndRender();
      updateActionBar();
    }
  });

  // Search history on focus
  searchInput.addEventListener('focus', async () => {
    if (searchInput.value.trim().length === 0) {
      const queries = await getRecentQueries(10);
      if (queries.length > 0) {
        renderSearchHistory(queries);
        searchHistory.classList.remove('hidden');
      }
    }
  });

  // Hide history on outside click
  document.addEventListener('click', (e) => {
    if (!searchInput.contains(e.target) && !searchHistory.contains(e.target)) {
      searchHistory.classList.add('hidden');
    }
  });

  function renderSearchHistory(queries) {
    searchHistory.innerHTML = queries.map(q => `
      <div class="flex items-center justify-between px-3 py-2 hover:bg-surface-raised cursor-pointer group">
        <span class="text-sm text-text-base">${q}</span>
        <button class="text-text-secondary hover:text-accent-red opacity-0 group-hover:opacity-100 transition-opacity" data-remove="${q}">
          <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/></svg>
        </button>
      </div>
    `).join('');

    searchHistory.querySelectorAll('[class*="hover:bg"]').forEach(el => {
      el.addEventListener('click', async (e) => {
        const removeBtn = e.target.closest('[data-remove]');
        if (removeBtn) {
          const query = removeBtn.dataset.remove;
          await removeFromHistory(query);
          const updated = await getRecentQueries(10);
          if (updated.length > 0) {
            renderSearchHistory(updated);
          } else {
            searchHistory.classList.add('hidden');
          }
          return;
        }
        const query = el.querySelector('span').textContent;
        searchInput.value = query;
        searchHistory.classList.add('hidden');
        searchInput.dispatchEvent(new Event('input'));
      });
    });
  }

  // Category filters
  categoryFilters.addEventListener('click', (e) => {
    const btn = e.target.closest('.category-filter');
    if (!btn) return;
    
    categoryFilters.querySelectorAll('.category-filter').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    currentCategory = btn.dataset.category;
    filterAndRender();
  });

  function filterAndRender() {
    let filtered = allResults;
    if (currentCategory !== 'all') {
      filtered = allResults.filter(b => b.category === currentCategory);
    }
    renderResults(filtered);
  }

  async function loadStats() {
    chrome.runtime.sendMessage({ type: 'SEARCH', query: '' }, (response) => {
      if (response && response.results) {
        const total = response.results.length;
        const categories = new Set(response.results.map(b => b.category).filter(Boolean));
        const uncategorized = response.results.filter(b => !b.category || b.category === 'Uncategorized').length;
        
        document.getElementById('totalCount').textContent = total;
        document.getElementById('categoryCount').textContent = categories.size;
        document.getElementById('uncategorizedCount').textContent = uncategorized;
        
        // Update category filters
        const filters = ['all', ...categories].sort();
        categoryFilters.innerHTML = filters.map(cat => {
          const isActive = cat === currentCategory;
          const activeClass = isActive ? 'bg-accent-green text-white border-accent-green' : 'bg-surface-inset text-text-secondary hover:bg-accent-green hover:text-white hover:border-accent-green';
          return `<button class="category-filter px-2.5 py-1 text-[11px] font-semibold border border-border-default rounded-full cursor-pointer transition-all ${activeClass}" data-category="${cat}">${cat === 'all' ? 'All' : cat}</button>`;
        }).join('');
      }
    });
  }

  function renderActionBar(count) {
    const btn = 'flex items-center gap-1 text-xs font-bold border-2 border-border-default rounded-sm bg-surface-card text-text-base shadow-clay-btn select-none transition-all duration-fast min-h-[32px] px-2 py-1 cursor-pointer hover:-translate-y-[1px] hover:shadow-clay-btn-hover active:translate-y-[1px] active:shadow-clay-pressed focus-visible:outline-[3px] focus-visible:outline-solid focus-visible:outline-accent-green focus-visible:outline-offset-2';
    const btnPrimary = btn.replace('bg-surface-card', 'bg-surface-raised').replace('border-border-default', 'border-border-strong');
    const btnDanger = btn.replace('bg-surface-card', 'bg-surface-raised').replace('border-border-default', 'border-accent-red');
    actionBar.className = 'flex items-center gap-2 p-2 bg-surface-card rounded-sm border-2 border-border-default shadow-clay text-text-base mb-3';
    actionBar.innerHTML = `
      <span id="selectedInfo" class="flex items-center gap-1 text-xs font-bold text-accent-green min-w-[28px]">
        <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M5 13l4 4L19 7"/></svg>
        <span id="selectedCount">0</span>
      </span>
      <button id="selectAllResultsBtn" class="${btn}" title="Select all">
        <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
        All
      </button>
      <button id="deselectAllResultsBtn" class="${btn}" title="Deselect all">
        <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M6 18L18 6M6 6l12 12"/></svg>
      </button>
      <div class="w-px h-4 bg-border-default"></div>
      <button id="openSelectedBtn" class="${btnPrimary} hidden" title="Open selected in new tabs">
        <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"/></svg>
        <span id="openSelectedLabel">0</span>
      </button>
      <button id="openAllBtn" class="${btnPrimary} hidden" title="Open all in new tabs">
        <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"/></svg>
        All
      </button>
      <button id="trashSelectedBtn" class="${btnDanger} hidden" title="Move selected to trash">
        <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
        <span id="trashSelectedLabel">0</span>
      </button>
    `;
    document.getElementById('selectAllResultsBtn').addEventListener('click', selectAllResults);
    document.getElementById('deselectAllResultsBtn').addEventListener('click', deselectAllResults);
    document.getElementById('openAllBtn').addEventListener('click', openAll);
    document.getElementById('openSelectedBtn').addEventListener('click', openSelected);
    document.getElementById('trashSelectedBtn').addEventListener('click', trashSelected);
    updateActionBar();
  }

  function hideActionBar() {
    actionBar.className = 'hidden';
    actionBar.innerHTML = '';
  }

  function updateActionBar() {
    const countEl = document.getElementById('selectedCount');
    const openSelectedBtn = document.getElementById('openSelectedBtn');
    const openSelectedLabel = document.getElementById('openSelectedLabel');
    const openAllBtn = document.getElementById('openAllBtn');
    const trashSelectedBtn = document.getElementById('trashSelectedBtn');
    const trashSelectedLabel = document.getElementById('trashSelectedLabel');
    const count = selectedUrls.size;
    const hasQuery = searchInput.value.trim().length > 0;
    countEl.textContent = count;
    if (count > 0) {
      openSelectedBtn.classList.remove('hidden');
      openSelectedLabel.textContent = count;
      trashSelectedBtn.classList.remove('hidden');
      trashSelectedLabel.textContent = count;
    } else {
      openSelectedBtn.classList.add('hidden');
      trashSelectedBtn.classList.add('hidden');
    }
    // Show "Open All" only when there's a search/filter active
    if (hasQuery && resultsContainer.querySelectorAll('[data-url]').length > 0) {
      openAllBtn.classList.remove('hidden');
    } else {
      openAllBtn.classList.add('hidden');
    }
  }

  // Open tabs in chunks and add to a group
  async function openTabsInChunks(urls, chunkSize = 5) {
    if (urls.length === 0) return;

    // Single tab: just open directly
    if (urls.length === 1) {
      await chrome.tabs.create({ url: urls[0], active: true });
      return;
    }

    // Multiple tabs: create group first, then add tabs in chunks
    let groupId = null;

    for (let i = 0; i < urls.length; i += chunkSize) {
      const chunk = urls.slice(i, i + chunkSize);
      const tabIds = [];

      for (const url of chunk) {
        const tab = await chrome.tabs.create({ url, active: false });
        tabIds.push(tab.id);
      }

      // First chunk: create the group
      if (groupId === null) {
        try {
          groupId = await chrome.tabs.group({ tabIds });
          // Name the group
          let groupNum = 1;
          try {
            const existingGroups = await chrome.tabGroups.query({});
            const usedNums = existingGroups
              .map(g => g.title?.match(/^Group (\d+)$/)?.[1])
              .filter(Boolean)
              .map(Number);
            while (usedNums.includes(groupNum)) groupNum++;
          } catch {}
          await chrome.tabGroups.update(groupId, { title: `Group ${groupNum}`, collapsed: false });
        } catch (e) {
          console.warn('Tab grouping failed:', e);
        }
      } else {
        // Subsequent chunks: add to existing group
        try {
          await chrome.tabs.group({ groupId, tabIds });
        } catch (e) {
          console.warn('Adding tabs to group failed:', e);
        }
      }

      // Delay between chunks
      if (i + chunkSize < urls.length) {
        await new Promise(r => setTimeout(r, 100));
      }
    }
  }

  function openAll() {
    const urls = [...resultsContainer.querySelectorAll('[data-url]')].map(el => el.dataset.url);
    openTabsInChunks(urls);
  }

  function openSelected() {
    const urls = [...selectedUrls];
    openTabsInChunks(urls);
    selectedUrls.clear();
    updateActionBar();
    resultsContainer.querySelectorAll('.result-check').forEach(cb => cb.checked = false);
  }

  function trashSelected() {
    if (selectedUrls.size === 0) return;
    
    const count = selectedUrls.size;
    const confirmed = confirm(`Move ${count} bookmark${count > 1 ? 's' : ''} to trash?`);
    if (!confirmed) return;

    const urls = [...selectedUrls];
    let trashed = 0;
    urls.forEach(url => {
      chrome.runtime.sendMessage({ type: 'TRASH_BOOKMARK', url }, () => {
        trashed++;
        const card = resultsContainer.querySelector(`[data-url="${url}"]`);
        if (card) {
          card.classList.add('opacity-0', 'translate-x-5', 'transition-all', 'duration-200');
          setTimeout(() => card.remove(), 200);
        }
        if (trashed === urls.length) {
          selectedUrls.clear();
          updateActionBar();
          loadStats();
        }
      });
    });
  }

  function selectAllResults() {
    resultsContainer.querySelectorAll('[data-url]').forEach(el => {
      const url = el.dataset.url;
      selectedUrls.add(url);
      const cb = el.querySelector('.result-check');
      if (cb) cb.checked = true;
      el.classList.add('bg-surface-raised/30');
    });
    updateActionBar();
  }

  function deselectAllResults() {
    selectedUrls.clear();
    resultsContainer.querySelectorAll('.result-check').forEach(cb => cb.checked = false);
    resultsContainer.querySelectorAll('[data-url]').forEach(el => el.classList.remove('bg-surface-raised/30'));
    updateActionBar();
  }

  function renderResults(results) {
    if (!results || results.length === 0) {
      resultsContainer.innerHTML = `
        <div class="flex items-center justify-center h-full text-text-secondary text-sm">
          ${allResults.length === 0 ? 'Start typing to search your knowledge base...' : 'No bookmarks found in this category.'}
        </div>
      `;
      hideActionBar();
      return;
    }

    renderActionBar(results.length);

    resultsContainer.innerHTML = results.map(result => `
      <article class="${CARD} flex items-start gap-3" data-url="${result.url}">
        <input type="checkbox" class="result-check mt-1 w-5 h-5 rounded-xs bg-surface-card border-2 border-border-default text-accent-green focus:ring-surface-raised shrink-0 cursor-pointer">
        <div class="min-w-0 flex-1 cursor-pointer">
          <div class="flex justify-between items-start gap-2">
            <h3 class="text-sm font-bold text-text-base truncate">${result.title || result.url}</h3>
            ${result.contentType ? `<span class="${BADGE_DARK} text-xs shrink-0">${result.contentType}</span>` : ''}
          </div>
          <p class="text-xs text-text-secondary truncate mt-1">${result.url}</p>
          <div class="flex gap-2 mt-2">
            ${result.category ? `<span class="${BADGE} text-xs">${result.category} ${result.subcategory ? '/ ' + result.subcategory : ''}</span>` : ''}
          </div>
        </div>
        <div class="flex flex-col gap-1 shrink-0">
          <button class="open-btn p-1.5 rounded-sm text-text-secondary hover:text-accent-green hover:bg-surface-raised transition-colors" title="Open in new tab">
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"/></svg>
          </button>
          <button class="remove-btn p-1.5 rounded-sm text-text-secondary hover:text-accent-red hover:bg-surface-raised transition-colors" title="Move to trash">
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
          </button>
        </div>
      </article>
    `).join('');

    // Click card to open
    resultsContainer.querySelectorAll('.min-w-0').forEach(el => {
      el.addEventListener('click', () => {
        const url = el.closest('[data-url]').dataset.url;
        chrome.tabs.create({ url });
      });
    });

    // Open button
    resultsContainer.querySelectorAll('.open-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const url = btn.closest('[data-url]').dataset.url;
        chrome.tabs.create({ url });
      });
    });

    // Remove button (single bookmark - direct trash, no confirm)
    resultsContainer.querySelectorAll('.remove-btn').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const url = btn.closest('[data-url]').dataset.url;
        chrome.runtime.sendMessage({ type: 'TRASH_BOOKMARK', url }, () => {
          const card = btn.closest('[data-url]');
          card.classList.add('opacity-0', 'translate-x-5', 'transition-all', 'duration-200');
          setTimeout(() => {
            card.remove();
            loadStats();
          }, 200);
        });
      });
    });

    // Checkbox toggle
    resultsContainer.querySelectorAll('.result-check').forEach(cb => {
      cb.addEventListener('change', (e) => {
        const url = e.target.closest('[data-url]').dataset.url;
        if (e.target.checked) {
          selectedUrls.add(url);
          e.target.closest('[data-url]').classList.add('bg-surface-raised/30');
        } else {
          selectedUrls.delete(url);
          e.target.closest('[data-url]').classList.remove('bg-surface-raised/30');
        }
        updateActionBar();
      });
    });
  }

  // Load stats and all bookmarks on startup
  loadStats();
  loadAllBookmarks();
  checkSyncStatus();

  function loadAllBookmarks() {
    chrome.runtime.sendMessage({ type: 'SEARCH', query: '' }, (response) => {
      if (response && response.results) {
        allResults = response.results;
        filterAndRender();
      }
    });
  }

  function checkSyncStatus() {
    chrome.runtime.sendMessage({ type: 'GET_SYNC_STATUS' }, (response) => {
      if (response && response.isSyncing) {
        const organizeBtn = document.getElementById('organizeBtn');
        organizeBtn.disabled = true;
        organizeBtn.innerHTML = '<svg class="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg> Organizing...';
      }
    });
  }
});
