import { CARD, BADGE, BADGE_DARK } from '../ui.js';
import { api, sendMessage, storageGet, storageSet, closeSidebar } from '../platform.js';

/**
 * The one search surface used by both the toolbar popup and the side panel.
 *
 * Keeping a single implementation is deliberate: popup.js and sidepanel.js had already
 * drifted (the sidebar gained the chip rail / compact stats / icon actions, the popup
 * didn't). `variant` covers only the differences that genuinely exist.
 */

const HISTORY_KEY = 'searchHistory';
const MAX_HISTORY = 20;

const ACTION_BAR_CLASS = 'flex items-center gap-2 p-2 flex-wrap bg-surface-card rounded-sm border-2 border-border-default shadow-clay text-text-base mb-2';
const CHIP_BASE = 'category-filter px-2.5 py-1 text-[11px] font-semibold border rounded-full cursor-pointer whitespace-nowrap transition-all';
const CHIP_OFF = 'bg-surface-inset text-text-secondary border-border-default hover:bg-accent-green hover:text-white hover:border-accent-green';
const CHIP_ON = 'bg-accent-green text-white border-accent-green';
const SPINNER_ICON = '<svg class="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>';

function applyTheme() {
  storageGet('sync', 'settings').then(({ settings }) => {
    const theme = settings?.theme || 'auto';
    const isDark = theme === 'dark'
      || (theme === 'auto' && window.matchMedia('(prefers-color-scheme: dark)').matches);
    document.documentElement.classList.toggle('dark', isDark);
    document.documentElement.classList.toggle('light', !isDark);
  });
}

/* ── search history ────────────────────────────────────────────────────── */

async function getSearchHistory() {
  const data = await storageGet('local', HISTORY_KEY);
  return data[HISTORY_KEY] || [];
}

async function addToHistory(query) {
  if (!query || query.trim().length < 2) return;
  const trimmed = query.trim();
  const history = await getSearchHistory();
  const filtered = history.filter((h) => h.query !== trimmed);
  filtered.unshift({ query: trimmed, timestamp: Date.now() });
  await storageSet('local', { [HISTORY_KEY]: filtered.slice(0, MAX_HISTORY) });
}

async function removeFromHistory(query) {
  const history = await getSearchHistory();
  await storageSet('local', { [HISTORY_KEY]: history.filter((h) => h.query !== query) });
}

async function getRecentQueries(limit = 5) {
  const history = await getSearchHistory();
  return history.slice(0, limit).map((h) => h.query);
}

/* ── the surface ───────────────────────────────────────────────────────── */

export function mountSearchPanel({ variant = 'popup' } = {}) {
  const el = (id) => document.getElementById(id);

  const searchInput = el('searchInput');
  const resultsContainer = el('resultsContainer');
  const actionBar = el('actionBar');
  const searchHistory = el('searchHistory');
  const categoryFilters = el('categoryFilters');
  const selectAllLink = el('selectAllLink');

  let selectedUrls = new Set();
  let currentCategory = 'all';
  let allResults = [];
  let knownCategories = [];

  applyTheme();

  /* header icon actions */
  el('homeBtn')?.addEventListener('click', () =>
    api.tabs.create({ url: api.runtime.getURL('options/index.html#home') }));
  el('settingsBtn')?.addEventListener('click', () =>
    api.tabs.create({ url: api.runtime.getURL('options/index.html#settings') }));
  el('trashBtn')?.addEventListener('click', () =>
    api.tabs.create({ url: api.runtime.getURL('options/index.html#trash') }));
  el('closeBtn')?.addEventListener('click', () => {
    if (variant === 'sidebar') closeSidebar();
    else window.close();
  });

  const organizeBtn = el('organizeBtn');
  const ORGANIZE_ICON = organizeBtn ? organizeBtn.innerHTML : '';
  organizeBtn?.addEventListener('click', () => {
    organizeBtn.disabled = true;
    organizeBtn.innerHTML = SPINNER_ICON;
    sendMessage({ type: 'START_BULK_SYNC' }).then(() => {
      organizeBtn.disabled = false;
      organizeBtn.innerHTML = ORGANIZE_ICON;
      loadStats();
      loadAllBookmarks();
    });
  });

  /* search */
  searchInput.addEventListener('input', async () => {
    const query = searchInput.value.trim();
    selectedUrls.clear();

    if (query.length > 0) {
      searchHistory.classList.add('hidden');
      await addToHistory(query);
      const response = await sendMessage({ type: 'SEARCH', query });
      allResults = response?.results || [];
      filterAndRender();
      updateActionBar();
    } else {
      searchHistory.classList.add('hidden');
      loadAllBookmarks();
    }
  });

  searchInput.addEventListener('focus', async () => {
    if (searchInput.value.trim().length === 0) {
      const queries = await getRecentQueries(10);
      if (queries.length > 0) {
        renderSearchHistory(queries);
        searchHistory.classList.remove('hidden');
      }
    }
  });

  document.addEventListener('click', (e) => {
    if (!searchInput.contains(e.target) && !searchHistory.contains(e.target)) {
      searchHistory.classList.add('hidden');
    }
  });

  document.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
      e.preventDefault();
      searchInput.focus();
      searchInput.select();
    }
    if (e.key === 'Escape') {
      searchInput.value = '';
      searchInput.dispatchEvent(new Event('input'));
      searchInput.blur();
    }
  });

  function renderSearchHistory(queries) {
    searchHistory.innerHTML = queries.map((q) => `
      <div class="flex items-center justify-between px-3 py-2 hover:bg-surface-raised cursor-pointer group">
        <span class="text-sm text-text-base">${q}</span>
        <button class="text-text-secondary hover:text-accent-red opacity-0 group-hover:opacity-100 transition-opacity" data-remove="${q}">
          <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/></svg>
        </button>
      </div>
    `).join('');

    searchHistory.querySelectorAll('[class*="hover:bg"]').forEach((row) => {
      row.addEventListener('click', async (e) => {
        const removeBtn = e.target.closest('[data-remove]');
        if (removeBtn) {
          await removeFromHistory(removeBtn.dataset.remove);
          const updated = await getRecentQueries(10);
          if (updated.length > 0) renderSearchHistory(updated);
          else searchHistory.classList.add('hidden');
          return;
        }
        searchInput.value = row.querySelector('span').textContent;
        searchHistory.classList.add('hidden');
        searchInput.dispatchEvent(new Event('input'));
      });
    });
  }

  /* category chips */
  categoryFilters.addEventListener('click', (e) => {
    const btn = e.target.closest('.category-filter');
    if (!btn) return;
    currentCategory = btn.dataset.category;
    renderCategoryFilters();
    filterAndRender();
  });

  // A plain wheel over the chip rail scrolls it horizontally when it overflows.
  categoryFilters.addEventListener('wheel', (e) => {
    if (e.deltaY === 0) return;
    if (categoryFilters.scrollWidth <= categoryFilters.clientWidth) return;
    e.preventDefault();
    categoryFilters.scrollLeft += e.deltaY;
  }, { passive: false });

  selectAllLink?.addEventListener('click', selectAllResults);

  /* data */
  async function loadStats() {
    const response = await sendMessage({ type: 'SEARCH', query: '' });
    if (!response?.results) return;
    const categories = new Set(response.results.map((b) => b.category).filter(Boolean));
    const uncategorized = response.results.filter((b) => !b.category || b.category === 'Uncategorized').length;

    el('totalCount').textContent = response.results.length;
    el('categoryCount').textContent = categories.size;
    el('uncategorizedCount').textContent = uncategorized;

    knownCategories = [...categories];
    renderCategoryFilters();
  }

  async function loadAllBookmarks() {
    const response = await sendMessage({ type: 'SEARCH', query: '' });
    if (response?.results) allResults = response.results;
    filterAndRender();
    updateActionBar();
  }

  function checkSyncStatus() {
    sendMessage({ type: 'GET_SYNC_STATUS' }).then((response) => {
      if (response?.isSyncing && organizeBtn) {
        organizeBtn.disabled = true;
        organizeBtn.innerHTML = SPINNER_ICON;
      }
    });
  }

  /* rendering */
  function renderCategoryFilters() {
    const filters = ['all', ...[...knownCategories].sort((a, b) => a.localeCompare(b))];
    categoryFilters.innerHTML = filters.map((cat) => {
      const cls = cat === currentCategory ? `${CHIP_BASE} ${CHIP_ON}` : `${CHIP_BASE} ${CHIP_OFF}`;
      return `<button class="${cls}" data-category="${cat}">${cat === 'all' ? 'All' : cat}</button>`;
    }).join('');
  }

  function filterAndRender() {
    const filtered = currentCategory === 'all'
      ? allResults
      : allResults.filter((b) => b.category === currentCategory);
    renderResults(filtered);
  }

  function renderResults(results) {
    selectedUrls.clear();

    if (!results || results.length === 0) {
      resultsContainer.innerHTML = `
        <div class="flex items-center justify-center h-full text-text-secondary text-sm">
          ${allResults.length === 0 ? 'No bookmarks indexed yet — run "Organize All".' : 'No bookmarks found in this category.'}
        </div>
      `;
      hideActionBar();
      return;
    }

    renderActionBar();

    resultsContainer.innerHTML = results.map((result) => `
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

    resultsContainer.querySelectorAll('.min-w-0').forEach((card) => {
      card.addEventListener('click', () => api.tabs.create({ url: card.closest('[data-url]').dataset.url }));
    });

    resultsContainer.querySelectorAll('.open-btn').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        api.tabs.create({ url: btn.closest('[data-url]').dataset.url });
      });
    });

    resultsContainer.querySelectorAll('.remove-btn').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const url = btn.closest('[data-url]').dataset.url;
        sendMessage({ type: 'TRASH_BOOKMARK', url }).then(() => {
          allResults = allResults.filter((b) => b.url !== url);
          const card = btn.closest('[data-url]');
          card.classList.add('opacity-0', 'translate-x-5', 'transition-all', 'duration-200');
          setTimeout(() => { card.remove(); loadStats(); }, 200);
        });
      });
    });

    resultsContainer.querySelectorAll('.result-check').forEach((cb) => {
      cb.addEventListener('change', (e) => {
        const card = e.target.closest('[data-url]');
        if (e.target.checked) {
          selectedUrls.add(card.dataset.url);
          card.classList.add('bg-surface-raised/30');
        } else {
          selectedUrls.delete(card.dataset.url);
          card.classList.remove('bg-surface-raised/30');
        }
        updateActionBar();
      });
    });
  }

  function renderActionBar() {
    const btn = 'flex items-center gap-1 text-xs font-bold border-2 border-border-default rounded-sm bg-surface-card text-text-base shadow-clay-btn select-none transition-all duration-fast min-h-[32px] px-2 py-1 cursor-pointer hover:-translate-y-[1px] hover:shadow-clay-btn-hover active:translate-y-[1px] active:shadow-clay-pressed focus-visible:outline-[3px] focus-visible:outline-solid focus-visible:outline-accent-green focus-visible:outline-offset-2';
    const btnPrimary = btn.replace('bg-surface-card', 'bg-surface-raised').replace('border-border-default', 'border-border-strong');
    const btnDanger = btn.replace('bg-surface-card', 'bg-surface-raised').replace('border-border-default', 'border-accent-red');

    actionBar.innerHTML = `
      <span class="flex items-center gap-1 text-xs font-bold text-accent-green min-w-[28px]">
        <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M5 13l4 4L19 7"/></svg>
        <span id="selectedCount">0</span>
      </span>
      <button id="deselectAllResultsBtn" class="${btn}" title="Deselect all">
        <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M6 18L18 6M6 6l12 12"/></svg>
      </button>
      <div class="w-px h-4 bg-border-default"></div>
      <button id="openSelectedBtn" class="${btnPrimary}" title="Open selected in new tabs">
        <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"/></svg>
        <span id="openSelectedLabel">0</span>
      </button>
      <button id="trashSelectedBtn" class="${btnDanger}" title="Move selected to trash">
        <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
        <span id="trashSelectedLabel">0</span>
      </button>
    `;

    el('deselectAllResultsBtn').addEventListener('click', deselectAllResults);
    el('openSelectedBtn').addEventListener('click', openSelected);
    el('trashSelectedBtn').addEventListener('click', trashSelected);
    updateActionBar();
  }

  function hideActionBar() {
    actionBar.className = 'hidden';
    actionBar.innerHTML = '';
  }

  function updateActionBar() {
    const count = selectedUrls.size;

    if (!actionBar.firstChild) {
      actionBar.className = 'hidden';
      return;
    }
    actionBar.className = count > 0 ? ACTION_BAR_CLASS : 'hidden';

    el('selectedCount').textContent = count;
    if (count > 0) {
      el('openSelectedLabel').textContent = count;
      el('trashSelectedLabel').textContent = count;
    }
  }

  /* actions */
  function openTabs(urls) {
    if (urls.length === 0) return;
    if (urls.length === 1) {
      api.tabs.create({ url: urls[0], active: true });
      return;
    }
    sendMessage({ type: 'OPEN_IN_TAB_GROUP', urls });
  }

  function openSelected() {
    openTabs([...selectedUrls]);
    selectedUrls.clear();
    updateActionBar();
    resultsContainer.querySelectorAll('.result-check').forEach((cb) => { cb.checked = false; });
  }

  function trashSelected() {
    if (selectedUrls.size === 0) return;
    const count = selectedUrls.size;
    if (!confirm(`Move ${count} bookmark${count > 1 ? 's' : ''} to trash?`)) return;

    const urls = [...selectedUrls];
    let done = 0;
    urls.forEach((url) => {
      sendMessage({ type: 'TRASH_BOOKMARK', url }).then(() => {
        done++;
        allResults = allResults.filter((b) => b.url !== url);
        const card = resultsContainer.querySelector(`[data-url="${url}"]`);
        if (card) {
          card.classList.add('opacity-0', 'translate-x-5', 'transition-all', 'duration-200');
          setTimeout(() => card.remove(), 200);
        }
        if (done === urls.length) {
          selectedUrls.clear();
          updateActionBar();
          loadStats();
        }
      });
    });
  }

  function selectAllResults() {
    resultsContainer.querySelectorAll('[data-url]').forEach((card) => {
      selectedUrls.add(card.dataset.url);
      const cb = card.querySelector('.result-check');
      if (cb) cb.checked = true;
      card.classList.add('bg-surface-raised/30');
    });
    updateActionBar();
  }

  function deselectAllResults() {
    selectedUrls.clear();
    resultsContainer.querySelectorAll('.result-check').forEach((cb) => { cb.checked = false; });
    resultsContainer.querySelectorAll('[data-url]').forEach((card) => card.classList.remove('bg-surface-raised/30'));
    updateActionBar();
  }

  /* go */
  if (variant === 'sidebar') searchInput.focus();
  loadStats();
  loadAllBookmarks();
  checkSyncStatus();
}
