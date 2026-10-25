import { useEffect, useState } from 'react';

// Strangler shell for the options page: React owns layout, sidebar nav, hash
// routing and the mobile toggle; panel markup below is a class-for-class port
// of the original options.html. Panel logic stays in options.js — it runs
// against this DOM only after mount (import() below) and is told which panel
// became active through activateTab().
const TABS = ['home', 'trash', 'settings', 'data', 'rules', 'review'];

export default function OptionsApp() {
  const [tab, setTab] = useState(() => {
    const hash = location.hash.replace('#', '');
    return TABS.includes(hash) ? hash : 'home';
  });
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // Hash routing: clicks update the hash, hash changes update the tab
  // (covers back/forward and manual edits) — same contract as vanilla.
  const navigate = (next) => {
    location.hash = next;
    setTab(next);
    setSidebarOpen(false);
  };

  useEffect(() => {
    const onHashChange = () => {
      const hash = location.hash.replace('#', '');
      setTab(TABS.includes(hash) ? hash : 'home');
      setSidebarOpen(false);
    };
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  // Panel logic stays vanilla: import once React has committed the markup,
  // then activate lazy loaders (loadTrash/renderRules/loadReview) per tab.
  useEffect(() => {
    let cancelled = false;
    import('./options.js').then((mod) => {
      if (!cancelled) mod.activateTab(tab);
    });
    return () => {
      cancelled = true;
    };
  }, [tab]);

  return (
    <>
  {/* Overlay for mobile sidebar */}
  <div id="sidebarOverlay" className={`${sidebarOpen ? '' : 'hidden '}fixed inset-0 bg-black/40 z-40 md:hidden`}
      onClick={() => setSidebarOpen(false)}></div>

  <div className="flex h-screen overflow-hidden">
    {/* Sidebar */}
    <nav
      id="sidebar"
      className={`${sidebarOpen ? '' : '-translate-x-full '}fixed md:static inset-y-0 left-0 z-50 w-[208px] bg-surface-muted border-r-2 border-border-default flex flex-col gap-space-1 p-space-2 overflow-y-auto text-text-base transform md:translate-x-0 transition-transform duration-300 ease-in-out`} aria-label="Main navigation">
      <div className="flex items-center justify-between px-space-2 mb-space-1">
        <div>
          <h1 className="text-md font-extrabold tracking-tight text-text-base flex items-center gap-2">
            <span className="inline-block w-2 h-2 rounded-full bg-accent-green"></span>
            Recall
          </h1>
        </div>
        <button id="sidebarCloseBtn" onClick={() => setSidebarOpen(false)} className="md:hidden p-2 rounded-sm text-text-secondary hover:text-text-base hover:bg-surface-raised transition-all cursor-pointer">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"/></svg>
        </button>
      </div>

    <div>
      <div className="px-space-4 py-space-1 text-xs font-bold uppercase tracking-widest text-text-secondary">Main</div>
      <div className={`${tab === 'home' ? 'bg-surface-raised border-border-default shadow-clay-sidebar' : ''} flex items-center gap-space-2 px-space-3 py-space-2 rounded-sm cursor-pointer select-none border-2 border-transparent text-sm font-semibold text-text-base transition-all duration-fast min-h-[38px] hover:bg-surface-raised hover:border-border-default hover:shadow-clay-sidebar border-accent-green`} data-tab="home" role="tab" onClick={() => navigate('home')}>
        <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z"/></svg>
        <span>Bookmarks</span>
      </div>
      <div className={`${tab === 'trash' ? 'bg-surface-raised border-border-default shadow-clay-sidebar' : ''} flex items-center gap-space-2 px-space-3 py-space-2 rounded-sm cursor-pointer select-none border-2 border-transparent text-sm font-semibold text-text-base transition-all duration-fast min-h-[38px] hover:bg-surface-raised hover:border-border-default hover:shadow-clay-sidebar`} data-tab="trash" role="tab" onClick={() => navigate('trash')}>
        <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
        <span>Trash</span>
        <span id="trashCount" className="ml-auto bg-text-base text-text-on-dark text-xs px-space-2 py-space-1 rounded-xs border-2 border-border-strong font-bold hidden">0</span>
      </div>
    </div>

    <div>
      <div className="px-space-4 py-space-1 text-xs font-bold uppercase tracking-widest text-text-secondary">Manage</div>
      <div className={`${tab === 'settings' ? 'bg-surface-raised border-border-default shadow-clay-sidebar' : ''} flex items-center gap-space-2 px-space-3 py-space-2 rounded-sm cursor-pointer select-none border-2 border-transparent text-sm font-semibold text-text-base transition-all duration-fast min-h-[38px] hover:bg-surface-raised hover:border-border-default hover:shadow-clay-sidebar`} data-tab="settings" role="tab" onClick={() => navigate('settings')}>
        <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"/><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/></svg>
        <span>Settings</span>
      </div>
      <div className={`${tab === 'data' ? 'bg-surface-raised border-border-default shadow-clay-sidebar' : ''} flex items-center gap-space-2 px-space-3 py-space-2 rounded-sm cursor-pointer select-none border-2 border-transparent text-sm font-semibold text-text-base transition-all duration-fast min-h-[38px] hover:bg-surface-raised hover:border-border-default hover:shadow-clay-sidebar`} data-tab="data" role="tab" onClick={() => navigate('data')}>
        <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12"/></svg>
        <span>Data</span>
      </div>
      <div className={`${tab === 'rules' ? 'bg-surface-raised border-border-default shadow-clay-sidebar' : ''} flex items-center gap-space-2 px-space-3 py-space-2 rounded-sm cursor-pointer select-none border-2 border-transparent text-sm font-semibold text-text-base transition-all duration-fast min-h-[38px] hover:bg-surface-raised hover:border-border-default hover:shadow-clay-sidebar`} data-tab="rules" role="tab" onClick={() => navigate('rules')}>
        <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4"/></svg>
        <span>Rules</span>
      </div>
      <div className={`${tab === 'review' ? 'bg-surface-raised border-border-default shadow-clay-sidebar' : ''} flex items-center gap-space-2 px-space-3 py-space-2 rounded-sm cursor-pointer select-none border-2 border-transparent text-sm font-semibold text-text-base transition-all duration-fast min-h-[38px] hover:bg-surface-raised hover:border-border-default hover:shadow-clay-sidebar`} data-tab="review" role="tab" onClick={() => navigate('review')}>
        <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/></svg>
        <span>Review</span>
        <span id="uncatCount" className="ml-auto bg-text-base text-text-on-dark text-xs px-space-2 py-space-1 rounded-xs border-2 border-border-strong font-bold hidden">0</span>
      </div>
    </div>
  </nav>

  {/* Main Content */}
  <main className="flex-1 overflow-y-auto">
    {/* Mobile Header with Hamburger */}
    <div className="md:hidden sticky top-0 z-30 bg-surface-base border-b-2 border-border-default px-4 py-3 flex items-center gap-3">
      <button id="sidebarOpenBtn" onClick={() => setSidebarOpen(true)} className="p-2 rounded-sm text-text-secondary hover:text-text-base hover:bg-surface-raised transition-all cursor-pointer">
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 6h16M4 12h16M4 18h16"/></svg>
      </button>
      <span className="text-sm font-bold text-text-base">Recall</span>
    </div>

    {/* Home Panel */}
    <div id="homePanel" className={`${tab === 'home' ? '' : 'hidden '}max-w-5xl mx-auto px-4 sm:px-6 py-5`}>
      {/* Hero */}
      <div className="mb-5">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-3 mb-1">
              <div className="w-2 h-10 bg-accent-green rounded-full flex-shrink-0 shadow-clay-btn"></div>
              <h1 className="text-lg font-extrabold tracking-tight text-text-base leading-tight">Recall</h1>
            </div>
            <p className="hidden md:block text-sm text-text-muted ml-5">Smart search and auto-categorization for Chrome</p>
          </div>
          <div className="flex gap-2 flex-shrink-0 flex-wrap">
            <button id="refreshIndexBtn" className="font-primary text-sm font-bold tracking-wide border-2 border-border-default rounded-sm bg-surface-card text-text-base shadow-clay-btn select-none transition-all duration-fast ease-in-out min-h-[44px] px-space-5 py-space-2 cursor-pointer hover:-translate-y-[2px] hover:shadow-clay-btn-hover active:translate-y-[1px] active:shadow-clay-pressed focus-visible:outline-[3px] focus-visible:outline-solid focus-visible:outline-accent-green focus-visible:outline-offset-2 disabled:opacity-40 disabled:cursor-not-allowed disabled:pointer-events-none text-sm">Refresh Index</button>
            <button id="organizeAllBtn" className="font-primary text-sm font-bold tracking-wide border-2 border-accent-green rounded-sm bg-accent-green text-white shadow-clay-btn select-none transition-all duration-fast ease-in-out min-h-[44px] px-space-5 py-space-2 cursor-pointer hover:-translate-y-[2px] hover:shadow-clay-btn-hover active:translate-y-[1px] active:shadow-clay-pressed focus-visible:outline-[3px] focus-visible:outline-solid focus-visible:outline-accent-green focus-visible:outline-offset-2 disabled:opacity-40 disabled:cursor-not-allowed disabled:pointer-events-none text-sm">Organize All</button>
          </div>
        </div>
      </div>
      <div className="flex items-center gap-2 mb-4 flex-wrap">
        <input type="text" id="searchInput" placeholder="Search bookmarks..."
          className="flex-1 min-w-0 bg-surface-inset border-2 border-border-default rounded-sm text-base text-text-base px-space-4 py-space-3 placeholder-text-secondary shadow-clay-inset focus-visible:outline-[3px] focus-visible:outline-solid focus-visible:outline-accent-blue focus-visible:outline-offset-2 min-h-[48px]" autoComplete="off"/>
        <select id="sortSelect" className="flex-shrink-0 w-[130px] bg-surface-inset border-2 border-border-default rounded-sm text-sm text-text-base px-space-3 py-space-2 placeholder-text-secondary shadow-clay-inset focus-visible:outline-[3px] focus-visible:outline-solid focus-visible:outline-accent-blue focus-visible:outline-offset-2 min-h-[44px] cursor-pointer">
          <option value="manual">Manual</option>
          <option value="date_desc">Newest</option>
          <option value="date_asc">Oldest</option>
          <option value="title_asc">Title A-Z</option>
          <option value="title_desc">Title Z-A</option>
          <option value="category">By Category</option>
        </select>
        <button id="editModeBtn" className="flex-shrink-0 font-primary text-sm font-bold tracking-wide border-2 border-border-default rounded-sm bg-surface-card text-text-base shadow-clay-btn select-none transition-all duration-fast ease-in-out min-h-[44px] px-space-4 py-space-2 cursor-pointer hover:-translate-y-[2px] hover:shadow-clay-btn-hover active:translate-y-[1px] active:shadow-clay-pressed focus-visible:outline-[3px] focus-visible:outline-solid focus-visible:outline-accent-green focus-visible:outline-offset-2 disabled:opacity-40 disabled:cursor-not-allowed disabled:pointer-events-none text-sm">Edit</button>
        <button id="viewToggleBtn" className="flex-shrink-0 font-primary text-sm font-bold tracking-wide border-2 border-border-default rounded-sm bg-surface-card text-text-base shadow-clay-btn select-none transition-all duration-fast ease-in-out min-h-[44px] px-space-4 py-space-2 cursor-pointer hover:-translate-y-[2px] hover:shadow-clay-btn-hover active:translate-y-[1px] active:shadow-clay-pressed focus-visible:outline-[3px] focus-visible:outline-solid focus-visible:outline-accent-green focus-visible:outline-offset-2 disabled:opacity-40 disabled:cursor-not-allowed disabled:pointer-events-none text-sm" title="Toggle folder view">Folders</button>
      </div>

      <div id="statsBar" className="flex items-center justify-between mb-3 text-sm text-text-secondary">
        <span id="bookmarksCount">Loading...</span>
        <span id="filterInfo" className="hidden"></span>
      </div>

      {/* Bulk Action Bar (shows when items selected) */}
      <div id="bulkBar" className="hidden bg-surface-muted border-2 border-border-default rounded-md text-text-base shadow-clay mb-4 px-4 py-3">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-2">
          {/* Row 1 (full width below lg): status + category move, stretches to fill */}
          <div className="flex flex-wrap items-center gap-x-2 gap-y-2 w-full lg:w-auto lg:flex-1 min-w-0">
            <span id="selectedCount" className="flex items-center gap-1.5 text-sm font-semibold text-text-base shrink-0">
              <svg className="w-4 h-4 text-accent-green" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M5 13l4 4L19 7"/></svg>
              <span>0</span>
            </span>
            <label className="flex items-center gap-1.5 cursor-pointer select-none text-xs font-semibold text-text-base shrink-0" title="Select all visible bookmarks">
              <input type="checkbox" id="selectAllChk" className="w-4 h-4 rounded-xs border-2 border-border-default accent-accent-green cursor-pointer"/>
              <span>Select all</span>
            </label>
            <button id="deselectAllBtn" className="flex items-center justify-center w-6 h-6 border-2 border-border-strong rounded-xs bg-text-base text-text-on-dark shadow-clay-btn select-none transition-all duration-fast ease-in-out cursor-pointer hover:-translate-y-px hover:shadow-clay-btn-hover active:translate-y-px active:shadow-clay-pressed focus-visible:outline-[3px] focus-visible:outline-solid focus-visible:outline-accent-green focus-visible:outline-offset-2 shrink-0" title="Deselect all">
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M6 18L18 6M6 6l12 12"/></svg>
            </button>
            <div className="w-px h-4 bg-border-default shrink-0"></div>
            <select id="bulkCategory" className="flex-1 min-w-[140px] max-w-full bg-surface-inset border-2 border-border-default rounded-sm text-xs text-text-base px-space-3 py-space-1 shadow-clay-inset focus-visible:outline-[3px] focus-visible:outline-solid focus-visible:outline-accent-blue focus-visible:outline-offset-2 min-h-[36px] cursor-pointer lg:max-w-[220px]">
              <option value="">Move to Category...</option>
            </select>
            <button id="bulkMoveBtn" className="font-primary text-xs font-bold tracking-wide border-2 border-border-strong rounded-sm bg-surface-raised text-text-base shadow-clay-btn select-none transition-all duration-fast ease-in-out min-h-[36px] px-space-4 py-space-1 cursor-pointer hover:-translate-y-[1px] hover:shadow-clay-btn-hover active:translate-y-[1px] active:shadow-clay-pressed focus-visible:outline-[3px] focus-visible:outline-solid focus-visible:outline-accent-green focus-visible:outline-offset-2 shrink-0">Move</button>
          </div>
          {/* Row 2 below lg, right side of the same row at lg+ */}
          <div className="flex items-center gap-2 flex-wrap w-full lg:w-auto lg:shrink-0">
            <button id="bulkOpenBtn" className="font-primary text-xs font-bold tracking-wide border-2 border-accent-green rounded-sm bg-accent-green text-white shadow-clay-btn select-none transition-all duration-fast ease-in-out min-h-[36px] px-space-4 py-space-1 cursor-pointer hover:-translate-y-[1px] hover:shadow-clay-btn-hover active:translate-y-[1px] active:shadow-clay-pressed focus-visible:outline-[3px] focus-visible:outline-solid focus-visible:outline-accent-green focus-visible:outline-offset-2">Open</button>
            <button id="bulkTagBtn" className="font-primary text-xs font-bold tracking-wide border-2 border-border-default rounded-sm bg-surface-card text-text-base shadow-clay-btn select-none transition-all duration-fast ease-in-out min-h-[36px] px-space-4 py-space-1 cursor-pointer hover:-translate-y-[1px] hover:shadow-clay-btn-hover active:translate-y-[1px] active:shadow-clay-pressed focus-visible:outline-[3px] focus-visible:outline-solid focus-visible:outline-accent-green focus-visible:outline-offset-2">Tags</button>
            <button id="bulkExportBtn" className="font-primary text-xs font-bold tracking-wide border-2 border-border-default rounded-sm bg-surface-card text-text-base shadow-clay-btn select-none transition-all duration-fast ease-in-out min-h-[36px] px-space-4 py-space-1 cursor-pointer hover:-translate-y-[1px] hover:shadow-clay-btn-hover active:translate-y-[1px] active:shadow-clay-pressed focus-visible:outline-[3px] focus-visible:outline-solid focus-visible:outline-accent-green focus-visible:outline-offset-2">Export</button>
            <button id="bulkDeleteBtn" className="font-primary text-xs font-bold tracking-wide border-2 border-accent-red rounded-sm bg-accent-red text-white shadow-clay-btn select-none transition-all duration-fast ease-in-out min-h-[36px] px-space-4 py-space-1 cursor-pointer hover:-translate-y-[1px] hover:shadow-clay-btn-hover active:translate-y-[1px] active:shadow-clay-pressed focus-visible:outline-[3px] focus-visible:outline-solid focus-visible:outline-accent-red focus-visible:outline-offset-2 inline-flex items-center gap-1.5" title="Trash selected">
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0"/></svg>
              Trash
            </button>
          </div>
        </div>
      </div>

      <div id="bookmarksList" className="flex flex-col gap-3"></div>
      <div id="emptyState" className="hidden flex flex-col items-center justify-center py-20 text-text-secondary">
        <svg className="w-10 h-10 mb-2 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z"/>
        </svg>
        <p className="text-base">No bookmarks indexed yet.</p>
        <p className="text-sm mt-1">Run "Organize All" from Settings to get started.</p>
      </div>
    </div>

    {/* Trash Panel */}
    <div id="trashPanel" className={`${tab === 'trash' ? '' : 'hidden '}max-w-5xl mx-auto px-4 sm:px-6 py-5`}>
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
        <h2 className="text-md font-extrabold tracking-tight text-text-base">Trashed Bookmarks</h2>
        <div className="flex gap-2 items-center flex-wrap">
          <span id="trashInfo" className="text-sm text-text-secondary"></span>
          <button id="restoreAllBtn" className="font-primary text-sm font-bold tracking-wide border-2 border-border-strong rounded-sm bg-surface-raised text-text-base shadow-clay-btn select-none transition-all duration-fast ease-in-out min-h-[44px] px-space-5 py-space-2 cursor-pointer hover:-translate-y-[2px] hover:shadow-clay-btn-hover active:translate-y-[1px] active:shadow-clay-pressed focus-visible:outline-[3px] focus-visible:outline-solid focus-visible:outline-accent-green focus-visible:outline-offset-2 disabled:opacity-40 disabled:cursor-not-allowed disabled:pointer-events-none text-sm">Restore All</button>
          <button id="emptyTrashBtn" className="font-primary text-sm font-bold tracking-wide border-2 border-accent-red rounded-sm bg-accent-red text-white shadow-clay-btn select-none transition-all duration-fast ease-in-out min-h-[44px] px-space-5 py-space-2 cursor-pointer hover:-translate-y-[2px] hover:shadow-clay-btn-hover active:translate-y-[1px] active:shadow-clay-pressed focus-visible:outline-[3px] focus-visible:outline-solid focus-visible:outline-accent-red focus-visible:outline-offset-2 disabled:opacity-40 disabled:cursor-not-allowed disabled:pointer-events-none text-sm">Empty Trash</button>
        </div>
      </div>
      <div id="trashList" className="flex flex-col gap-3"></div>
      <div id="trashEmpty" className="hidden text-center py-16 text-text-secondary text-sm">Trash is empty.</div>
    </div>

    {/* Settings Panel */}
    <div id="settingsPanel" className={`${tab === 'settings' ? '' : 'hidden '}max-w-5xl mx-auto px-4 sm:px-6 py-5 flex flex-col gap-4`}>
      <section className="bg-surface-card border-2 border-border-default rounded-md shadow-clay p-space-5 text-text-base">
        <h2 className="text-md font-extrabold tracking-tight text-text-base">Auto-Organize</h2>
        <label className="flex items-center gap-3 cursor-pointer mt-space-3">
          <input type="checkbox" id="autoOrganizeToggle" role="switch" className="peer sr-only"/>
          <span className="relative shrink-0 w-12 h-7 rounded-full bg-surface-inset border-2 border-border-default shadow-clay-inset transition-colors duration-fast after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:w-5 after:h-5 after:rounded-full after:bg-surface-card after:shadow-clay-btn after:transition-transform after:duration-fast peer-checked:bg-accent-green peer-checked:border-accent-green peer-checked:after:translate-x-5 peer-focus-visible:outline-[3px] peer-focus-visible:outline-solid peer-focus-visible:outline-accent-green peer-focus-visible:outline-offset-2"></span>
          <span className="text-sm text-text-base font-semibold">Enable auto-organize</span>
        </label>
      </section>

      <section className="bg-surface-card border-2 border-border-default rounded-md shadow-clay p-space-5 text-text-base border-t-[3px] border-t-accent-blue">
        <h2 className="text-md font-extrabold tracking-tight text-text-base">Bulk Organize</h2>
        <div className="flex items-center gap-3 flex-wrap mb-3 mt-space-3">
          <button id="runSyncBtn" className="font-primary text-sm font-bold tracking-wide border-2 border-border-strong rounded-sm bg-surface-raised text-text-base shadow-clay-btn select-none transition-all duration-fast ease-in-out min-h-[44px] px-space-5 py-space-2 cursor-pointer hover:-translate-y-[2px] hover:shadow-clay-btn-hover active:translate-y-[1px] active:shadow-clay-pressed focus-visible:outline-[3px] focus-visible:outline-solid focus-visible:outline-accent-green focus-visible:outline-offset-2 disabled:opacity-40 disabled:cursor-not-allowed disabled:pointer-events-none">Organize All</button>
        </div>
        <div id="syncProgress" className="hidden">
          <div className="flex justify-between text-sm mb-1">
            <span id="syncStatus" className="text-text-base">Processing...</span>
            <span id="syncPercent" className="text-text-base font-mono">0%</span>
          </div>
          <div className="w-full bg-surface-inset rounded-xs h-3 border-2 border-border-default shadow-clay-inset">
            <div id="syncBar" className="bg-accent-green h-full rounded-xs transition-all duration-normal" style={{ width: '0%' }}></div>
          </div>
          <p id="syncUrl" className="text-xs text-text-secondary mt-1 truncate"></p>
        </div>
      </section>

      <section className="bg-surface-card border-2 border-border-default rounded-md shadow-clay p-space-5 text-text-base">
        <h2 className="text-md font-extrabold tracking-tight text-text-base">Default Sort</h2>
        <select id="defaultSort" className="w-full bg-surface-inset border-2 border-border-default rounded-sm text-sm text-text-base px-space-4 py-space-2 placeholder-text-secondary shadow-clay-inset focus-visible:outline-[3px] focus-visible:outline-solid focus-visible:outline-accent-blue focus-visible:outline-offset-2 min-h-[44px] cursor-pointer mt-space-3">
          <option value="manual">Manual (drag to reorder)</option>
          <option value="date_desc">Newest first</option>
          <option value="date_asc">Oldest first</option>
          <option value="title_asc">Title A-Z</option>
          <option value="title_desc">Title Z-A</option>
          <option value="category">By Category</option>
        </select>
      </section>

      <section className="bg-surface-card border-2 border-border-default rounded-md shadow-clay p-space-5 text-text-base border-t-[3px] border-t-accent-red">
        <h2 className="text-md font-extrabold tracking-tight text-text-base">Duplicate Policy</h2>
        <select id="duplicatePolicy" className="w-full bg-surface-inset border-2 border-border-default rounded-sm text-sm text-text-base px-space-4 py-space-2 placeholder-text-secondary shadow-clay-inset focus-visible:outline-[3px] focus-visible:outline-solid focus-visible:outline-accent-blue focus-visible:outline-offset-2 min-h-[44px] cursor-pointer mt-space-3">
          <option value="keep_oldest">Keep Oldest, Skip Newest</option>
          <option value="overwrite">Silently Overwrite</option>
        </select>
      </section>

      <section className="bg-surface-card border-2 border-border-default rounded-md shadow-clay p-space-5 text-text-base">
        <h2 className="text-md font-extrabold tracking-tight text-text-base">AI Classification</h2>
        <p className="text-sm text-text-muted mb-3 mt-space-2">Use AI to classify bookmarks that can't be categorized by local rules.</p>
        <div className="space-y-3">
          <div>
            <label className="block text-sm text-text-base mb-1 font-semibold">OpenRouter API Key</label>
            <input type="password" id="openrouterApiKey" placeholder="sk-or-..." className="w-full bg-surface-inset border-2 border-border-default rounded-sm text-sm text-text-base px-space-4 py-space-2 placeholder-text-secondary shadow-clay-inset focus-visible:outline-[3px] focus-visible:outline-solid focus-visible:outline-accent-blue focus-visible:outline-offset-2 min-h-[44px]"/>
          </div>
          <div>
            <label className="block text-sm text-text-base mb-1 font-semibold">Model</label>
            <select id="openrouterModel" className="w-full bg-surface-inset border-2 border-border-default rounded-sm text-sm text-text-base px-space-4 py-space-2 placeholder-text-secondary shadow-clay-inset focus-visible:outline-[3px] focus-visible:outline-solid focus-visible:outline-accent-blue focus-visible:outline-offset-2 min-h-[44px] cursor-pointer">
              <option value="google/gemini-2.5-flash-lite">Gemini 2.5 Flash Lite (default)</option>
              <option value="google/gemini-2.5-flash">Gemini 2.5 Flash</option>
              <option value="google/gemini-3-flash-preview">Gemini 3 Flash (preview)</option>
              <option value="x-ai/grok-4.1-fast">Grok 4.1 Fast</option>
              <option value="deepseek/deepseek-v3.1-terminus:exacto">DeepSeek V3.1 Terminus</option>
              <option value="openai/gpt-4o-mini">GPT-4o Mini</option>
              <option value="openai/gpt-5-nano">GPT-5 Nano</option>
              <option value="meta-llama/llama-4-scout">Llama 4 Scout</option>
              <option value="openai/gpt-oss-120b">GPT-OSS 120B</option>
            </select>
          </div>
          <label className="flex items-center gap-3 cursor-pointer">
            <input type="checkbox" id="autoAiCategorize" role="switch" className="peer sr-only"/>
            <span className="relative shrink-0 w-12 h-7 rounded-full bg-surface-inset border-2 border-border-default shadow-clay-inset transition-colors duration-fast after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:w-5 after:h-5 after:rounded-full after:bg-surface-card after:shadow-clay-btn after:transition-transform after:duration-fast peer-checked:bg-accent-green peer-checked:border-accent-green peer-checked:after:translate-x-5 peer-focus-visible:outline-[3px] peer-focus-visible:outline-solid peer-focus-visible:outline-accent-green peer-focus-visible:outline-offset-2"></span>
            <span className="text-sm text-text-base font-semibold">Automatically categorize with AI</span>
          </label>
          <p className="text-xs text-text-muted -mt-1">When fast rules can't classify a new bookmark, ask OpenRouter and file it there. Needs an API key.</p>
          <label className="flex items-center gap-3 cursor-pointer">
            <input type="checkbox" id="aiTagSuggest" role="switch" className="peer sr-only"/>
            <span className="relative shrink-0 w-12 h-7 rounded-full bg-surface-inset border-2 border-border-default shadow-clay-inset transition-colors duration-fast after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:w-5 after:h-5 after:rounded-full after:bg-surface-card after:shadow-clay-btn after:transition-transform after:duration-fast peer-checked:bg-accent-green peer-checked:border-accent-green peer-checked:after:translate-x-5 peer-focus-visible:outline-[3px] peer-focus-visible:outline-solid peer-focus-visible:outline-accent-green peer-focus-visible:outline-offset-2"></span>
            <span className="text-sm text-text-base font-semibold">Auto-suggest tags after sync</span>
          </label>
          <div id="aiStatus" className="text-sm text-text-secondary"></div>
        </div>
      </section>

      <section className="bg-surface-card border-2 border-border-default rounded-md shadow-clay p-space-5 text-text-base">
        <h2 className="text-md font-extrabold tracking-tight text-text-base">Trash</h2>
        <div className="space-y-3 mt-space-3">
          <div>
            <label className="block text-sm text-text-base mb-1 font-semibold">Auto-purge after</label>
            <select id="trashAutoPurge" className="w-full bg-surface-inset border-2 border-border-default rounded-sm text-sm text-text-base px-space-4 py-space-2 placeholder-text-secondary shadow-clay-inset focus-visible:outline-[3px] focus-visible:outline-solid focus-visible:outline-accent-blue focus-visible:outline-offset-2 min-h-[44px] cursor-pointer">
              <option value="7">7 days</option>
              <option value="30">30 days</option>
              <option value="0">Never</option>
            </select>
          </div>
          <div>
            <label className="block text-sm text-text-base mb-1 font-semibold">Max trash size</label>
            <input type="number" id="trashMaxSize" min="100" max="5000" step="100" className="w-full bg-surface-inset border-2 border-border-default rounded-sm text-sm text-text-base px-space-4 py-space-2 placeholder-text-secondary shadow-clay-inset focus-visible:outline-[3px] focus-visible:outline-solid focus-visible:outline-accent-blue focus-visible:outline-offset-2 min-h-[44px]"/>
          </div>
        </div>
      </section>

      <section className="bg-surface-card border-2 border-accent-red rounded-md shadow-clay p-space-5 text-text-base">
        <h2 className="text-md font-extrabold tracking-tight text-accent-red">Danger Zone</h2>
        <p className="text-sm text-text-muted mb-3 mt-space-2">Clear all bookmarks from the local database.</p>
        <div className="flex items-center gap-3 flex-wrap">
          <button id="clearDbBtn" className="font-primary text-sm font-bold tracking-wide border-2 border-accent-red rounded-sm bg-accent-red text-white shadow-clay-btn select-none transition-all duration-fast ease-in-out min-h-[44px] px-space-5 py-space-2 cursor-pointer hover:-translate-y-[2px] hover:shadow-clay-btn-hover active:translate-y-[1px] active:shadow-clay-pressed focus-visible:outline-[3px] focus-visible:outline-solid focus-visible:outline-accent-red focus-visible:outline-offset-2 disabled:opacity-40 disabled:cursor-not-allowed disabled:pointer-events-none">Clear Database</button>
          <span id="clearStatus" className="text-sm text-accent-green hidden">Database cleared.</span>
        </div>
      </section>
    </div>

    {/* Data Panel */}
    <div id="dataPanel" className={`${tab === 'data' ? '' : 'hidden '}max-w-5xl mx-auto px-4 sm:px-6 py-5 flex flex-col gap-4`}>
      <section className="bg-surface-card border-2 border-border-default rounded-md shadow-clay p-space-5 text-text-base">
        <h2 className="text-md font-extrabold tracking-tight text-text-base">Export</h2>
        <p className="text-sm text-text-muted mb-3 mt-space-2">Export your indexed bookmarks. Choose a format:</p>
        <div className="flex gap-2">
          <button id="exportJson" className="font-primary text-sm font-bold tracking-wide border-2 border-border-strong rounded-sm bg-surface-raised text-text-base shadow-clay-btn select-none transition-all duration-fast ease-in-out min-h-[44px] px-space-5 py-space-2 cursor-pointer hover:-translate-y-[2px] hover:shadow-clay-btn-hover active:translate-y-[1px] active:shadow-clay-pressed focus-visible:outline-[3px] focus-visible:outline-solid focus-visible:outline-accent-green focus-visible:outline-offset-2 disabled:opacity-40 disabled:cursor-not-allowed disabled:pointer-events-none text-sm">JSON</button>
          <button id="exportCsv" className="font-primary text-sm font-bold tracking-wide border-2 border-border-default rounded-sm bg-surface-card text-text-base shadow-clay-btn select-none transition-all duration-fast ease-in-out min-h-[44px] px-space-5 py-space-2 cursor-pointer hover:-translate-y-[2px] hover:shadow-clay-btn-hover active:translate-y-[1px] active:shadow-clay-pressed focus-visible:outline-[3px] focus-visible:outline-solid focus-visible:outline-accent-green focus-visible:outline-offset-2 disabled:opacity-40 disabled:cursor-not-allowed disabled:pointer-events-none text-sm">CSV</button>
          <button id="exportHtml" className="font-primary text-sm font-bold tracking-wide border-2 border-border-default rounded-sm bg-surface-card text-text-base shadow-clay-btn select-none transition-all duration-fast ease-in-out min-h-[44px] px-space-5 py-space-2 cursor-pointer hover:-translate-y-[2px] hover:shadow-clay-btn-hover active:translate-y-[1px] active:shadow-clay-pressed focus-visible:outline-[3px] focus-visible:outline-solid focus-visible:outline-accent-green focus-visible:outline-offset-2 disabled:opacity-40 disabled:cursor-not-allowed disabled:pointer-events-none text-sm">Chrome HTML</button>
        </div>
        <p id="exportStatus" className="text-sm text-accent-green mt-2 hidden"></p>
      </section>

      <section className="bg-surface-card border-2 border-border-default rounded-md shadow-clay p-space-5 text-text-base">
        <h2 className="text-md font-extrabold tracking-tight text-text-base">Import</h2>
        <p className="text-sm text-text-muted mb-3 mt-space-2">Import bookmarks from a file. Supports JSON, CSV, and Chrome HTML format.</p>
        <input type="file" id="importFile" accept=".json,.csv,.html" className="hidden"/>
        <div className="flex items-center gap-3 flex-wrap">
          <button id="importBtn" className="font-primary text-sm font-bold tracking-wide border-2 border-border-strong rounded-sm bg-surface-raised text-text-base shadow-clay-btn select-none transition-all duration-fast ease-in-out min-h-[44px] px-space-5 py-space-2 cursor-pointer hover:-translate-y-[2px] hover:shadow-clay-btn-hover active:translate-y-[1px] active:shadow-clay-pressed focus-visible:outline-[3px] focus-visible:outline-solid focus-visible:outline-accent-green focus-visible:outline-offset-2 disabled:opacity-40 disabled:cursor-not-allowed disabled:pointer-events-none text-sm">Choose File</button>
          <span id="importFileName" className="text-sm text-text-secondary"></span>
        </div>
        <div id="importPreview" className="hidden mt-3 p-3 bg-surface-inset text-text-base border-2 border-border-default rounded-sm shadow-clay-inset">
          <p className="text-sm" id="importPreviewText"></p>
          <button id="importConfirmBtn" className="font-primary text-sm font-bold tracking-wide border-2 border-border-strong rounded-sm bg-surface-raised text-text-base shadow-clay-btn select-none transition-all duration-fast ease-in-out min-h-[44px] px-space-5 py-space-2 cursor-pointer hover:-translate-y-[2px] hover:shadow-clay-btn-hover active:translate-y-[1px] active:shadow-clay-pressed focus-visible:outline-[3px] focus-visible:outline-solid focus-visible:outline-accent-green focus-visible:outline-offset-2 disabled:opacity-40 disabled:cursor-not-allowed disabled:pointer-events-none text-sm mt-2">Confirm Import</button>
        </div>
        <div id="importProgress" className="hidden mt-3">
          <div className="w-full bg-surface-inset rounded-xs h-3 border-2 border-border-default shadow-clay-inset">
            <div id="importBar" className="bg-accent-green h-full rounded-xs transition-all" style={{ width: '0%' }}></div>
          </div>
          <p id="importStatus" className="text-sm text-text-secondary mt-1"></p>
        </div>
      </section>
    </div>

    {/* Rules Panel */}
    <div id="rulesPanel" className={`${tab === 'rules' ? '' : 'hidden '}max-w-5xl mx-auto px-4 sm:px-6 py-5`}>
      <section className="bg-surface-card border-2 border-border-default rounded-md shadow-clay p-space-5 text-text-base">
        <h2 className="text-md font-extrabold tracking-tight text-text-base">Custom Domain Mappings</h2>
        <p className="text-sm text-text-muted mb-3 mt-space-2">Override automatic classification for specific domains. These are checked before built-in rules.</p>
        <div id="rulesList" className="flex flex-col gap-2 mb-3"></div>
        <div className="flex gap-2 flex-wrap">
          <input type="text" id="ruleDomain" placeholder="domain.com" className="flex-1 min-w-[150px] bg-surface-inset border-2 border-border-default rounded-sm text-sm text-text-base px-space-4 py-space-2 placeholder-text-secondary shadow-clay-inset focus-visible:outline-[3px] focus-visible:outline-solid focus-visible:outline-accent-blue focus-visible:outline-offset-2 min-h-[44px]"/>
          <select id="ruleCategory" className="flex-1 min-w-[150px] bg-surface-inset border-2 border-border-default rounded-sm text-sm text-text-base px-space-4 py-space-2 placeholder-text-secondary shadow-clay-inset focus-visible:outline-[3px] focus-visible:outline-solid focus-visible:outline-accent-blue focus-visible:outline-offset-2 min-h-[44px] cursor-pointer"></select>
          <input type="text" id="ruleSubcategory" placeholder="Subcategory" className="w-32 shrink-0 bg-surface-inset border-2 border-border-default rounded-sm text-sm text-text-base px-space-4 py-space-2 placeholder-text-secondary shadow-clay-inset focus-visible:outline-[3px] focus-visible:outline-solid focus-visible:outline-accent-blue focus-visible:outline-offset-2 min-h-[44px]"/>
          <button id="addRuleBtn" className="font-primary text-sm font-bold tracking-wide border-2 border-border-strong rounded-sm bg-surface-raised text-text-base shadow-clay-btn select-none transition-all duration-fast ease-in-out min-h-[44px] px-space-5 py-space-2 cursor-pointer hover:-translate-y-[2px] hover:shadow-clay-btn-hover active:translate-y-[1px] active:shadow-clay-pressed focus-visible:outline-[3px] focus-visible:outline-solid focus-visible:outline-accent-green focus-visible:outline-offset-2 disabled:opacity-40 disabled:cursor-not-allowed disabled:pointer-events-none text-sm">Add</button>
        </div>
      </section>
    </div>

    {/* Review Panel (Uncategorized) */}
    <div id="reviewPanel" className={`${tab === 'review' ? '' : 'hidden '}max-w-5xl mx-auto px-4 sm:px-6 py-5`}>
      <section className="bg-surface-card border-2 border-border-default rounded-md shadow-clay p-space-5 text-text-base">
        <div className="flex items-center justify-between gap-2 flex-wrap mb-3">
          <div>
            <h2 className="text-md font-extrabold tracking-tight text-text-base">Uncategorized Bookmarks</h2>
            <p className="text-sm text-text-muted mt-1">These bookmarks couldn't be categorized by local rules. Use AI to classify them in bulk.</p>
          </div>
          <button id="batchCategorizeBtn" className="font-primary text-sm font-bold tracking-wide border-2 border-accent-blue rounded-sm bg-surface-blue text-accent-blue shadow-clay-btn select-none transition-all duration-fast ease-in-out min-h-[44px] px-space-5 py-space-2 cursor-pointer hover:-translate-y-[2px] hover:shadow-clay-btn-hover active:translate-y-[1px] active:shadow-clay-pressed focus-visible:outline-[3px] focus-visible:outline-solid focus-visible:outline-accent-blue focus-visible:outline-offset-2 disabled:opacity-40 disabled:cursor-not-allowed disabled:pointer-events-none text-sm shrink-0">Categorize with AI</button>
        </div>
        <div id="batchProgress" className="hidden mb-3">
          <div className="flex justify-between text-sm mb-1">
            <span id="batchStatus" className="text-text-base">Processing...</span>
            <span id="batchPercent" className="text-text-base font-mono">0%</span>
          </div>
          <div className="w-full bg-surface-inset rounded-xs h-3 border-2 border-border-default shadow-clay-inset">
            <div id="batchBar" className="bg-accent-blue h-full rounded-xs transition-all duration-normal" style={{ width: '0%' }}></div>
          </div>
        </div>
        <div id="reviewStats" className="text-sm text-text-secondary mb-3"></div>

        {/* Review Bulk Bar — one row at md+, wraps to 2-3 rows below (row 1 = status + picks + Assign) */}
        <div id="rBulkBar" className="hidden bg-surface-muted border-2 border-border-default rounded-sm text-text-base shadow-clay mb-3 px-2 py-1.5">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5">
            {/* Row 1 (full width below lg): status + picks + Assign, stretches to fill */}
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5 w-full lg:w-auto lg:flex-1 min-w-0">
              <span id="rSelectedCount" className="flex items-center gap-1 text-[11px] font-bold text-accent-green shrink-0">
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M5 13l4 4L19 7"/></svg>
                <span>0</span>
              </span>
              <label className="flex items-center gap-1 cursor-pointer select-none text-[11px] font-semibold text-text-base shrink-0" title="Select all in review">
                <input type="checkbox" id="rSelectAllChk" className="w-3.5 h-3.5 rounded-xs border-2 border-border-default accent-accent-green cursor-pointer"/>
                <span>Select all</span>
              </label>
              <button id="rDeselectAllBtn" className="flex items-center justify-center w-5 h-5 border-2 border-border-strong rounded-xs bg-text-base text-text-on-dark shadow-clay-btn select-none transition-all duration-fast ease-in-out cursor-pointer hover:-translate-y-px hover:shadow-clay-btn-hover active:translate-y-px active:shadow-clay-pressed focus-visible:outline-[3px] focus-visible:outline-solid focus-visible:outline-accent-green focus-visible:outline-offset-2 shrink-0" title="Deselect all">
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M6 18L18 6M6 6l12 12"/></svg>
              </button>
              <div className="w-px h-3.5 bg-border-default shrink-0"></div>
              <select id="rBulkCategory" className="flex-1 min-w-[110px] max-w-full bg-surface-inset border-2 border-border-default rounded-xs text-[11px] text-text-base px-1.5 shadow-clay-inset focus-visible:outline-[3px] focus-visible:outline-solid focus-visible:outline-accent-blue focus-visible:outline-offset-2 h-7 cursor-pointer lg:max-w-[190px]">
                <option value="">Category…</option>
              </select>
              <select id="rBulkSubcategory" className="min-w-0 max-w-full bg-surface-inset border-2 border-border-default rounded-xs text-[11px] text-text-base px-1.5 shadow-clay-inset focus-visible:outline-[3px] focus-visible:outline-solid focus-visible:outline-accent-blue focus-visible:outline-offset-2 h-7 cursor-pointer w-[150px] lg:w-[130px] truncate" disabled>
                <option value="">Subcategory</option>
              </select>
              <button id="rBulkAssignBtn" className="font-primary text-[11px] font-bold tracking-wide border-2 border-border-strong rounded-xs bg-surface-raised text-text-base shadow-clay-btn select-none transition-all duration-fast ease-in-out h-7 px-2 cursor-pointer hover:-translate-y-px hover:shadow-clay-btn-hover active:translate-y-px active:shadow-clay-pressed focus-visible:outline-[3px] focus-visible:outline-solid focus-visible:outline-accent-green focus-visible:outline-offset-2 disabled:opacity-40 disabled:cursor-not-allowed shrink-0" disabled>Assign</button>
            </div>
            {/* Row 2 below lg, right side of the same row at lg+ */}
            <div className="flex items-center gap-1.5 flex-wrap w-full lg:w-auto lg:shrink-0">
              <button id="rBulkOpenBtn" className="font-primary text-[11px] font-bold tracking-wide border-2 border-accent-green rounded-xs bg-accent-green text-white shadow-clay-btn select-none transition-all duration-fast ease-in-out h-7 px-2 cursor-pointer hover:-translate-y-px hover:shadow-clay-btn-hover active:translate-y-px active:shadow-clay-pressed focus-visible:outline-[3px] focus-visible:outline-solid focus-visible:outline-accent-green focus-visible:outline-offset-2" title="Open selected">Open</button>
              <button id="rBulkTagBtn" className="font-primary text-[11px] font-bold tracking-wide border-2 border-border-default rounded-xs bg-surface-card text-text-base shadow-clay-btn select-none transition-all duration-fast ease-in-out h-7 px-2 cursor-pointer hover:-translate-y-px hover:shadow-clay-btn-hover active:translate-y-px active:shadow-clay-pressed focus-visible:outline-[3px] focus-visible:outline-solid focus-visible:outline-accent-green focus-visible:outline-offset-2" title="Tag selected">Tags</button>
              <button id="rBulkDeleteBtn" className="font-primary text-[11px] font-bold tracking-wide border-2 border-accent-red rounded-xs bg-accent-red text-white shadow-clay-btn select-none transition-all duration-fast ease-in-out h-7 px-2 inline-flex items-center gap-1 cursor-pointer hover:-translate-y-px hover:shadow-clay-btn-hover active:translate-y-px active:shadow-clay-pressed focus-visible:outline-[3px] focus-visible:outline-solid focus-visible:outline-accent-red focus-visible:outline-offset-2" title="Trash selected">
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0"/></svg>
                Trash
              </button>
            </div>
          </div>
        </div>

        <div id="reviewList" className="flex flex-col gap-3"></div>
        <div id="reviewEmpty" className="hidden text-center py-12 text-text-secondary text-sm">
          All bookmarks categorized! Nothing to review.
        </div>
      </section>
    </div>
  </main>
  </div>
    </>
  );
}
