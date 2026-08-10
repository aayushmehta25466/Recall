import { CARD, BADGE, BADGE_DARK } from '../../shared/ui.js';

// Theme detection (replaces inline script for CSP compliance)
chrome.storage.sync.get('settings', (data) => {
  const theme = data.settings?.theme || 'auto';
  const isDark = theme === 'dark' || (theme === 'auto' && window.matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.classList.toggle('dark', isDark);
  document.documentElement.classList.toggle('light', !isDark);
});

document.addEventListener('DOMContentLoaded', () => {
  const searchInput = document.getElementById('searchInput');
  const resultsContainer = document.getElementById('resultsContainer');
  const actionBar = document.getElementById('actionBar');
  const selectedUrls = new Set();

  // Navigation buttons
  document.getElementById('homeBtn').addEventListener('click', () => {
    chrome.tabs.create({ url: chrome.runtime.getURL('extension/options/options.html#home') });
  });

  document.getElementById('settingsBtn').addEventListener('click', () => {
    chrome.tabs.create({ url: chrome.runtime.getURL('extension/options/options.html#settings') });
  });

  document.getElementById('organizeBtn').addEventListener('click', () => {
    const btn = document.getElementById('organizeBtn');
    btn.classList.add('animate-spin');
    btn.disabled = true;
    chrome.runtime.sendMessage({ type: 'START_BULK_SYNC' }, () => {
      btn.classList.remove('animate-spin');
      btn.disabled = false;
    });
  });

  searchInput.addEventListener('input', (e) => {
    const query = e.target.value.trim();
    selectedUrls.clear();

    if (query.length > 0) {
      chrome.runtime.sendMessage({ type: 'SEARCH', query }, (response) => {
        if (response && response.results) {
          renderResults(response.results);
        }
      });
    } else {
      resultsContainer.innerHTML = `
        <div class="flex items-center justify-center h-full text-text-secondary text-sm">
          Start typing to search your knowledge base...
        </div>
      `;
      hideActionBar();
    }
  });

  function renderActionBar(count) {
    const btn = 'flex items-center gap-1 text-xs font-bold border-2 border-border-default rounded-sm bg-surface-card text-text-base shadow-clay-btn select-none transition-all duration-fast min-h-[32px] px-2 py-1 cursor-pointer hover:-translate-y-[1px] hover:shadow-clay-btn-hover active:translate-y-[1px] active:shadow-clay-pressed focus-visible:outline-[3px] focus-visible:outline-solid focus-visible:outline-accent-green focus-visible:outline-offset-2';
    const btnPrimary = btn.replace('bg-surface-card', 'bg-surface-raised').replace('border-border-default', 'border-border-strong');
    actionBar.className = 'flex items-center gap-2 p-2 bg-surface-card rounded-sm border-2 border-border-default shadow-clay text-text-base';
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
      <button id="openAllBtn" class="${btnPrimary}" title="Open all in new tabs">
        <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"/></svg>
        All
      </button>
      <button id="openSelectedBtn" class="${btnPrimary} hidden" title="Open selected in new tabs">
        <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"/></svg>
        <span id="openSelectedLabel">0</span>
      </button>
    `;
    document.getElementById('selectAllResultsBtn').addEventListener('click', selectAllResults);
    document.getElementById('deselectAllResultsBtn').addEventListener('click', deselectAllResults);
    document.getElementById('openAllBtn').addEventListener('click', openAll);
    document.getElementById('openSelectedBtn').addEventListener('click', openSelected);
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
    const count = selectedUrls.size;
    countEl.textContent = count;
    if (count > 0) {
      openSelectedBtn.classList.remove('hidden');
      openSelectedLabel.textContent = count;
    } else {
      openSelectedBtn.classList.add('hidden');
    }
  }

  function openAll() {
    const urls = [...resultsContainer.querySelectorAll('[data-url]')].map(el => el.dataset.url);
    urls.forEach(url => chrome.tabs.create({ url }));
  }

  function openSelected() {
    selectedUrls.forEach(url => chrome.tabs.create({ url }));
    selectedUrls.clear();
    updateActionBar();
    resultsContainer.querySelectorAll('.result-check').forEach(cb => cb.checked = false);
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
          No bookmarks found.
        </div>
      `;
      hideActionBar();
      return;
    }

    renderActionBar(results.length);

    resultsContainer.innerHTML = results.map(result => `
      <article class="${CARD} flex items-start gap-space-3" data-url="${result.url}">
        <input type="checkbox" class="result-check mt-space-1 w-5 h-5 rounded-xs bg-surface-card border-2 border-border-default text-accent-green focus:ring-surface-raised shrink-0 cursor-pointer">
        <div class="min-w-0 flex-1 cursor-pointer">
          <div class="flex justify-between items-start gap-space-2">
            <h3 class="text-sm font-bold text-text-base truncate">${result.title || result.url}</h3>
            ${result.contentType ? `<span class="${BADGE_DARK} text-xs shrink-0">${result.contentType}</span>` : ''}
          </div>
          <p class="text-xs text-text-secondary truncate mt-space-1">${result.url}</p>
          <div class="flex gap-space-2 mt-space-2">
            ${result.category ? `<span class="${BADGE} text-xs">${result.category} ${result.subcategory ? '/ ' + result.subcategory : ''}</span>` : ''}
          </div>
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
});
