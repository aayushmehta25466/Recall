import { useEffect, useMemo, useRef, useState } from 'react';
import { CARD, BADGE, BADGE_DARK, ICON_SOLID_BTN } from '../ui.js';
import { api, sendMessage, storageGet, storageSet, closeSidebar } from '../platform.js';

/**
 * The one search surface used by both the toolbar popup and the side panel.
 *
 * Faithful React port of shared/ui/searchPanel.js (mountSearchPanel): same DOM contract,
 * same class strings, same message shapes — only the mechanism changed (state instead of
 * innerHTML patching). `variant` covers the differences that genuinely exist:
 * close button behaviour and autofocus.
 */

const HISTORY_KEY = 'searchHistory';
const MAX_HISTORY = 20;

const ACTION_BAR_CLASS = 'flex items-center gap-1.5 p-1.5 flex-wrap bg-surface-card rounded-sm border-2 border-border-default shadow-clay text-text-base mb-2';
const CHIP_BASE = 'category-filter px-2.5 py-1 text-[11px] font-semibold border rounded-full cursor-pointer whitespace-nowrap transition-all';
const CHIP_OFF = 'bg-surface-inset text-text-secondary border-border-default hover:bg-accent-green hover:text-white hover:border-accent-green';
const CHIP_ON = 'bg-accent-green text-white border-accent-green';

const HEADER_BTN = 'p-1.5 rounded-sm text-text-secondary border-2 border-border-default bg-surface-card hover:text-text-base hover:bg-surface-raised hover:border-accent-green transition-all cursor-pointer';
const HEADER_BTN_RED = 'p-1.5 rounded-sm text-text-secondary border-2 border-border-default bg-surface-card hover:text-text-base hover:bg-surface-raised hover:border-accent-red transition-all cursor-pointer';
const SEARCH_INPUT = 'w-full bg-surface-inset border-2 border-border-default rounded-sm text-sm text-text-base px-3 py-2 placeholder-text-secondary shadow-clay-inset focus-visible:outline-[3px] focus-visible:outline-solid focus-visible:outline-accent-blue focus-visible:outline-offset-2 min-h-[40px]';
const RESULTS_SHELL = 'flex-1 overflow-y-auto flex flex-col gap-2 [&::-webkit-scrollbar]:w-2 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:bg-border-muted [&::-webkit-scrollbar-thumb]:rounded-xs';
const HISTORY_SHELL = 'absolute top-full left-0 right-0 mt-1 bg-surface-card border-2 border-border-default rounded-sm shadow-clay z-50 max-h-48 overflow-y-auto';

const BTN_SOLID_GREEN = 'flex items-center gap-1 text-xs font-bold border-2 border-accent-green rounded-sm bg-accent-green text-white shadow-clay-btn select-none transition-all duration-fast min-h-[26px] px-1.5 py-0.5 cursor-pointer hover:-translate-y-[1px] hover:shadow-clay-btn-hover active:translate-y-[1px] active:shadow-clay-pressed focus-visible:outline-[3px] focus-visible:outline-solid focus-visible:outline-accent-green focus-visible:outline-offset-2';
const BTN_SOLID_RED = BTN_SOLID_GREEN.replace('border-accent-green', 'border-accent-red').replace('bg-accent-green', 'bg-accent-red').replace('outline-accent-green', 'outline-accent-red');

/* ── icons (identical paths to the vanilla markup) ─────────────────────── */

const HomeIcon = () => (
  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m-4 0a1 1 0 01-1-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 01-1 1h-2z" /></svg>
);
const SettingsIcon = () => (
  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
);
const OrganizeIcon = () => (
  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
);
const TrashIcon = () => (
  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
);
const CloseIcon = () => (
  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" /></svg>
);
const OpenTabIcon = ({ className }) => (
  <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" /></svg>
);
const CheckIcon = () => (
  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M5 13l4 4L19 7" /></svg>
);
const XIcon = () => (
  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M6 18L18 6M6 6l12 12" /></svg>
);
const SpinnerIcon = () => (
  <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" /></svg>
);

/* ── theme + history helpers (same storage shape as the vanilla file) ──── */

function applyTheme() {
  storageGet('sync', 'settings').then(({ settings }) => {
    const theme = settings?.theme || 'auto';
    const isDark = theme === 'dark'
      || (theme === 'auto' && window.matchMedia('(prefers-color-scheme: dark)').matches);
    document.documentElement.classList.toggle('dark', isDark);
    document.documentElement.classList.toggle('light', !isDark);
  });
}

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

export default function SearchPanel({ variant = 'popup' }) {
  const [allResults, setAllResults] = useState([]);
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({ total: 0, categories: 0, uncategorized: 0 });
  const [knownCategories, setKnownCategories] = useState([]);
  const [currentCategory, setCurrentCategory] = useState('all');
  const [selected, setSelected] = useState(() => new Set());
  const [fading, setFading] = useState(() => new Set());
  const [organizing, setOrganizing] = useState(false);
  const [historyQueries, setHistoryQueries] = useState([]);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [syncing, setSyncing] = useState(false);

  const inputRef = useRef(null);
  const historyRef = useRef(null);
  const filtersRef = useRef(null);
  const allChkRef = useRef(null);
  const reqIdRef = useRef(0);
  const selectedRef = useRef(selected);
  selectedRef.current = selected;

  const visible = useMemo(
    () => (currentCategory === 'all'
      ? allResults
      : allResults.filter((b) => b.category === currentCategory)),
    [allResults, currentCategory],
  );

  /* data --------------------------------------------------------------- */

  const loadStats = () => sendMessage({ type: 'SEARCH', query: '' }).then((response) => {
    if (!response?.results) return;
    const categories = new Set(response.results.map((b) => b.category).filter(Boolean));
    const uncategorized = response.results.filter((b) => !b.category || b.category === 'Uncategorized').length;
    setStats({ total: response.results.length, categories: categories.size, uncategorized });
    setKnownCategories([...categories]);
  });

  const loadAllBookmarks = () => {
    const id = ++reqIdRef.current;
    return sendMessage({ type: 'SEARCH', query: '' }).then((response) => {
      if (id !== reqIdRef.current) return; // a newer request already rendered
      if (response?.results) setAllResults(response.results);
      setLoading(false);
    });
  };

  const runSearch = (searchQuery) => {
    const id = ++reqIdRef.current;
    return sendMessage({ type: 'SEARCH', query: searchQuery }).then((response) => {
      if (id !== reqIdRef.current) return;
      setAllResults(response?.results || []);
      setLoading(false);
    });
  };

  /* actions ------------------------------------------------------------ */

  const openTabs = (urls) => {
    if (urls.length === 0) return;
    if (urls.length === 1) {
      api.tabs.create({ url: urls[0], active: true });
      return;
    }
    sendMessage({ type: 'OPEN_IN_TAB_GROUP', urls });
  };

  const selectAllResults = () => setSelected(new Set(visible.map((b) => b.url)));
  const deselectAllResults = () => setSelected(new Set());

  const toggleUrl = (url) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(url)) next.delete(url); else next.add(url);
      return next;
    });
  };

  const openSelected = () => {
    openTabs([...selectedRef.current]);
    setSelected(new Set());
  };

  const fadeOutAndDrop = (urls, onDone) => {
    setFading((prev) => {
      const next = new Set(prev);
      urls.forEach((u) => next.add(u));
      return next;
    });
    setTimeout(() => {
      setAllResults((prev) => prev.filter((b) => !urls.includes(b.url)));
      setFading((prev) => {
        const next = new Set(prev);
        urls.forEach((u) => next.delete(u));
        return next;
      });
      if (onDone) onDone();
    }, 200);
  };

  const trashSelected = () => {
    const urls = [...selectedRef.current];
    if (urls.length === 0) return;
    if (!confirm(`Move ${urls.length} bookmark${urls.length > 1 ? 's' : ''} to trash?`)) return;

    let done = 0;
    urls.forEach((url) => {
      sendMessage({ type: 'TRASH_BOOKMARK', url }).then(() => {
        done += 1;
        fadeOutAndDrop([url]);
        if (done === urls.length) {
          setSelected(new Set());
          loadStats();
        }
      });
    });
  };

  const removeSingle = (url) => {
    sendMessage({ type: 'TRASH_BOOKMARK', url }).then(() => {
      setSelected((prev) => {
        const next = new Set(prev);
        next.delete(url);
        return next;
      });
      fadeOutAndDrop([url], loadStats);
    });
  };

  const organize = () => {
    setOrganizing(true);
    sendMessage({ type: 'START_BULK_SYNC' }).then(() => {
      setOrganizing(false);
      loadStats();
      loadAllBookmarks();
    });
  };

  const onQueryInput = (value) => {
    setQuery(value);
    setSelected(new Set());
    const trimmed = value.trim();
    if (trimmed.length > 0) {
      setHistoryOpen(false);
      addToHistory(trimmed);
      runSearch(trimmed);
    } else {
      setHistoryOpen(false);
      loadAllBookmarks();
    }
  };

  const useHistoryQuery = (q) => {
    setQuery(q);
    setHistoryOpen(false);
    setSelected(new Set());
    addToHistory(q);
    runSearch(q);
  };

  const removeHistoryQuery = async (q) => {
    await removeFromHistory(q);
    const updated = await getRecentQueries(10);
    setHistoryQueries(updated);
    if (updated.length === 0) setHistoryOpen(false);
  };

  /* effects ------------------------------------------------------------ */

  useEffect(() => { applyTheme(); }, []);

  // initial load (vanilla: loadStats(); loadAllBookmarks(); checkSyncStatus();)
  useEffect(() => {
    loadStats();
    loadAllBookmarks();
    sendMessage({ type: 'GET_SYNC_STATUS' }).then((response) => {
      if (response?.isSyncing) setSyncing(true);
    });
    if (variant === 'sidebar') inputRef.current?.focus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Ctrl/Cmd+K focus and Escape clear (document-level, with cleanup)
  useEffect(() => {
    const onKeyDown = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        inputRef.current?.focus();
        inputRef.current?.select();
      }
      if (e.key === 'Escape') {
        setQuery('');
        setSelected(new Set());
        setHistoryOpen(false);
        reqIdRef.current += 1;
        loadAllBookmarks();
        inputRef.current?.blur();
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // click outside the input/history hides the history dropdown
  useEffect(() => {
    const onDocClick = (e) => {
      const wrap = historyRef.current;
      if (inputRef.current && !inputRef.current.contains(e.target) && wrap && !wrap.contains(e.target)) {
        setHistoryOpen(false);
      }
    };
    document.addEventListener('click', onDocClick);
    return () => document.removeEventListener('click', onDocClick);
  }, []);

  // vertical wheel scrolls the chip rail horizontally when it overflows
  useEffect(() => {
    const rail = filtersRef.current;
    if (!rail) return undefined;
    const onWheel = (e) => {
      if (e.deltaY === 0) return;
      if (rail.scrollWidth <= rail.clientWidth) return;
      e.preventDefault();
      rail.scrollLeft += e.deltaY;
    };
    rail.addEventListener('wheel', onWheel, { passive: false });
    return () => rail.removeEventListener('wheel', onWheel);
  }, [knownCategories.length]);

  // tri-state master checkbox (React has no indeterminate attribute)
  useEffect(() => {
    const cb = allChkRef.current;
    if (!cb) return;
    const checkedCount = visible.filter((b) => selected.has(b.url)).length;
    cb.checked = visible.length > 0 && checkedCount === visible.length;
    cb.indeterminate = checkedCount > 0 && checkedCount < visible.length;
  });

  const historyVisible = historyOpen && historyQueries.length > 0;
  const emptyMessage = allResults.length === 0
    ? 'No bookmarks indexed yet — run "Organize All".'
    : 'No bookmarks found in this category.';

  return (
    <>
      <header className="flex items-center justify-between gap-2 mb-2">
        <div className="flex items-center gap-2 min-w-0">
          <span className="inline-block w-2.5 h-2.5 rounded-full bg-accent-green shrink-0"></span>
          <h1 className="text-md font-extrabold tracking-tight text-text-base truncate">Recall</h1>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <button id="homeBtn" title="Open home" className={HEADER_BTN}
            onClick={() => api.tabs.create({ url: api.runtime.getURL('options/index.html#home') })}>
            <HomeIcon />
          </button>
          <button id="settingsBtn" title="Settings" className={HEADER_BTN}
            onClick={() => api.tabs.create({ url: api.runtime.getURL('options/index.html#settings') })}>
            <SettingsIcon />
          </button>
          <button id="organizeBtn" title="Organize all bookmarks" className={HEADER_BTN}
            disabled={organizing || syncing} onClick={organize}>
            {organizing || syncing ? <SpinnerIcon /> : <OrganizeIcon />}
          </button>
          <button id="trashBtn" title="Open trash" className={HEADER_BTN_RED}
            onClick={() => api.tabs.create({ url: api.runtime.getURL('options/index.html#trash') })}>
            <TrashIcon />
          </button>
          <button id="closeBtn" title={variant === 'sidebar' ? 'Close panel' : 'Close'} className={HEADER_BTN_RED}
            onClick={() => { if (variant === 'sidebar') closeSidebar(); else window.close(); }}>
            <CloseIcon />
          </button>
        </div>
      </header>

      <div className="relative mb-2">
        <input
          ref={inputRef}
          type="text"
          id="searchInput"
          placeholder="Search bookmarks..."
          className={SEARCH_INPUT}
          autoComplete="off"
          value={query}
          onChange={(e) => onQueryInput(e.target.value)}
          onFocus={() => {
            if (inputRef.current && inputRef.current.value.trim().length === 0) {
              getRecentQueries(10).then((queries) => {
                if (queries.length > 0) {
                  setHistoryQueries(queries);
                  setHistoryOpen(true);
                }
              });
            }
          }}
        />
        <div ref={historyRef} id="searchHistory" className={`${historyVisible ? '' : 'hidden '}${HISTORY_SHELL}`}>
          {historyQueries.map((q) => (
            <div key={q} className="flex items-center justify-between px-3 py-2 hover:bg-surface-raised cursor-pointer group"
              onClick={() => useHistoryQuery(q)}>
              <span className="text-sm text-text-base">{q}</span>
              <button className="text-text-secondary hover:text-accent-red opacity-0 group-hover:opacity-100 transition-opacity"
                onClick={(e) => { e.stopPropagation(); removeHistoryQuery(q); }}>
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
          ))}
        </div>
      </div>

      <div className="flex items-center justify-between gap-2 mb-1.5 text-[11px] text-text-secondary">
        <div className="truncate">
          <span id="totalCount" className="font-bold text-text-base">{stats.total}</span>
          {' '}bookmarks ·{' '}
          <span id="categoryCount" className="font-bold text-text-base">{stats.categories}</span>
          {' '}categories ·{' '}
          <span id="uncategorizedCount" className="font-bold text-text-base">{stats.uncategorized}</span>
          {' '}uncategorized
        </div>
      </div>

      <div ref={filtersRef} id="categoryFilters" className="flex gap-1.5 flex-nowrap overflow-x-auto mb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {['all', ...[...knownCategories].sort((a, b) => a.localeCompare(b))].map((cat) => (
          <button
            key={cat}
            data-category={cat}
            className={`${CHIP_BASE} ${cat === currentCategory ? CHIP_ON : CHIP_OFF}`}
            onClick={() => { setCurrentCategory(cat); setSelected(new Set()); }}
          >
            {cat === 'all' ? 'All' : cat}
          </button>
        ))}
      </div>

      <div id="actionBar" className={visible.length > 0 && selected.size > 0 ? ACTION_BAR_CLASS : 'hidden'}>
        {visible.length > 0 && (
          <>
            <span className="flex items-center gap-1 text-xs font-bold text-accent-green min-w-[28px]">
              <CheckIcon />
              <span id="selectedCount">{selected.size}</span>
            </span>
            <label className="flex items-center gap-1.5 cursor-pointer select-none text-[11px] font-semibold text-text-base" title="Select all results">
              <input ref={allChkRef} type="checkbox" id="actionAllChk" className="w-4 h-4 rounded-xs border-2 border-border-default accent-accent-green cursor-pointer"
                onChange={(e) => (e.target.checked ? selectAllResults() : deselectAllResults())} />
              <span>Select all</span>
            </label>
            <button id="deselectAllResultsBtn" className={ICON_SOLID_BTN} title="Deselect all" onClick={deselectAllResults}>
              <XIcon />
            </button>
            <div className="flex items-center gap-2 ml-auto">
              <button id="openSelectedBtn" className={BTN_SOLID_GREEN} title="Open selected in new tabs" onClick={openSelected}>
                <OpenTabIcon className="w-3.5 h-3.5" />
                <span id="openSelectedLabel">{selected.size}</span>
              </button>
              <button id="trashSelectedBtn" className={BTN_SOLID_RED} title="Move selected to trash" onClick={trashSelected}>
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                <span id="trashSelectedLabel">{selected.size}</span>
              </button>
            </div>
          </>
        )}
      </div>

      <div id="resultsContainer" className={RESULTS_SHELL}>
        {loading ? (
          <div className="flex items-center justify-center h-full text-text-secondary text-sm">
            Loading bookmarks…
          </div>
        ) : visible.length === 0 ? (
          <div className="flex items-center justify-center h-full text-text-secondary text-sm">
            {emptyMessage}
          </div>
        ) : visible.map((result) => (
          <article
            key={result.url}
            data-url={result.url}
            className={`${CARD} flex items-start gap-3${selected.has(result.url) ? ' bg-surface-raised/30' : ''}${fading.has(result.url) ? ' opacity-0 translate-x-5 transition-all duration-200' : ''}`}
          >
            <input
              type="checkbox"
              className="result-check mt-1 w-5 h-5 rounded-xs border-2 border-border-default accent-accent-green focus:ring-surface-raised shrink-0 cursor-pointer"
              checked={selected.has(result.url)}
              onChange={() => toggleUrl(result.url)}
            />
            <div className="min-w-0 flex-1 cursor-pointer" onClick={() => api.tabs.create({ url: result.url })}>
              <div className="flex justify-between items-start gap-2">
                <h3 className="text-sm font-bold text-text-base truncate">{result.title || result.url}</h3>
                {result.contentType && <span className={`${BADGE_DARK} text-xs shrink-0`}>{result.contentType}</span>}
              </div>
              <p className="text-xs text-text-secondary truncate mt-1">{result.url}</p>
              <div className="flex gap-2 mt-2">
                {result.category && (
                  <span className={`${BADGE} text-xs`}>{result.category}{result.subcategory ? ` / ${result.subcategory}` : ''}</span>
                )}
              </div>
            </div>
            <div className="flex flex-col gap-1 shrink-0">
              <button className="open-btn p-1.5 rounded-sm text-text-secondary hover:text-accent-green hover:bg-surface-raised transition-colors" title="Open in new tab"
                onClick={(e) => { e.stopPropagation(); api.tabs.create({ url: result.url }); }}>
                <OpenTabIcon className="w-4 h-4" />
              </button>
              <button className="remove-btn p-1.5 rounded-sm text-text-secondary hover:text-accent-red hover:bg-surface-raised transition-colors" title="Move to trash"
                onClick={(e) => { e.stopPropagation(); removeSingle(result.url); }}>
                <TrashIcon />
              </button>
            </div>
          </article>
        ))}
      </div>
    </>
  );
}
