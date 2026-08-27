import { getAllBookmarks, getActiveBookmarks, getTrashedBookmarks, updateBookmark, trashBookmark, restoreBookmark, emptyTrash, clearAllBookmarks, saveBookmarks, initDB } from '../../database/indexeddb/db.js';
import { getSettings, saveSettings } from '../../shared/settings.js';
import { CATEGORIES } from '../../shared/types/taxonomy.js';
import { BTN, BTN_SECONDARY, BTN_DANGER, CARD, BADGE, BADGE_DARK } from '../../shared/ui.js';

// Theme detection (replaces inline script for CSP compliance)
chrome.storage.sync.get('settings', (data) => {
  const theme = data.settings?.theme || 'auto';
  const isDark = theme === 'dark' || (theme === 'auto' && window.matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.classList.toggle('dark', isDark);
  document.documentElement.classList.toggle('light', !isDark);
});

// ─── Helpers ───
function esc(str) {
  const d = document.createElement('div');
  d.textContent = str || '';
  return d.innerHTML;
}

function formatDate(iso) {
  if (!iso) return '';
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

// ─── Tab Switching ───
const tabs = document.querySelectorAll('[data-tab]');
const panels = {
  home: document.getElementById('homePanel'),
  trash: document.getElementById('trashPanel'),
  settings: document.getElementById('settingsPanel'),
  data: document.getElementById('dataPanel'),
  rules: document.getElementById('rulesPanel'),
  review: document.getElementById('reviewPanel'),
};
let activeTab = 'home';

function switchTab(tab) {
  activeTab = tab;
  tabs.forEach(t => {
    const active = t.dataset.tab === tab;
    t.classList.toggle('bg-surface-raised', active);
    t.classList.toggle('border-border-default', active);
    t.classList.toggle('shadow-clay-sidebar', active);
  });
  Object.entries(panels).forEach(([k, p]) => p.classList.toggle('hidden', k !== tab));
  if (tab === 'trash') loadTrash();
  if (tab === 'rules') renderRules();
  if (tab === 'review') loadReview();
}
tabs.forEach(t => t.addEventListener('click', () => switchTab(t.dataset.tab)));

// ─── Home: Bookmarks ───
const searchInput = document.getElementById('searchInput');
const sortSelect = document.getElementById('sortSelect');
const bookmarksList = document.getElementById('bookmarksList');
const emptyState = document.getElementById('emptyState');
const statsBar = document.getElementById('bookmarksCount');
const filterInfo = document.getElementById('filterInfo');
const editModeBtn = document.getElementById('editModeBtn');
const viewToggleBtn = document.getElementById('viewToggleBtn');

let allBookmarks = [];
let editMode = false;
let selectedUrls = new Set();
let dragSrcIndex = null;
let viewMode = 'folder'; // 'folder' or 'flat'

async function loadBookmarks() {
  try {
    console.log('Loading bookmarks from IndexedDB...');
    allBookmarks = await getActiveBookmarks();
    console.log(`Loaded ${allBookmarks.length} bookmarks from IndexedDB`);
  } catch (e) {
    console.error('Failed to load bookmarks:', e);
    allBookmarks = [];
  }
  renderCurrentView();
}

function renderCurrentView() {
  if (viewMode === 'folder') {
    renderFolderView();
  } else {
    const filtered = getFilteredBookmarks();
    renderBookmarks(filtered);
  }
}

function sortBookmarks(arr) {
  const sort = sortSelect.value;
  if (sort === 'manual') {
    arr.sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
  } else if (sort === 'date_desc') {
    arr.sort((a, b) => new Date(b.dateAdded) - new Date(a.dateAdded));
  } else if (sort === 'date_asc') {
    arr.sort((a, b) => new Date(a.dateAdded) - new Date(b.dateAdded));
  } else if (sort === 'title_asc') {
    arr.sort((a, b) => (a.title || a.url).localeCompare(b.title || b.url));
  } else if (sort === 'title_desc') {
    arr.sort((a, b) => (b.title || b.url).localeCompare(a.title || a.url));
  } else if (sort === 'category') {
    arr.sort((a, b) => a.category.localeCompare(b.category) || (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
  }
}

// ─── Folder View (nested tree) ───
function buildFolderTree(bookmarks) {
  const tree = {};
  for (const b of bookmarks) {
    const folder = b.chromeFolder || 'Unfiled';
    if (!tree[folder]) tree[folder] = [];
    tree[folder].push(b);
  }
  return tree;
}

function renderFolderView() {
  const filtered = getFilteredBookmarks();
  sortBookmarks(filtered);
  statsBar.textContent = `${filtered.length} bookmark${filtered.length !== 1 ? 's' : ''} indexed`;

  if (filtered.length === 0) {
    bookmarksList.innerHTML = '';
    emptyState.classList.remove('hidden');
    return;
  }
  emptyState.classList.add('hidden');

  const tree = buildFolderTree(filtered);
  const folders = Object.keys(tree).sort();

  // Expand state
  if (!window._folderExpandState) window._folderExpandState = {};
  const expandState = window._folderExpandState;

  let html = '';
  for (const folder of folders) {
    const expanded = expandState[folder] !== false; // default expanded
    const items = tree[folder];
    const folderId = 'folder-' + folder.replace(/[^a-zA-Z0-9]/g, '-');

    html += `
      <div class="folder-group mb-3">
        <div class="folder-header flex items-center gap-2 py-2 px-3 rounded-xs cursor-pointer select-none bg-surface-card border-2 border-border-default shadow-clay-sidebar text-text-base hover:bg-surface-raised/40 transition-all duration-instant" data-folder="${esc(folder)}">
          <span class="folder-arrow text-text-base text-xs transition-transform ${expanded ? 'rotate-90' : ''}">▶</span>
          <svg class="w-4 h-4 text-text-base shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z"/></svg>
          <span class="text-sm font-bold text-text-base">${esc(folder)}</span>
          <span class="${BADGE_DARK} text-xs">${items.length}</span>
        </div>
        <div class="folder-children ${expanded ? '' : 'hidden'} pl-4" id="${folderId}">
          ${items.map((b, i) => renderBookmarkCard(b, i)).join('')}
        </div>
      </div>
    `;
  }

  bookmarksList.innerHTML = html;
  attachBookmarkListeners();

  // Folder toggle listeners
  bookmarksList.querySelectorAll('.folder-header').forEach(el => {
    el.addEventListener('click', () => {
      const folder = el.dataset.folder;
      const children = el.nextElementSibling;
      const arrow = el.querySelector('.folder-arrow');
      const isExpanded = !children.classList.contains('hidden');
      children.classList.toggle('hidden');
      arrow.classList.toggle('rotate-90');
      if (!window._folderExpandState) window._folderExpandState = {};
      window._folderExpandState[folder] = !isExpanded;
    });
  });
}

function renderBookmarkCard(b, i) {
  const selected = selectedUrls.has(b.url) ? 'bg-surface-raised/30 shadow-clay' : '';
  return `
    <article class="${CARD} mb-3 transition-all duration-fast group relative ${selected} pl-12"
         data-url="${esc(b.url)}" data-index="${i}" draggable="${editMode}">
      <input type="checkbox" class="bookmark-check absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 rounded-xs bg-surface-card border-2 border-border-default text-accent-green focus:ring-accent-green cursor-pointer" ${selectedUrls.has(b.url) ? 'checked' : ''}>
      ${editMode ? `<div class="drag-handle absolute left-0 top-0 bottom-0 w-8 flex items-center justify-center cursor-grab text-text-secondary hover:text-text-base">⠿</div>` : ''}
      <div class="flex items-start justify-between gap-space-3">
        <div class="min-w-0 flex-1">
          <h3 class="text-sm font-bold text-text-base truncate">${esc(b.title || b.url)}</h3>
          <p class="text-xs text-text-secondary truncate mt-space-1">${esc(b.url)}</p>
          ${b.description ? `<p class="text-xs text-text-secondary mt-space-1 line-clamp-1">${esc(b.description)}</p>` : ''}
        </div>
        <div class="flex flex-col items-end gap-space-1 shrink-0">
          ${b.contentType ? `<span class="${BADGE_DARK} text-xs">${esc(b.contentType)}</span>` : ''}
          ${b.category && b.category !== 'Uncategorized' ? `<span class="${BADGE} text-xs">${esc(b.category)}${b.subcategory ? ' / ' + esc(b.subcategory) : ''}</span>` : ''}
          ${b.tags?.length ? `<div class="flex flex-wrap gap-space-1 mt-space-1">${b.tags.map(t => `<span class="${BADGE_DARK} text-xs">${esc(t)}</span>`).join('')}</div>` : ''}
        </div>
      </div>
      <div class="flex items-center justify-between mt-space-3 pt-space-3 border-t-2 border-border-default">
        <span class="text-xs text-text-secondary">${formatDate(b.dateAdded)}</span>
        <div class="flex gap-space-2 items-center">
          <button class="pin-btn text-xs font-bold ${b.isPinned ? 'text-accent-green' : 'text-text-secondary hover:text-text-base'} opacity-0 group-hover:opacity-100 transition-opacity" data-url="${esc(b.url)}" data-pinned="${b.isPinned}">${b.isPinned ? '★' : '☆'}</button>
          <button class="trash-btn text-xs font-bold text-red-600 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity" data-url="${esc(b.url)}">Remove</button>
        </div>
      </div>
    </article>
  `;
}

// ─── Flat View ───
function renderBookmarks(bookmarks) {
  statsBar.textContent = `${bookmarks.length} bookmark${bookmarks.length !== 1 ? 's' : ''} indexed`;
  if (bookmarks.length === 0) { bookmarksList.innerHTML = ''; emptyState.classList.remove('hidden'); return; }
  emptyState.classList.add('hidden');

  bookmarksList.innerHTML = bookmarks.map((b, i) => renderBookmarkCard(b, i)).join('');
  attachBookmarkListeners();
}

function attachBookmarkListeners() {
  // Click to open
  bookmarksList.querySelectorAll('[data-url]').forEach(el => {
    el.addEventListener('click', (e) => {
      if (e.target.closest('.delete-btn, .trash-btn, .pin-btn, .bookmark-check, .drag-handle, .folder-header')) return;
      if (!editMode) chrome.tabs.create({ url: el.dataset.url });
    });
  });

  // Checkboxes
  bookmarksList.querySelectorAll('.bookmark-check').forEach(cb => {
    cb.addEventListener('change', (e) => {
      e.stopPropagation();
      const url = cb.closest('[data-url]').dataset.url;
      if (cb.checked) selectedUrls.add(url); else selectedUrls.delete(url);
      updateBulkBar();
      cb.closest('[data-url]').classList.toggle('border-accent-green', cb.checked);
      cb.closest('[data-url]').classList.toggle('bg-surface-raised/30', cb.checked);
    });
  });

  // Pin buttons
  bookmarksList.querySelectorAll('.pin-btn').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const url = btn.dataset.url;
      const pinned = btn.dataset.pinned === 'true';
      await updateBookmark(url, { isPinned: !pinned });
      loadBookmarks();
    });
  });

  // Trash buttons
  bookmarksList.querySelectorAll('.trash-btn').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const url = btn.dataset.url;
      if (!confirm('Move this bookmark to trash?')) return;
      await trashBookmark(url);
      loadBookmarks();
      updateTrashCount();
    });
  });

  // Drag and drop (edit mode)
  if (editMode) setupDragDrop();
}

function setupDragDrop() {
  const items = bookmarksList.querySelectorAll('[draggable="true"]');
  items.forEach(item => {
    item.addEventListener('dragstart', (e) => {
      dragSrcIndex = parseInt(item.dataset.index);
      item.classList.add('dragging');
      e.dataTransfer.effectAllowed = 'move';
    });
    item.addEventListener('dragend', () => {
      item.classList.remove('dragging');
      bookmarksList.querySelectorAll('.drag-over').forEach(el => el.classList.remove('drag-over'));
    });
    item.addEventListener('dragover', (e) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      item.classList.add('drag-over', 'border-accent-green', 'bg-surface-raised/20', 'shadow-clay-sidebar');
    });
    item.addEventListener('dragleave', () => item.classList.remove('drag-over', 'border-accent-green', 'bg-surface-raised/20', 'shadow-clay-sidebar'));
    item.addEventListener('drop', async (e) => {
      e.preventDefault();
      item.classList.remove('drag-over', 'border-accent-green', 'bg-surface-raised/20', 'shadow-clay-sidebar');
      const dropIndex = parseInt(item.dataset.index);
      if (dragSrcIndex === null || dragSrcIndex === dropIndex) return;

      const filtered = getFilteredBookmarks();
      const [moved] = filtered.splice(dragSrcIndex, 1);
      filtered.splice(dropIndex, 0, moved);

      for (let i = 0; i < filtered.length; i++) {
        await updateBookmark(filtered[i].url, { sortOrder: i });
      }
      loadBookmarks();
    });
  });
}

function getFilteredBookmarks() {
  const q = searchInput.value.trim().toLowerCase();
  let list = allBookmarks;
  if (q) {
    list = list.filter(b => {
      const hay = `${b.title} ${b.url} ${b.description} ${b.category} ${b.subcategory} ${b.chromeFolder} ${(b.keywords || []).join(' ')} ${(b.tags || []).join(' ')}`.toLowerCase();
      return hay.includes(q);
    });
  }
  sortBookmarks(list);
  return list;
}

searchInput.addEventListener('input', () => {
  const filtered = getFilteredBookmarks();
  const q = searchInput.value.trim();
  if (q) { filterInfo.textContent = `${filtered.length} results for "${q}"`; filterInfo.classList.remove('hidden'); }
  else { filterInfo.classList.add('hidden'); }
  renderCurrentView();
});

sortSelect.addEventListener('change', () => {
  renderCurrentView();
});

// Edit mode toggle
editModeBtn.addEventListener('click', () => {
  editMode = !editMode;
  editModeBtn.textContent = editMode ? 'Done' : 'Edit';
  editModeBtn.classList.toggle('bg-surface-raised', editMode);
  editModeBtn.classList.toggle('shadow-clay-sidebar', editMode);
  if (!editMode) { selectedUrls.clear(); updateBulkBar(); }
  renderCurrentView();
});

// View toggle (folder ↔ flat)
viewToggleBtn.addEventListener('click', () => {
  viewMode = viewMode === 'folder' ? 'flat' : 'folder';
  viewToggleBtn.textContent = viewMode === 'folder' ? 'Folders' : 'Flat';
  viewToggleBtn.classList.toggle('bg-surface-raised', viewMode === 'flat');
  viewToggleBtn.classList.toggle('shadow-clay-sidebar', viewMode === 'flat');
  renderCurrentView();
});

// ─── Bulk Actions ───
const bulkBar = document.getElementById('bulkBar');
const selectedCountEl = document.getElementById('selectedCount');
const selectAllBtn = document.getElementById('selectAllBtn');
const deselectAllBtn = document.getElementById('deselectAllBtn');
const bulkCategory = document.getElementById('bulkCategory');
const bulkMoveBtn = document.getElementById('bulkMoveBtn');
const bulkTagBtn = document.getElementById('bulkTagBtn');
const bulkExportBtn = document.getElementById('bulkExportBtn');
const bulkDeleteBtn = document.getElementById('bulkDeleteBtn');

Object.values(CATEGORIES).forEach(cat => {
  const opt = document.createElement('option');
  opt.value = cat; opt.textContent = cat;
  bulkCategory.appendChild(opt);
});

function updateBulkBar() {
  const count = selectedUrls.size;
  bulkBar.classList.toggle('hidden', count === 0);
  selectedCountEl.textContent = `${count} selected`;
}

selectAllBtn.addEventListener('click', () => {
  getFilteredBookmarks().forEach(b => selectedUrls.add(b.url));
  updateBulkBar();
  renderCurrentView();
});

deselectAllBtn.addEventListener('click', () => {
  selectedUrls.clear();
  updateBulkBar();
  renderCurrentView();
});

bulkMoveBtn.addEventListener('click', async () => {
  const cat = bulkCategory.value;
  if (!cat || selectedUrls.size === 0) return;
  for (const url of selectedUrls) {
    await updateBookmark(url, { category: cat, 'manualOverrides.category': true });
  }
  selectedUrls.clear();
  updateBulkBar();
  loadBookmarks();
});

bulkTagBtn.addEventListener('click', async () => {
  const tags = prompt('Enter tags (comma-separated):');
  if (!tags) return;
  const tagList = tags.split(',').map(t => t.trim()).filter(Boolean);
  for (const url of selectedUrls) {
    const b = allBookmarks.find(x => x.url === url);
    if (b) {
      const existing = b.tags || [];
      await updateBookmark(url, { tags: [...new Set([...existing, ...tagList])] });
    }
  }
  selectedUrls.clear();
  updateBulkBar();
  loadBookmarks();
});

bulkExportBtn.addEventListener('click', () => {
  const selected = allBookmarks.filter(b => selectedUrls.has(b.url));
  downloadJson(selected);
});

bulkDeleteBtn.addEventListener('click', async () => {
  if (!confirm(`Move ${selectedUrls.size} bookmarks to trash?`)) return;
  for (const url of selectedUrls) await trashBookmark(url);
  selectedUrls.clear();
  updateBulkBar();
  loadBookmarks();
  updateTrashCount();
});

// ─── Trash ───
const trashList = document.getElementById('trashList');
const trashEmpty = document.getElementById('trashEmpty');
const trashInfo = document.getElementById('trashInfo');
const emptyTrashBtn = document.getElementById('emptyTrashBtn');
const trashCountEl = document.getElementById('trashCount');

async function loadTrash() {
  const items = await getTrashedBookmarks();
  trashInfo.textContent = `${items.length} item${items.length !== 1 ? 's' : ''}`;
  if (items.length === 0) { trashList.innerHTML = ''; trashEmpty.classList.remove('hidden'); return; }
  trashEmpty.classList.add('hidden');

  trashList.innerHTML = items.map(b => `
    <div class="${CARD} flex items-center justify-between gap-3 opacity-75">
      <div class="min-w-0 flex-1">
        <h3 class="text-sm font-bold text-text-base truncate">${esc(b.title || b.url)}</h3>
        <p class="text-xs text-text-secondary truncate">${esc(b.url)}</p>
        <p class="text-xs text-text-secondary mt-space-1">Trashed: ${formatDate(b.trashedAt)}</p>
      </div>
      <button class="restore-btn ${BTN_SECONDARY} text-xs shrink-0" data-url="${esc(b.url)}">Restore</button>
    </div>
  `).join('');

  trashList.querySelectorAll('.restore-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      await restoreBookmark(btn.dataset.url);
      loadTrash();
      updateTrashCount();
    });
  });
}

emptyTrashBtn.addEventListener('click', async () => {
  const items = await getTrashedBookmarks();
  if (!confirm(`Permanently delete ${items.length} bookmarks? This cannot be undone.`)) return;
  const count = await emptyTrash();
  for (const b of items) {
    try {
      const results = await chrome.bookmarks.search({ url: b.url });
      for (const node of results) await chrome.bookmarks.remove(node.id);
    } catch { /* ignore */ }
  }
  loadTrash();
  updateTrashCount();
});

async function updateTrashCount() {
  const items = await getTrashedBookmarks();
  if (items.length > 0) {
    trashCountEl.textContent = items.length;
    trashCountEl.classList.remove('hidden');
  } else {
    trashCountEl.classList.add('hidden');
  }
}

// ─── Settings ───
const autoOrganizeToggle = document.getElementById('autoOrganizeToggle');
const duplicatePolicy = document.getElementById('duplicatePolicy');
const defaultSort = document.getElementById('defaultSort');
const openrouterApiKey = document.getElementById('openrouterApiKey');
const openrouterModel = document.getElementById('openrouterModel');
const semanticSearch = document.getElementById('semanticSearch');
const aiTagSuggest = document.getElementById('aiTagSuggest');
const aiStatus = document.getElementById('aiStatus');
const trashAutoPurge = document.getElementById('trashAutoPurge');
const trashMaxSize = document.getElementById('trashMaxSize');
const clearDbBtn = document.getElementById('clearDbBtn');
const clearStatus = document.getElementById('clearStatus');
const runSyncBtn = document.getElementById('runSyncBtn');
const syncProgress = document.getElementById('syncProgress');
const syncStatus = document.getElementById('syncStatus');
const syncPercent = document.getElementById('syncPercent');
const syncBar = document.getElementById('syncBar');
const syncUrl = document.getElementById('syncUrl');

async function initSettings() {
  const s = await getSettings();
  autoOrganizeToggle.checked = s.autoOrganize;
  duplicatePolicy.value = s.duplicatePolicy;
  defaultSort.value = s.defaultSort || 'manual';
  sortSelect.value = s.defaultSort || 'manual';
  openrouterApiKey.value = s.openrouterApiKey || '';
  // Migrate legacy model ids (e.g. 'openrouter/free') to the new list
  const savedModel = s.openrouterModel || 'google/gemini-2.5-flash-lite';
  openrouterModel.value = [...openrouterModel.options].some(o => o.value === savedModel)
    ? savedModel
    : 'google/gemini-2.5-flash-lite';
  semanticSearch.checked = s.semanticSearch || false;
  aiTagSuggest.checked = s.aiTagSuggest !== false;
  trashAutoPurge.value = s.trashAutoPurgeDays ?? 30;
  trashMaxSize.value = s.trashMaxSize || 500;
  updateAiStatus(s);
}

function updateAiStatus(s) {
  if (s.openrouterApiKey) {
    aiStatus.textContent = 'AI enabled — ' + (s.openrouterModel || 'google/gemini-2.5-flash-lite');
    aiStatus.className = 'text-sm text-accent-green';
  } else {
    aiStatus.textContent = 'AI disabled — add an API key to enable';
    aiStatus.className = 'text-sm text-text-secondary';
  }
}

async function saveSetting(key, value) {
  const s = await getSettings();
  s[key] = value;
  await saveSettings(s);
}

autoOrganizeToggle.addEventListener('change', () => saveSetting('autoOrganize', autoOrganizeToggle.checked));
duplicatePolicy.addEventListener('change', () => saveSetting('duplicatePolicy', duplicatePolicy.value));
defaultSort.addEventListener('change', () => { saveSetting('defaultSort', defaultSort.value); sortSelect.value = defaultSort.value; sortSelect.dispatchEvent(new Event('change')); });
openrouterApiKey.addEventListener('change', async () => { await saveSetting('openrouterApiKey', openrouterApiKey.value.trim()); updateAiStatus(await getSettings()); });
openrouterModel.addEventListener('change', async () => { await saveSetting('openrouterModel', openrouterModel.value); updateAiStatus(await getSettings()); });
semanticSearch.addEventListener('change', () => saveSetting('semanticSearch', semanticSearch.checked));
aiTagSuggest.addEventListener('change', () => saveSetting('aiTagSuggest', aiTagSuggest.checked));
trashAutoPurge.addEventListener('change', () => saveSetting('trashAutoPurgeDays', parseInt(trashAutoPurge.value)));
trashMaxSize.addEventListener('change', () => saveSetting('trashMaxSize', parseInt(trashMaxSize.value)));

// Sync progress
chrome.runtime.onMessage.addListener((message) => {
  if (message.type === 'SYNC_PROGRESS') {
    const { current, total, url } = message;
    const percent = total > 0 ? Math.round((current / total) * 100) : 0;
    syncBar.style.width = percent + '%';
    syncPercent.textContent = percent + '%';

    // Update hero buttons with progress
    if (organizeAllBtn?.disabled) organizeAllBtn.textContent = 'Organizing... ' + percent + '%';
    if (refreshIndexBtn?.disabled) refreshIndexBtn.textContent = 'Refreshing... ' + percent + '%';

    if (current < total) {
      syncStatus.textContent = `Processing ${current} of ${total}...`;
      syncUrl.textContent = url || '';
    } else {
      syncStatus.textContent = 'Sync complete!';
      syncUrl.textContent = '';
      setTimeout(() => {
        syncProgress.classList.add('hidden');
        syncBar.style.width = '0%';
        runSyncBtn.disabled = false;
        runSyncBtn.classList.remove('opacity-50', 'cursor-not-allowed');
        // Reset hero buttons
        if (organizeAllBtn?.disabled) {
          organizeAllBtn.textContent = organizeAllBtn.dataset.originalText || 'Organize All';
          organizeAllBtn.disabled = false;
          organizeAllBtn.classList.remove('opacity-70', 'cursor-not-allowed');
        }
        if (refreshIndexBtn?.disabled) {
          refreshIndexBtn.textContent = refreshIndexBtn.dataset.originalText || 'Refresh Index';
          refreshIndexBtn.disabled = false;
          refreshIndexBtn.classList.remove('opacity-70', 'cursor-not-allowed');
        }
        loadBookmarks();
      }, 2000);
    }
  }
});

runSyncBtn.addEventListener('click', () => {
  console.log('Organize All clicked');
  runSyncBtn.disabled = true;
  runSyncBtn.classList.add('opacity-50', 'cursor-not-allowed');
  syncProgress.classList.remove('hidden');
  syncBar.style.width = '0%';
  syncPercent.textContent = '0%';
  syncStatus.textContent = 'Starting...';

  // Keep service worker alive via port — Chrome won't kill SW with open port
  const port = chrome.runtime.connect({ name: 'sync-keepalive' });

  chrome.runtime.sendMessage({ type: 'START_BULK_SYNC' }, (response) => {
    console.log('Sync response:', response);
    port.disconnect(); // Sync done, release keepalive
  });
});

// Hero buttons — organizeAllBtn and refreshIndexBtn
const organizeAllBtn = document.getElementById('organizeAllBtn');
const refreshIndexBtn = document.getElementById('refreshIndexBtn');

function startSyncFromHero(btn, label) {
  btn.disabled = true;
  btn.dataset.originalText = btn.textContent;
  btn.textContent = label + '... 0%';
  btn.classList.add('opacity-70', 'cursor-not-allowed');

  syncProgress.classList.remove('hidden');
  syncBar.style.width = '0%';
  syncPercent.textContent = '0%';
  syncStatus.textContent = 'Starting...';

  const port = chrome.runtime.connect({ name: 'sync-keepalive' });
  chrome.runtime.sendMessage({ type: 'START_BULK_SYNC' }, (response) => {
    console.log('Sync response:', response);
    port.disconnect();
  });
}

organizeAllBtn?.addEventListener('click', () => startSyncFromHero(organizeAllBtn, 'Organizing'));
refreshIndexBtn?.addEventListener('click', () => startSyncFromHero(refreshIndexBtn, 'Refreshing'));

clearDbBtn.addEventListener('click', async () => {
  if (!confirm('Clear all indexed bookmarks? Chrome bookmarks are untouched.')) return;
  clearDbBtn.disabled = true;
  try {
    await clearAllBookmarks();
    allBookmarks = [];
    renderBookmarks([]);
    clearStatus.classList.remove('hidden');
    setTimeout(() => clearStatus.classList.add('hidden'), 3000);
  } finally { clearDbBtn.disabled = false; }
});

// ─── Data: Export/Import ───
const exportJsonBtn = document.getElementById('exportJson');
const exportCsvBtn = document.getElementById('exportCsv');
const exportHtmlBtn = document.getElementById('exportHtml');
const exportStatus = document.getElementById('exportStatus');
const importFile = document.getElementById('importFile');
const importBtn = document.getElementById('importBtn');
const importFileName = document.getElementById('importFileName');
const importPreview = document.getElementById('importPreview');
const importPreviewText = document.getElementById('importPreviewText');
const importConfirmBtn = document.getElementById('importConfirmBtn');
const importProgress = document.getElementById('importProgress');
const importBar = document.getElementById('importBar');
const importStatus = document.getElementById('importStatus');

let pendingImport = [];

function downloadFile(content, filename, type) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

function downloadJson(bookmarks) {
  downloadFile(JSON.stringify(bookmarks, null, 2), 'bookmarks-export.json', 'application/json');
  exportStatus.textContent = `Exported ${bookmarks.length} bookmarks as JSON.`;
  exportStatus.classList.remove('hidden');
  setTimeout(() => exportStatus.classList.add('hidden'), 3000);
}

function downloadCsv(bookmarks) {
  const headers = ['title', 'url', 'category', 'subcategory', 'tags', 'description', 'dateAdded'];
  const rows = bookmarks.map(b => headers.map(h => {
    const v = h === 'tags' ? (b.tags || []).join('; ') : (b[h] || '');
    return `"${String(v).replace(/"/g, '""')}"`;
  }).join(','));
  downloadFile([headers.join(','), ...rows].join('\n'), 'bookmarks-export.csv', 'text/csv');
  exportStatus.textContent = `Exported ${bookmarks.length} bookmarks as CSV.`;
  exportStatus.classList.remove('hidden');
  setTimeout(() => exportStatus.classList.add('hidden'), 3000);
}

function downloadHtml(bookmarks) {
  let html = '<!DOCTYPE NETSCAPE-Bookmark-file-1>\n<!-- This is an automatically generated file.\n     It will be read and overwritten.\n     DO NOT EDIT! -->\n<META HTTP-EQUIV="Content-Type" CONTENT="text/html; charset=UTF-8">\n<TITLE>Bookmarks</TITLE>\n<H1>Bookmarks</H1>\n<DL><p>\n';
  const grouped = {};
  bookmarks.forEach(b => {
    const cat = b.category || 'Uncategorized';
    if (!grouped[cat]) grouped[cat] = [];
    grouped[cat].push(b);
  });
  for (const [cat, items] of Object.entries(grouped)) {
    const ts = Math.floor(Date.now() / 1000);
    html += `    <DT><H3>${esc(cat)}</H3>\n    <DL><p>\n`;
    items.forEach(b => {
      const addDate = b.dateAdded ? Math.floor(new Date(b.dateAdded).getTime() / 1000) : ts;
      html += `        <DT><A HREF="${esc(b.url)}" ADD_DATE="${addDate}">${esc(b.title || b.url)}</A>\n`;
      if (b.description) html += `        <DD>${esc(b.description)}\n`;
    });
    html += '    </DL><p>\n';
  }
  html += '</DL><p>';
  downloadFile(html, 'bookmarks-export.html', 'text/html');
  exportStatus.textContent = `Exported ${bookmarks.length} bookmarks as Chrome HTML.`;
  exportStatus.classList.remove('hidden');
  setTimeout(() => exportStatus.classList.add('hidden'), 3000);
}

exportJsonBtn.addEventListener('click', async () => { downloadJson(await getActiveBookmarks()); });
exportCsvBtn.addEventListener('click', async () => { downloadCsv(await getActiveBookmarks()); });
exportHtmlBtn.addEventListener('click', async () => { downloadHtml(await getActiveBookmarks()); });

// Import
importBtn.addEventListener('click', () => importFile.click());
importFile.addEventListener('change', async () => {
  const file = importFile.files[0];
  if (!file) return;
  importFileName.textContent = file.name;
  const text = await file.text();
  const ext = file.name.split('.').pop().toLowerCase();

  try {
    if (ext === 'json') {
      const data = JSON.parse(text);
      pendingImport = Array.isArray(data) ? data : [];
    } else if (ext === 'csv') {
      const lines = text.split('\n').filter(Boolean);
      const headers = lines[0].split(',').map(h => h.replace(/"/g, '').trim());
      pendingImport = lines.slice(1).map(line => {
        const vals = line.match(/(".*?"|[^",]+)(?=\s*,|\s*$)/g) || [];
        const obj = {};
        headers.forEach((h, i) => { obj[h] = (vals[i] || '').replace(/^"|"$/g, '').replace(/""/g, '"'); });
        if (obj.tags) obj.tags = obj.tags.split(';').map(t => t.trim()).filter(Boolean);
        return obj;
      });
    } else if (ext === 'html') {
      const parser = new DOMParser();
      const doc = parser.parseFromString(text, 'text/html');
      const links = doc.querySelectorAll('a');
      pendingImport = Array.from(links).map(a => ({
        url: a.getAttribute('href'),
        title: a.textContent,
        dateAdded: a.getAttribute('ADD_DATE') ? new Date(parseInt(a.getAttribute('ADD_DATE')) * 1000).toISOString() : new Date().toISOString(),
      })).filter(b => b.url);
    }

    const existing = await getActiveBookmarks();
    const existingUrls = new Set(existing.map(b => b.url));
    const newItems = pendingImport.filter(b => b.url && !existingUrls.has(b.url));
    const dupes = pendingImport.filter(b => b.url && existingUrls.has(b.url));

    importPreviewText.innerHTML = `<span class="font-bold text-accent-green">${newItems.length} new</span> bookmarks to import, <span class="font-bold text-amber-500">${dupes.length} duplicates</span> will be skipped.`;
    importPreview.classList.remove('hidden');
  } catch (e) {
    importPreviewText.innerHTML = `<span class="font-bold text-red-600">Failed to parse file: ${e.message}</span>`;
    importPreview.classList.remove('hidden');
  }
});

importConfirmBtn.addEventListener('click', async () => {
  if (pendingImport.length === 0) return;
  importConfirmBtn.disabled = true;
  importProgress.classList.remove('hidden');

  const existing = await getActiveBookmarks();
  const existingUrls = new Set(existing.map(b => b.url));
  const toImport = pendingImport.filter(b => b.url && !existingUrls.has(b.url));

  for (let i = 0; i < toImport.length; i++) {
    const b = toImport[i];
    const { createBookmark } = await import('../../shared/types/bookmark.js');
    await saveBookmarkForImport(createBookmark({
      url: b.url,
      title: b.title || '',
      description: b.description || '',
      category: b.category || 'Uncategorized',
      subcategory: b.subcategory || '',
      tags: b.tags || [],
      dateAdded: b.dateAdded || new Date().toISOString(),
    }));
    const pct = Math.round(((i + 1) / toImport.length) * 100);
    importBar.style.width = pct + '%';
    importStatus.textContent = `Importing ${i + 1} of ${toImport.length}...`;
  }

  importStatus.textContent = `Imported ${toImport.length} bookmarks!`;
  setTimeout(() => {
    importProgress.classList.add('hidden');
    importBar.style.width = '0%';
    importPreview.classList.add('hidden');
    importConfirmBtn.disabled = false;
    pendingImport = [];
    loadBookmarks();
  }, 1500);
});

async function saveBookmarkForImport(bookmark) {
  const db = await initDB();
  await db.put('bookmarks', bookmark);
}

// ─── Rules: Custom Domain Mappings ───
const rulesList = document.getElementById('rulesList');
const ruleDomain = document.getElementById('ruleDomain');
const ruleCategory = document.getElementById('ruleCategory');
const ruleSubcategory = document.getElementById('ruleSubcategory');
const addRuleBtn = document.getElementById('addRuleBtn');

Object.values(CATEGORIES).forEach(cat => {
  const opt = document.createElement('option');
  opt.value = cat; opt.textContent = cat;
  ruleCategory.appendChild(opt);
});

async function renderRules() {
  const s = await getSettings();
  const mappings = s.customDomainMappings || {};
  const entries = Object.entries(mappings);
  if (entries.length === 0) {
    rulesList.innerHTML = '<p class="text-sm text-text-secondary">No custom rules defined.</p>';
    return;
  }
  rulesList.innerHTML = entries.map(([domain, m]) => `
    <div class="${CARD} flex items-center justify-between px-space-4 py-space-2">
      <div class="flex items-center gap-space-3">
        <span class="text-sm font-mono font-bold text-text-base">${esc(domain)}</span>
        <span class="text-sm text-text-secondary">→</span>
        <span class="${BADGE} text-xs">${esc(m.category)}${m.subcategory ? ' / ' + esc(m.subcategory) : ''}</span>
      </div>
      <button class="remove-rule ${BTN_DANGER} text-xs" data-domain="${esc(domain)}">Remove</button>
    </div>
  `).join('');

  rulesList.querySelectorAll('.remove-rule').forEach(btn => {
    btn.addEventListener('click', async () => {
      const s = await getSettings();
      delete s.customDomainMappings[btn.dataset.domain];
      await saveSettings(s);
      renderRules();
    });
  });
}

addRuleBtn.addEventListener('click', async () => {
  const domain = ruleDomain.value.trim().toLowerCase();
  const cat = ruleCategory.value;
  const sub = ruleSubcategory.value.trim();
  if (!domain || !cat) return;
  const s = await getSettings();
  if (!s.customDomainMappings) s.customDomainMappings = {};
  s.customDomainMappings[domain] = { category: cat, subcategory: sub };
  await saveSettings(s);
  ruleDomain.value = '';
  ruleSubcategory.value = '';
  renderRules();
});

// ─── Review: Uncategorized Bookmarks ───
const reviewList = document.getElementById('reviewList');
const reviewEmpty = document.getElementById('reviewEmpty');
const reviewStats = document.getElementById('reviewStats');
const batchCategorizeBtn = document.getElementById('batchCategorizeBtn');
const batchProgress = document.getElementById('batchProgress');
const batchStatus = document.getElementById('batchStatus');
const batchPercent = document.getElementById('batchPercent');
const batchBar = document.getElementById('batchBar');
const uncatCountEl = document.getElementById('uncatCount');

async function loadReview() {
  try {
    const { getUncategorizedBookmarks } = await import('../../core/ai-classifier/batchCategorizer.js');
    const items = await getUncategorizedBookmarks();

    if (items.length === 0) {
      reviewList.innerHTML = '';
      reviewEmpty.classList.remove('hidden');
      reviewStats.textContent = '';
      uncatCountEl.classList.add('hidden');
      return;
    }

    reviewEmpty.classList.add('hidden');
    reviewStats.textContent = `${items.length} bookmark${items.length !== 1 ? 's' : ''} need categorization`;
    uncatCountEl.textContent = items.length;
    uncatCountEl.classList.remove('hidden');

    reviewList.innerHTML = items.map(b => `
      <div class="${CARD} flex items-start gap-space-3">
        <div class="min-w-0 flex-1">
          <h3 class="text-sm font-bold text-text-base truncate">${esc(b.title || 'untitled')}</h3>
          <p class="text-xs text-text-secondary truncate mt-space-1">${esc(b.url)}</p>
          ${b.description ? `<p class="text-xs text-text-secondary mt-space-1 line-clamp-1">${esc(b.description)}</p>` : ''}
          <div class="flex gap-space-2 mt-space-2">
            ${b.domain ? `<span class="${BADGE_DARK} text-xs">${esc(b.domain)}</span>` : ''}
            ${b.contentType ? `<span class="${BADGE_DARK} text-xs">${esc(b.contentType)}</span>` : ''}
          </div>
        </div>
      </div>
    `).join('');
  } catch (e) {
    console.error('Failed to load review:', e);
    reviewList.innerHTML = '<p class="text-sm font-bold text-red-600">Failed to load uncategorized bookmarks.</p>';
  }
}

batchCategorizeBtn.addEventListener('click', async () => {
  try {
    const { runBatchCategorize } = await import('../../core/ai-classifier/batchCategorizer.js');
    const settings = await getSettings();
    if (!settings.openrouterApiKey) {
      alert('Add an OpenRouter API key in Settings to use AI categorization.');
      return;
    }

    batchCategorizeBtn.disabled = true;
    batchCategorizeBtn.classList.add('opacity-50', 'cursor-not-allowed');
    batchProgress.classList.remove('hidden');
    batchBar.style.width = '0%';
    batchPercent.textContent = '0%';
    batchStatus.textContent = 'Starting...';

    const { processed, categorized, errors } = await runBatchCategorize(settings, (current, total) => {
      const pct = total > 0 ? Math.round((current / total) * 100) : 0;
      batchBar.style.width = pct + '%';
      batchPercent.textContent = pct + '%';
      batchStatus.textContent = `Processing ${current} of ${total}...`;
    });

    if (errors && errors.length > 0) {
      batchStatus.textContent = `Failed: ${categorized}/${processed} categorized. First error: ${errors[0]}`;
      console.error('Batch categorize errors:', errors);
    } else if (processed === 0) {
      batchStatus.textContent = 'No uncategorized bookmarks found.';
    } else {
      batchStatus.textContent = `Done! Categorized ${categorized} of ${processed} bookmarks.`;
    }

    setTimeout(() => {
      batchProgress.classList.add('hidden');
      batchBar.style.width = '0%';
      batchCategorizeBtn.disabled = false;
      batchCategorizeBtn.classList.remove('opacity-50', 'cursor-not-allowed');
      loadReview();
      loadBookmarks();
    }, 2000);
  } catch (e) {
    console.error('Batch categorize failed:', e);
    batchStatus.textContent = `Error: ${e.message}`;
    batchCategorizeBtn.disabled = false;
    batchCategorizeBtn.classList.remove('opacity-50', 'cursor-not-allowed');
  }
});

// ─── Init ───
const hash = location.hash.replace('#', '');
const validTabs = ['home', 'trash', 'settings', 'data', 'rules', 'review'];
switchTab(validTabs.includes(hash) ? hash : 'home');
await initSettings();
await loadBookmarks();
updateTrashCount();
