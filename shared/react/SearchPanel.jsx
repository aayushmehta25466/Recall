import { useEffect, useMemo, useRef, useState } from 'react';
import { CARD, BADGE, BADGE_DARK, ICON_SOLID_BTN } from '../ui.js';
import { api, sendMessage, storageGet, storageSet, closeSidebar } from '../platform.js';

/**
 * The one search surface used by both the toolbar popup and the side panel.
 *
 * React port of shared/ui/searchPanel.js — the markup and class strings are byte-identical
 * to the vanilla version (visual zero-change migration). `variant` covers only the
 * differences that genuinely exist between the two surfaces.
 */

const HISTORY_KEY = 'searchHistory';
const MAX_HISTORY = 20;

const ACTION_BAR_CLASS = 'flex items-center gap-1.5 p-1.5 flex-wrap bg-surface-card rounded-sm border-2 border-border-default shadow-clay text-text-base mb-2';
const CHIP_BASE = 'category-filter px-2.5 py-1 text-[11px] font-semibold border rounded-full cursor-pointer whitespace-nowrap transition-all';
const CHIP_OFF = 'bg-surface-inset text-text-secondary border-border-default hover:bg-accent-green hover:text-white hover:border-accent-green';
const CHIP_ON = 'bg-accent-green text-white border-accent-green';

const HOME_ICON = (
  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
  </svg>
);

const SPINNER_ICON = (
  <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
  </svg>
);

const OPEN_TABS_ICON = (
  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
  </svg>
);

const TRASH_ICON = (
  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2">
    <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
  </svg>
);

const SELECT_ALL_ICON = (
  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
  </svg>
);

const CLEAR_SEL_ICON = (
  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
  </svg>
);

function applyTheme() {
  storageGet('sync', 'settings').then(({ settings }) => {
    const theme = settings?.theme || 'auto';
    const isDark = theme === 'dark'
      || (theme === 'auto' && window.matchMedia('(prefers-color-scheme: dark)').matches);
    document.documentElement.classList.toggle('dark', isDark);
    document.body.classList.toggle('dark', isDark);
  });
}

async function loadHistory() {
  const { [HISTORY_KEY]: history = [] } = await storageGet('local', HISTORY_KEY);
  return history;
}

async function saveHistory(query) {
  const trimmed = query.trim();
  if (!trimmed) return;
  let history = await loadHistory();
  history = history.filter(q => q.toLowerCase() !== trimmed.toLowerCase());
  history.unshift(trimmed);
  if (history.length > MAX_HISTORY) history = history.slice(0, MAX_HISTORY);
  await storageSet('local', { [HISTORY_KEY]: history });
}

function groupByCategory(results) {
  const groups = new Map();
  results.forEach(result => {
    const category = result.category || 'Uncategorized';
    if (!groups.has(category)) {
      groups.set(category, {
        name: category,
        icon: result.categoryIcon || 'folder',
        results: [],
      });
    }
    groups.get(category).results.push(result);
  });
  return [...groups.values()].sort((a, b) => {
    if (a.name === 'Uncategorized') return 1;
    if (b.name === 'Uncategorized') return -1;
    return a.name.localeCompare(b.name);
  });
}

function ResultCard({ item, isSelected, onToggle }) {
  const badgeClass = item.inTrash ? BADGE_DARK : BADGE;
  const badgeText = item.inTrash ? 'TRASHED' : (item.contentType || '').toUpperCase();
  return (
    <div className={`${CARD} cursor-pointer relative p-space-4`} data-url={item.url} onClick={() => onToggle(item.url)}>
      <div className="absolute top-space-3 right-space-3">
        <input
          type="checkbox"
          className="bookmark-checkbox w-4 h-4 rounded-xs border-2 border-border-default accent-accent-green cursor-pointer"
          checked={isSelected}
          readOnly
          onClick={e => e.stopPropagation()}
          onChange={() => onToggle(item.url)}
        />
      </div>
      <div className="flex items-start gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            <h3 className="font-bold text-sm text-text-base truncate" dangerouslySetInnerHTML={{ __html: item.title || 'Untitled' }} />
            <span className={`${badgeClass} text-[10px]`}>{badgeText}</span>
          </div>
          <div className="flex items-center gap-2 text-xs text-text-muted flex-wrap">
            <span className="font-bold text-accent-blue">{item.category || 'Uncategorized'}</span>
            {item.subcategory && (<><span>•</span><span>{item.subcategory}</span></>)}
          </div>
          {item.tags && item.tags.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-2">
              {item.tags.map(tag => (
                <span key={tag} className="text-[10px] px-1.5 py-0.5 bg-surface-inset rounded-xs text-text-secondary">#{tag}</span>
              ))}
            </div>
          )}
          <div className="flex items-center gap-2 mt-2 text-xs text-text-secondary flex-wrap">
            <span className="truncate max-w-[200px]" title={item.url} dangerouslySetInnerHTML={{ __html: item.url }} />
            <span>•</span>
            <span>{new Date(item.createdAt).toLocaleDateString()}</span>
          </div>
        </div>
        {item.favicon && <img src={item.favicon} alt="" className="w-6 h-6 rounded-xs mt-1" onError={e => { e.target.style.display = 'none'; }} />}
      </div>
    </div>
  );
}

function Chip({ label, icon, active, onClick }) {
  return (
    <button
      className={`${CHIP_BASE} ${active ? CHIP_ON : CHIP_OFF}`}
      onClick={onClick}
      dangerouslySetInnerHTML={{ __html: `${icon || ''} ${label}` }}
    />
  );
}

function CategoryGroup({ group, selected, onToggle }) {
  const [open, setOpen] = useState(true);
  return (
    <div className="mb-4" data-category={group.name}>
      <div
        className="flex items-center gap-2 cursor-pointer select-none mb-2 px-1 py-1 rounded-sm hover:bg-surface-raised transition-all"
        onClick={() => setOpen(o => !o)}
      >
        <span className="text-accent-blue" dangerouslySetInnerHTML={{ __html: group.icon }} />
        <span className="font-bold text-sm text-text-base">{group.name}</span>
        <span className="text-xs text-text-secondary bg-surface-inset px-2 py-0.5 rounded-full">{group.results.length}</span>
        <span className={`text-text-secondary transition-transform ml-auto ${open ? 'rotate-90' : ''}`}>
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7" />
          </svg>
        </span>
      </div>
      {open && (
        <div className="flex flex-col gap-2">
          {group.results.map(item => (
            <ResultCard key={item.url} item={item} isSelected={selected.has(item.url)} onToggle={onToggle} />
          ))}
        </div>
      )}
    </div>
  );
}

export default function SearchPanel({ variant }) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [stats, setStats] = useState(null);
  const [selected, setSelected] = useState(() => new Set());
  const [aiRunning, setAiRunning] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [searching, setSearching] = useState(false);
  const [history, setHistory] = useState([]);
  const [activeChip, setActiveChip] = useState('all');

  const searchInputRef = useRef(null);
  const debounceRef = useRef(null);
  const lastQueryRef = useRef('');
  const selectedRef = useRef(selected);
  selectedRef.current = selected;

  // Theme (was applied at module load in the vanilla version)
  useEffect(() => { applyTheme(); }, []);

  // Search history for the dropdown
  useEffect(() => { loadHistory().then(setHistory); }, []);

  // AI batch progress listener — always attached while the panel is open
  useEffect(() => {
    const onMessage = (message) => {
      if (message.type === 'AI_BATCH_PROGRESS') {
        setAiRunning(!message.done);
      }
    };
    api.runtime.onMessage.addListener(onMessage);
    return () => api.runtime.onMessage.removeListener(onMessage);
  }, []);

  const grouped = useMemo(() => groupByCategory(results), [results]);
  const visibleGroups = useMemo(() => {
    if (activeChip === 'all') return grouped;
    return grouped.filter(g => g.name === activeChip);
  }, [grouped, activeChip]);
  const hasResults = results.length > 0;

  const performSearch = (searchQuery) => {
    const q = searchQuery.trim();
    if (!q || q === lastQueryRef.current) return;
    lastQueryRef.current = q;
    setShowHistory(false);
    setSearching(true);
    setStats(null);
    sendMessage({ type: 'SEARCH', query: q })
      .then(response => {
        setResults(response.results || []);
        setStats(response.stats || null);
        setSelected(new Set());
        setActiveChip('all');
        saveHistory(q).then(() => loadHistory().then(setHistory));
      })
      .catch(() => setResults([]))
      .finally(() => setSearching(false));
  };

  const onQueryChange = (value) => {
    setQuery(value);
    if (!value.trim()) {
      lastQueryRef.current = '';
      setResults([]);
      setStats(null);
      setSelected(new Set());
      setActiveChip('all');
      return;
    }
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => performSearch(value), 150);
  };

  const useHistoryQuery = (q) => {
    setQuery(q);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    performSearch(q);
  };

  const toggleUrl = (url) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(url)) next.delete(url); else next.add(url);
      return next;
    });
  };

  const trashSelected = () => {
    const urls = [...selectedRef.current];
    if (urls.length === 0) return;
    sendMessage({ type: 'TRASH_BOOKMARK', urls })
      .then(() => {
        setResults(prev => prev.filter(r => !selectedRef.current.has(r.url)));
        setSelected(new Set());
        sendMessage({ type: 'SEARCH', query: query.trim() })
          .then(response => {
            setResults(response.results || []);
            setStats(response.stats || null);
          })
          .catch(() => {});
      })
      .catch(() => {});
  };

  const openTabs = () => {
    const sel = [...selectedRef.current];
    if (sel.length === 0) return;
    if (variant === 'sidebar') {
      sendMessage({ type: 'OPEN_IN_TAB_GROUP', urls: sel }).then(() => closeSidebar()).catch(() => {});
    } else {
      sel.forEach(url => api.tabs.create({ url }));
    }
  };

  const selectAllResults = () => setSelected(new Set(results.map(r => r.url)));
  const deselectAllResults = () => setSelected(new Set());

  const openHome = () => {
    if (api.tabs) api.tabs.create({ url: api.runtime.getURL('options/index.html#home') });
    else api.runtime.openOptionsPage();
  };

  return (
    <>
      <header className="flex items-center justify-between gap-2 mb-2">
        <div className="flex items-center gap-2 min-w-0">
          <span className="inline-block w-2.5 h-2.5 rounded-full bg-accent-green shrink-0"></span>
          <h1 className="text-md font-extrabold tracking-tight text-text-base truncate">Recall</h1>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <button id="homeBtn" title="Open home" onClick={openHome} className="p-1.5 rounded-sm text-text-secondary border-2 border-border-default bg-surface-card hover:text-text-base hover:bg-surface-raised hover:border-accent-green transition-all cursor-pointer">
            {HOME_ICON}
          </button>
          <button id="closeSidebarBtn" title="Close sidebar" style={{ display: variant === 'sidebar' ? undefined : 'none' }} onClick={() => closeSidebar()} className="p-1.5 rounded-sm text-text-secondary border-2 border-border-default bg-surface-card hover:text-text-base hover:bg-surface-raised hover:border-accent-red transition-all cursor-pointer">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      </header>

      <div className={`${CARD} p-space-3 flex-shrink-0`}>
        <div className="relative mb-2" id="searchWrap">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-text-secondary pointer-events-none">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
          </span>
          <input
            ref={searchInputRef}
            id="searchInput"
            type="text"
            placeholder="Search bookmarks..."
            autoComplete="off"
            value={query}
            onChange={e => onQueryChange(e.target.value)}
            onFocus={() => { if (!query) { loadHistory().then(setHistory); setShowHistory(true); } }}
            onBlur={() => setTimeout(() => setShowHistory(false), 150)}
            onKeyDown={e => {
              if (e.key === 'Escape') { setQuery(''); onQueryChange(''); }
            }}
            className="w-full bg-surface-inset border-2 border-border-default rounded-sm text-sm text-text-base pl-10 pr-10 py-space-2 placeholder-text-secondary shadow-clay-inset focus-visible:outline-[3px] focus-visible:outline-solid focus-visible:outline-accent-green focus-visible:outline-offset-2 min-h-[44px]"
          />
          {query && (
            <button id="clearSearchBtn" title="Clear search" onClick={() => { setQuery(''); onQueryChange(''); searchInputRef.current?.focus(); }} className="absolute right-3 top-1/2 -translate-y-1/2 text-text-secondary hover:text-text-base transition-colors cursor-pointer">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          )}
          {searching && (
            <span id="searchSpinner" className="absolute right-3 top-1/2 -translate-y-1/2 text-accent-green">
              {SPINNER_ICON}
            </span>
          )}
        </div>

        {showHistory && history.length > 0 && (
          <div id="searchHistoryList" className="mt-2 pt-2 border-t-2 border-border-default">
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-xs font-bold text-text-secondary">Recent Searches</span>
              <button id="clearHistoryBtn" onClick={() => { storageSet('local', { [HISTORY_KEY]: [] }).then(() => setHistory([])); }} className="text-xs text-accent-blue hover:underline cursor-pointer">Clear</button>
            </div>
            <div className="flex flex-col">
              {history.map(q => (
                <div key={q} className="flex items-center justify-between gap-2 px-2 py-1 rounded-xs hover:bg-surface-inset transition-colors group">
                  <button className="flex items-center gap-2 min-w-0 flex-1 text-left text-xs text-text-base cursor-pointer" onMouseDown={e => e.preventDefault()} onClick={() => useHistoryQuery(q)}>
                    <span className="text-text-secondary shrink-0">
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                    </span>
                    <span className="truncate">{q}</span>
                  </button>
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      className="text-[10px] px-1.5 py-0.5 rounded-xs bg-accent-green text-white opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
                      onMouseDown={e => e.preventDefault()}
                      onClick={() => { setQuery(q); onQueryChange(q); setShowHistory(false); }}
                    >Use</button>
                    <button
                      className="text-[10px] px-1.5 py-0.5 rounded-xs bg-surface-inset text-text-secondary hover:bg-accent-red hover:text-white transition-colors cursor-pointer"
                      onMouseDown={e => e.preventDefault()}
                      onClick={() => { const nq = history.filter(item => item !== q); storageSet('local', { [HISTORY_KEY]: nq }).then(() => setHistory(nq)); }}
                    >✕</button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {(hasResults || stats || aiRunning) && (
          <div className="text-xs text-text-secondary">
            {aiRunning && (
              <span className="flex items-center gap-1.5 text-accent-orange">
                <span className="animate-spin inline-block w-3 h-3 border-2 border-accent-orange border-t-transparent rounded-full"></span>
                AI categorization running...
              </span>
            )}
            {stats && (
              <div className="flex items-center gap-3 flex-wrap">
                {typeof stats.aiClassified === 'number' && stats.aiClassified > 0 && (
                  <span className="text-accent-green">✨ AI: {stats.aiClassified} categorized</span>
                )}
                {stats.byCategory && Object.entries(stats.byCategory).slice(0, 3).map(([cat, count]) => (
                  <span key={cat}>{cat}: {count}</span>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {hasResults && (
        <div className="flex items-center gap-1.5 flex-wrap mb-2" id="categoryChips">
          <Chip label="All" icon="" active={activeChip === 'all'} onClick={() => setActiveChip('all')} />
          {grouped.length > 1 && grouped.map(group => (
            <Chip
              key={group.name}
              label={group.name}
              icon={group.icon}
              active={activeChip === group.name}
              onClick={() => setActiveChip(activeChip === group.name ? 'all' : group.name)}
            />
          ))}
        </div>
      )}

      {hasResults && selected.size > 0 && (
        <div id="actionBar" className={ACTION_BAR_CLASS}>
          <span id="selectedCount" className="text-xs font-semibold mr-1">{selected.size} selected</span>
          <button onClick={openTabs} title="Open selected in tabs" className={`${ICON_SOLID_BTN} hover:!border-accent-green`} id="openTabsBtn">
            {OPEN_TABS_ICON}
          </button>
          <button onClick={trashSelected} title="Trash selected" className={`${ICON_SOLID_BTN} hover:!border-accent-red`} id="trashSelectedBtn">
            {TRASH_ICON}
          </button>
          <button onClick={selectAllResults} title="Select all" className={ICON_SOLID_BTN} id="selectAllBtn">
            {SELECT_ALL_ICON}
          </button>
          <button onClick={deselectAllResults} title="Deselect all" className={ICON_SOLID_BTN} id="deselectAllBtn">
            {CLEAR_SEL_ICON}
          </button>
        </div>
      )}

      <div id="resultsContainer" className="flex-1 overflow-y-auto">
        {hasResults && activeChip === 'all' && grouped.map(group => (
          <CategoryGroup key={group.name} group={group} selected={selected} onToggle={toggleUrl} />
        ))}
        {hasResults && activeChip !== 'all' && visibleGroups.map(group => (
          <div key={group.name} className="flex flex-col gap-2">
            {group.results.map(item => (
              <ResultCard key={item.url} item={item} isSelected={selected.has(item.url)} onToggle={toggleUrl} />
            ))}
          </div>
        ))}
        {!hasResults && query && !searching && (
          <div id="noResults" className="text-center py-8 text-text-secondary">
            <svg className="w-12 h-12 mx-auto mb-4 text-text-secondary opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
            </svg>
            <p className="text-sm mb-2">No bookmarks found</p>
            <p className="text-xs text-text-muted">Try different keywords or check your filters</p>
          </div>
        )}
      </div>
    </>
  );
}
