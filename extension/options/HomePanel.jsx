import { useEffect, useMemo, useRef, useState } from 'react';
import { updateBookmark } from '../../database/indexeddb/db.js';
import { sendMessage } from '../../shared/platform.js';
import { CATEGORIES } from '../../shared/types/taxonomy.js';
import { CARD, BADGE, BADGE_DARK } from '../../shared/ui.js';
import { downloadJson } from './exporters.js';
import { startSync, useSyncState } from './syncState.js';
import { useOptions } from './OptionsContext.jsx';

// Faithful React port of the home/bookmarks block that lived in options.js
// (search + sort, folder/flat views, edit mode, drag reorder, bulk actions).
// The data layer stays in options.js — assignCategory and the settings flows
// read allBookmarks there — and is pulled in through the cached dynamic
// import below: options.js must never be statically imported, its top-level
// init needs the committed DOM.
let vanillaMod;
function vanilla() {
  if (!vanillaMod) vanillaMod = import('./options.js');
  return vanillaMod;
}

function formatDate(iso) {
  if (!iso) return '';
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

// Port of options.js sortBookmarks with the sort key passed in instead of
// reading the select element.
function sortList(arr, sort) {
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
    arr.sort(
      (a, b) =>
        a.category.localeCompare(b.category) ||
        (a.sortOrder ?? 0) - (b.sortOrder ?? 0)
    );
  }
}

const DRAG_CLASSES = [
  'drag-over',
  'border-accent-green',
  'bg-surface-raised/20',
  'shadow-clay-sidebar',
];

export default function HomePanel({ active }) {
  const [items, setItems] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState(() => new Set());
  const [editMode, setEditModeState] = useState(false);
  const [viewMode, setViewMode] = useState('folder');
  const [bulkCat, setBulkCat] = useState('');
  const [expandMap, setExpandMap] = useState({});
  const [draggingIndex, setDraggingIndex] = useState(null);
  const [dragOverIndex, setDragOverIndex] = useState(null);
  const selectAllRef = useRef(null);
  const sync = useSyncState();
  const { sort, setSort, refreshTrashCount, customCategories } = useOptions();

  const applyList = (list) => {
    setItems(list);
    setLoaded(true);
  };

  const load = async () => {
    const mod = await vanilla();
    applyList(await mod.loadBookmarks());
  };

  // Mount: register the refresh hook so vanilla callers of loadBookmarks()
  // (trash restore, sync, rules, clear-db) push data here the way
  // renderCurrentView did, then pull the first snapshot.
  useEffect(() => {
    (async () => {
      const mod = await vanilla();
      mod.setHomeRefresh(applyList);
      await load();
    })();
    // mount-only: options page never unmounts HomePanel
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // A finished bulk sync refreshes the list once the progress bar clears,
  // matching the vanilla SYNC_PROGRESS handler's delayed loadBookmarks().
  useEffect(() => {
    if (!sync.complete) return;
    const t = setTimeout(() => load(), 2000);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sync.complete]);

  // getFilteredBookmarks port: search narrows, then sort (over a copy —
  // vanilla sorted the shared array in place).
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    let list = items;
    if (q) {
      list = list.filter((b) => {
        const hay = `${b.title} ${b.url} ${b.description} ${b.category} ${b.subcategory} ${b.chromeFolder} ${(b.keywords || []).join(' ')} ${(b.tags || []).join(' ')}`.toLowerCase();
        return hay.includes(q);
      });
    }
    list = [...list];
    sortList(list, sort);
    return list;
  }, [items, query, sort]);

  // Tri-state select-all: checked/indeterminate are DOM properties React
  // can't express as props — mirror them after every selection change.
  useEffect(() => {
    const el = selectAllRef.current;
    if (!el) return;
    el.checked = filtered.length > 0 && selected.size === filtered.length;
    el.indeterminate = selected.size > 0 && selected.size < filtered.length;
  }, [selected, filtered]);

  const syncPct = sync.total > 0 ? Math.round((sync.current / sync.total) * 100) : 0;
  const categoryOptions = [...new Set([...Object.values(CATEGORIES), ...customCategories])];
  const statsText = loaded
    ? `${filtered.length} bookmark${filtered.length !== 1 ? 's' : ''} indexed`
    : 'Loading...';
  const trimmedQuery = query.trim();
  const filterInfoText = trimmedQuery
    ? `${filtered.length} results for "${trimmedQuery}"`
    : '';

  const toggleUrl = (url, on) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (on) next.add(url);
      else next.delete(url);
      return next;
    });

  // attachBookmarkListeners' default onReload
  const reload = async () => {
    const mod = await vanilla();
    applyList(await mod.loadBookmarks());
    refreshTrashCount();
  };

  const toggleEdit = async () => {
    const mod = await vanilla();
    const next = !editMode;
    mod.setEditMode(next);
    setEditModeState(next);
    if (!next) setSelected(new Set());
  };

  const toggleFolder = (folder) =>
    setExpandMap((prev) => ({ ...prev, [folder]: !(prev[folder] ?? true) }));

  const onBulkMove = async () => {
    if (!bulkCat || selected.size === 0) return;
    const mod = await vanilla();
    await mod.assignCategory([...selected], bulkCat);
    setSelected(new Set());
    await load();
  };

  const onBulkTag = async () => {
    const input = prompt('Enter tags (comma-separated):');
    if (!input) return;
    const tagList = input.split(',').map((t) => t.trim()).filter(Boolean);
    for (const url of selected) {
      const b = items.find((x) => x.url === url);
      if (!b) continue;
      const existing = b.tags || [];
      await updateBookmark(url, {
        tags: [...new Set([...existing, ...tagList])],
      });
    }
    setSelected(new Set());
    await load();
  };

  const onBulkExport = () => {
    downloadJson(items.filter((b) => selected.has(b.url)));
  };

  const onBulkOpen = async () => {
    if (selected.size === 0) return;
    const urls = [...selected];
    if (urls.length === 1) {
      await chrome.tabs.create({ url: urls[0], active: true });
      setSelected(new Set());
      return;
    }
    await sendMessage({ type: 'OPEN_IN_TAB_GROUP', urls });
    setSelected(new Set());
  };

  const onBulkDelete = async () => {
    for (const url of selected) await sendMessage({ type: 'TRASH_BOOKMARK', url });
    setSelected(new Set());
    const mod = await vanilla();
    applyList(await mod.loadBookmarks());
    refreshTrashCount();
  };

  const renderCard = (b, i) => {
    const isSelected = selected.has(b.url);
    const selectedCls = isSelected ? 'bg-surface-raised/30 shadow-clay' : '';
    return (
      <article
        key={b.url}
        className={`${CARD} mb-3 transition-all duration-fast group relative ${selectedCls} pl-12${draggingIndex === i ? ' dragging opacity-50' : ''}${dragOverIndex === i ? ` ${DRAG_CLASSES.join(' ')}` : ''}`}
        data-url={b.url}
        data-index={i}
        draggable={editMode}
        onDragStart={(e) => {
          setDraggingIndex(i);
          e.dataTransfer.effectAllowed = 'move';
        }}
        onDragEnd={() => {
          setDraggingIndex(null);
          setDragOverIndex(null);
        }}
        onDragOver={(e) => {
          e.preventDefault();
          e.dataTransfer.dropEffect = 'move';
          setDragOverIndex(i);
        }}
        onDragLeave={() => setDragOverIndex((prev) => (prev === i ? null : prev))}
        onDrop={async (e) => {
          e.preventDefault();
          setDragOverIndex(null);
          const src = draggingIndex;
          setDraggingIndex(null);
          if (src === null || src === i) return;
          const list = [...filtered];
          const [moved] = list.splice(src, 1);
          list.splice(i, 0, moved);
          for (let n = 0; n < list.length; n++) {
            await updateBookmark(list[n].url, { sortOrder: n });
          }
          await load();
        }}
      >
        <input
          type="checkbox"
          className="bookmark-check absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 rounded-xs border-2 border-border-default accent-accent-green focus:ring-accent-green cursor-pointer"
          checked={isSelected}
          onChange={(e) => toggleUrl(b.url, e.target.checked)}
        />
        {editMode && (
          <div className="drag-handle absolute left-0 top-0 bottom-0 w-8 flex items-center justify-center cursor-grab text-text-secondary hover:text-text-base">
            ⠿
          </div>
        )}
        <div className="flex items-start justify-between gap-space-3">
          <div className="min-w-0 flex-1">
            <h3 className="text-sm font-bold text-text-base truncate">
              {b.title || b.url}
            </h3>
            <p className="text-xs text-text-secondary truncate mt-space-1">
              {b.url}
            </p>
            {b.description && (
              <p className="text-xs text-text-secondary mt-space-1 line-clamp-1">
                {b.description}
              </p>
            )}
          </div>
          <div className="flex flex-col items-end gap-space-1 shrink-0">
            <button
              className="open-btn p-1 rounded-sm text-text-secondary hover:text-accent-green hover:bg-surface-raised transition-colors"
              title="Open in new tab"
              data-url={b.url}
              onClick={() => chrome.tabs.create({ url: b.url })}
            >
              <svg
                className="w-4 h-4"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
                />
              </svg>
            </button>
            {b.contentType && (
              <span className={`${BADGE_DARK} text-xs`}>{b.contentType}</span>
            )}
            {b.category && b.category !== 'Uncategorized' && (
              <span className={`${BADGE} text-xs`}>
                {b.category}
                {b.subcategory ? ` / ${b.subcategory}` : ''}
              </span>
            )}
            {b.tags?.length > 0 && (
              <div className="flex flex-wrap gap-space-1 mt-space-1">
                {b.tags.map((t) => (
                  <span key={t} className={`${BADGE_DARK} text-xs`}>
                    {t}
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>
        <div className="flex items-center justify-between mt-space-3 pt-space-3 border-t-2 border-border-default">
          <span className="text-xs text-text-secondary">
            {formatDate(b.dateAdded)}
          </span>
          <div className="flex gap-space-2 items-center">
            <button
              className={`pin-btn text-xs font-bold ${
                b.isPinned
                  ? 'text-accent-green'
                  : 'text-text-secondary hover:text-text-base'
              } opacity-0 group-hover:opacity-100 transition-opacity`}
              data-url={b.url}
              data-pinned={b.isPinned}
              onClick={async () => {
                await updateBookmark(b.url, { isPinned: !b.isPinned });
                await reload();
              }}
            >
              {b.isPinned ? '★' : '☆'}
            </button>
            <button
              className="trash-btn text-xs font-bold text-red-600 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity"
              data-url={b.url}
              onClick={async () => {
                await sendMessage({ type: 'TRASH_BOOKMARK', url: b.url });
                await reload();
              }}
            >
              Remove
            </button>
          </div>
        </div>
      </article>
    );
  };

  const renderFolderView = () => {
    const tree = {};
    for (const b of filtered) {
      const folder = b.chromeFolder || 'Unfiled';
      if (!tree[folder]) tree[folder] = [];
      tree[folder].push(b);
    }
    const folders = Object.keys(tree).sort();
    return folders.map((folder) => {
      const expanded = expandMap[folder] ?? true;
      const group = tree[folder];
      const folderId = 'folder-' + folder.replace(/[^a-zA-Z0-9]/g, '-');
      return (
        <div key={folder} className="folder-group mb-3">
          <div
            className="folder-header flex items-center gap-2 py-2 px-3 rounded-xs cursor-pointer select-none bg-surface-card border-2 border-border-default shadow-clay-sidebar text-text-base hover:bg-surface-raised/40 transition-all duration-instant"
            data-folder={folder}
            onClick={() => toggleFolder(folder)}
          >
            <span
              className={`folder-arrow text-text-base text-xs transition-transform ${expanded ? 'rotate-90' : ''}`}
            >
              ▶
            </span>
            <svg
              className="w-4 h-4 text-text-base shrink-0"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z"
              />
            </svg>
            <span className="text-sm font-bold text-text-base">{folder}</span>
            <span className={`${BADGE_DARK} text-xs`}>{group.length}</span>
          </div>
          <div
            className={`folder-children ${expanded ? '' : 'hidden'} pl-4`}
            id={folderId}
          >
            {group.map((b, i) => renderCard(b, i))}
          </div>
        </div>
      );
    });
  };

  const listContent =
    viewMode === 'folder'
      ? renderFolderView()
      : filtered.map((b, i) => renderCard(b, i));

  return (
    <div
      id="homePanel"
      className={`${active ? '' : 'hidden '}max-w-5xl mx-auto px-4 sm:px-6 py-5`}
    >
      {/* Hero */}
      <div className="mb-5">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-3 mb-1">
              <div className="w-2 h-10 bg-accent-green rounded-full flex-shrink-0 shadow-clay-btn"></div>
              <h1 className="text-lg font-extrabold tracking-tight text-text-base leading-tight">
                Recall
              </h1>
            </div>
            <p className="hidden md:block text-sm text-text-muted ml-5">
              Smart search and auto-categorization for Chrome
            </p>
          </div>
          <div className="flex gap-2 flex-shrink-0 flex-wrap">
            <button
              id="refreshIndexBtn"
              className="font-primary text-sm font-bold tracking-wide border-2 border-border-default rounded-sm bg-surface-card text-text-base shadow-clay-btn select-none transition-all duration-fast ease-in-out min-h-[44px] px-space-5 py-space-2 cursor-pointer hover:-translate-y-[2px] hover:shadow-clay-btn-hover active:translate-y-[1px] active:shadow-clay-pressed focus-visible:outline-[3px] focus-visible:outline-solid focus-visible:outline-accent-green focus-visible:outline-offset-2 disabled:opacity-40 disabled:cursor-not-allowed disabled:pointer-events-none text-sm"
              disabled={sync.active}
              onClick={() => !sync.active && startSync()}
            >
              {sync.active ? `Refreshing... ${syncPct}%` : 'Refresh Index'}
            </button>
            <button
              id="organizeAllBtn"
              className="font-primary text-sm font-bold tracking-wide border-2 border-accent-green rounded-sm bg-accent-green text-white shadow-clay-btn select-none transition-all duration-fast ease-in-out min-h-[44px] px-space-5 py-space-2 cursor-pointer hover:-translate-y-[2px] hover:shadow-clay-btn-hover active:translate-y-[1px] active:shadow-clay-pressed focus-visible:outline-[3px] focus-visible:outline-solid focus-visible:outline-accent-green focus-visible:outline-offset-2 disabled:opacity-40 disabled:cursor-not-allowed disabled:pointer-events-none text-sm"
              disabled={sync.active}
              onClick={() => !sync.active && startSync()}
            >
              {sync.active ? `Organizing... ${syncPct}%` : 'Organize All'}
            </button>
          </div>
        </div>
      </div>
      <div className="flex items-center gap-2 mb-4 flex-wrap">
        <input
          type="text"
          id="searchInput"
          placeholder="Search bookmarks..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="flex-1 min-w-0 bg-surface-inset border-2 border-border-default rounded-sm text-base text-text-base px-space-4 py-space-3 placeholder-text-secondary shadow-clay-inset focus-visible:outline-[3px] focus-visible:outline-solid focus-visible:outline-accent-blue focus-visible:outline-offset-2 min-h-[48px]"
          autoComplete="off"
        />
        <select
          id="sortSelect"
          value={sort}
          onChange={(e) => setSort(e.target.value)}
          className="flex-shrink-0 w-[130px] bg-surface-inset border-2 border-border-default rounded-sm text-sm text-text-base px-space-3 py-space-2 placeholder-text-secondary shadow-clay-inset focus-visible:outline-[3px] focus-visible:outline-solid focus-visible:outline-accent-blue focus-visible:outline-offset-2 min-h-[44px] cursor-pointer"
        >
          <option value="manual">Manual</option>
          <option value="date_desc">Newest</option>
          <option value="date_asc">Oldest</option>
          <option value="title_asc">Title A-Z</option>
          <option value="title_desc">Title Z-A</option>
          <option value="category">By Category</option>
        </select>
        <button
          id="editModeBtn"
          className={`flex-shrink-0 font-primary text-sm font-bold tracking-wide border-2 border-border-default rounded-sm bg-surface-card text-text-base shadow-clay-btn select-none transition-all duration-fast ease-in-out min-h-[44px] px-space-4 py-space-2 cursor-pointer hover:-translate-y-[2px] hover:shadow-clay-btn-hover active:translate-y-[1px] active:shadow-clay-pressed focus-visible:outline-[3px] focus-visible:outline-solid focus-visible:outline-accent-green focus-visible:outline-offset-2 disabled:opacity-40 disabled:cursor-not-allowed disabled:pointer-events-none text-sm${editMode ? ' bg-surface-raised shadow-clay-sidebar' : ''}`}
          onClick={toggleEdit}
        >
          {editMode ? 'Done' : 'Edit'}
        </button>
        <button
          id="viewToggleBtn"
          className={`flex-shrink-0 font-primary text-sm font-bold tracking-wide border-2 border-border-default rounded-sm bg-surface-card text-text-base shadow-clay-btn select-none transition-all duration-fast ease-in-out min-h-[44px] px-space-4 py-space-2 cursor-pointer hover:-translate-y-[2px] hover:shadow-clay-btn-hover active:translate-y-[1px] active:shadow-clay-pressed focus-visible:outline-[3px] focus-visible:outline-solid focus-visible:outline-accent-green focus-visible:outline-offset-2 disabled:opacity-40 disabled:cursor-not-allowed disabled:pointer-events-none text-sm${viewMode === 'flat' ? ' bg-surface-raised shadow-clay-sidebar' : ''}`}
          title="Toggle folder view"
          onClick={() =>
            setViewMode((v) => (v === 'folder' ? 'flat' : 'folder'))
          }
        >
          {viewMode === 'folder' ? 'Folders' : 'Flat'}
        </button>
      </div>

      <div
        id="statsBar"
        className="flex items-center justify-between mb-3 text-sm text-text-secondary"
      >
        <span id="bookmarksCount">{statsText}</span>
        <span id="filterInfo" className={filterInfoText ? '' : 'hidden'}>
          {filterInfoText}
        </span>
      </div>

      {/* Bulk Action Bar (shows when items selected) */}
      <div
        id="bulkBar"
        className={`${selected.size === 0 ? 'hidden ' : ''}bg-surface-muted border-2 border-border-default rounded-md text-text-base shadow-clay mb-4 px-4 py-3`}
      >
        <div className="flex flex-wrap items-center gap-x-2 gap-y-2">
          {/* Row 1 (full width below lg): status + category move, stretches to fill */}
          <div className="flex flex-wrap items-center gap-x-2 gap-y-2 w-full lg:w-auto lg:flex-1 min-w-0">
            <span
              id="selectedCount"
              className="flex items-center gap-1.5 text-sm font-semibold text-text-base shrink-0"
            >
              <svg
                className="w-4 h-4 text-accent-green"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2.5}
                  d="M5 13l4 4L19 7"
                />
              </svg>
              <span>{selected.size}</span>
            </span>
            <label
              className="flex items-center gap-1.5 cursor-pointer select-none text-xs font-semibold text-text-base shrink-0"
              title="Select all visible bookmarks"
            >
              <input
                type="checkbox"
                id="selectAllChk"
                ref={selectAllRef}
                className="w-4 h-4 rounded-xs border-2 border-border-default accent-accent-green cursor-pointer"
                onChange={(e) =>
                  setSelected(
                    e.target.checked
                      ? new Set([...selected, ...filtered.map((b) => b.url)])
                      : new Set()
                  )
                }
              />
              <span>Select all</span>
            </label>
            <button
              id="deselectAllBtn"
              className="flex items-center justify-center w-6 h-6 border-2 border-border-strong rounded-xs bg-text-base text-text-on-dark shadow-clay-btn select-none transition-all duration-fast ease-in-out cursor-pointer hover:-translate-y-px hover:shadow-clay-btn-hover active:translate-y-px active:shadow-clay-pressed focus-visible:outline-[3px] focus-visible:outline-solid focus-visible:outline-accent-green focus-visible:outline-offset-2 shrink-0"
              title="Deselect all"
              onClick={() => setSelected(new Set())}
            >
              <svg
                className="w-3.5 h-3.5"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2.5}
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            </button>
            <div className="w-px h-4 bg-border-default shrink-0"></div>
            <select
              id="bulkCategory"
              value={bulkCat}
              onChange={(e) => setBulkCat(e.target.value)}
              className="flex-1 min-w-[140px] max-w-full bg-surface-inset border-2 border-border-default rounded-sm text-xs text-text-base px-space-3 py-space-1 shadow-clay-inset focus-visible:outline-[3px] focus-visible:outline-solid focus-visible:outline-accent-blue focus-visible:outline-offset-2 min-h-[36px] cursor-pointer lg:max-w-[220px]"
            >
              <option value="">Move to Category...</option>
              {categoryOptions.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
            <button
              id="bulkMoveBtn"
              className="font-primary text-xs font-bold tracking-wide border-2 border-border-strong rounded-sm bg-surface-raised text-text-base shadow-clay-btn select-none transition-all duration-fast ease-in-out min-h-[36px] px-space-4 py-space-1 cursor-pointer hover:-translate-y-px hover:shadow-clay-btn-hover active:translate-y-px active:shadow-clay-pressed focus-visible:outline-[3px] focus-visible:outline-solid focus-visible:outline-accent-green focus-visible:outline-offset-2 shrink-0"
              onClick={onBulkMove}
            >
              Move
            </button>
          </div>
          {/* Row 2 below lg, right side of the same row at lg+ */}
          <div className="flex items-center gap-2 flex-wrap w-full lg:w-auto lg:shrink-0">
            <button
              id="bulkOpenBtn"
              className="font-primary text-xs font-bold tracking-wide border-2 border-accent-green rounded-sm bg-accent-green text-white shadow-clay-btn select-none transition-all duration-fast ease-in-out min-h-[36px] px-space-4 py-space-1 cursor-pointer hover:-translate-y-px hover:shadow-clay-btn-hover active:translate-y-px active:shadow-clay-pressed focus-visible:outline-[3px] focus-visible:outline-solid focus-visible:outline-accent-green focus-visible:outline-offset-2"
              onClick={onBulkOpen}
            >
              Open
            </button>
            <button
              id="bulkTagBtn"
              className="font-primary text-xs font-bold tracking-wide border-2 border-border-default rounded-sm bg-surface-card text-text-base shadow-clay-btn select-none transition-all duration-fast ease-in-out min-h-[36px] px-space-4 py-space-1 cursor-pointer hover:-translate-y-px hover:shadow-clay-btn-hover active:translate-y-px active:shadow-clay-pressed focus-visible:outline-[3px] focus-visible:outline-solid focus-visible:outline-accent-green focus-visible:outline-offset-2"
              onClick={onBulkTag}
            >
              Tags
            </button>
            <button
              id="bulkExportBtn"
              className="font-primary text-xs font-bold tracking-wide border-2 border-border-default rounded-sm bg-surface-card text-text-base shadow-clay-btn select-none transition-all duration-fast ease-in-out min-h-[36px] px-space-4 py-space-1 cursor-pointer hover:-translate-y-px hover:shadow-clay-btn-hover active:translate-y-px active:shadow-clay-pressed focus-visible:outline-[3px] focus-visible:outline-solid focus-visible:outline-accent-green focus-visible:outline-offset-2"
              onClick={onBulkExport}
            >
              Export
            </button>
            <button
              id="bulkDeleteBtn"
              className="font-primary text-xs font-bold tracking-wide border-2 border-accent-red rounded-sm bg-accent-red text-white shadow-clay-btn select-none transition-all duration-fast ease-in-out min-h-[36px] px-space-4 py-space-1 cursor-pointer hover:-translate-y-px hover:shadow-clay-btn-hover active:translate-y-px active:shadow-clay-pressed focus-visible:outline-[3px] focus-visible:outline-solid focus-visible:outline-accent-red focus-visible:outline-offset-2 inline-flex items-center gap-1.5"
              title="Trash selected"
              onClick={onBulkDelete}
            >
              <svg
                className="w-3.5 h-3.5"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
                strokeWidth={2}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0"
                />
              </svg>
              Trash
            </button>
          </div>
        </div>
      </div>

      <div id="bookmarksList" className="flex flex-col gap-3">
        {listContent}
      </div>
      <div
        id="emptyState"
        className={`${loaded && filtered.length === 0 ? '' : 'hidden '}flex flex-col items-center justify-center py-20 text-text-secondary`}
      >
        <svg
          className="w-10 h-10 mb-2 opacity-50"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={1.5}
            d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z"
          />
        </svg>
        <p className="text-base">No bookmarks indexed yet.</p>
        <p className="text-sm mt-1">
          Run "Organize All" from Settings to get started.
        </p>
      </div>
    </div>
  );
}
