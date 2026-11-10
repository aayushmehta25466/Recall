import { useEffect, useState } from 'react';
import HomePanel from './HomePanel.jsx';
import ReviewPanel from './ReviewPanel.jsx';
import TrashPanel from './TrashPanel.jsx';
import SettingsPanel from './SettingsPanel.jsx';
import DataPanel from './DataPanel.jsx';
import RulesPanel from './RulesPanel.jsx';
import { checkSyncStatus } from './syncState.js';
import { useOptions } from './OptionsContext.jsx';

// Options page shell: React owns layout, sidebar nav, hash routing, the mobile
// toggle and every panel. options.js keeps only the shared bookmark cache that
// the bulk actions and sidebar trash badge need.
const TABS = ['home', 'trash', 'settings', 'data', 'rules', 'review'];

export default function OptionsApp() {
  const [tab, setTab] = useState(() => {
    const hash = location.hash.replace('#', '');
    return TABS.includes(hash) ? hash : 'home';
  });
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const { trashCount, uncatCount } = useOptions();

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

  // The shared data layer lives in options.js; import it after React has
  // committed the shell so its init can find the sidebar badge. Panels load
  // their own data when they become active.
  useEffect(() => {
    import('./options.js');
    checkSyncStatus();
  }, []);

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
        <span id="trashCount" className={`ml-auto bg-text-base text-text-on-dark text-xs px-space-2 py-space-1 rounded-xs border-2 border-border-strong font-bold ${trashCount > 0 ? '' : 'hidden'}`}>{trashCount}</span>
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
        <span id="uncatCount" className={`ml-auto bg-text-base text-text-on-dark text-xs px-space-2 py-space-1 rounded-xs border-2 border-border-strong font-bold ${uncatCount > 0 ? '' : 'hidden'}`}>{uncatCount}</span>
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

    {/* Home Panel — markup + logic in HomePanel.jsx */}
    <HomePanel active={tab === 'home'} />

    {/* Trash Panel — markup + logic in TrashPanel.jsx */}
    <TrashPanel active={tab === 'trash'} />

    {/* Settings Panel — markup + logic in SettingsPanel.jsx */}
    <SettingsPanel active={tab === 'settings'} />

    {/* Data Panel — markup + logic in DataPanel.jsx */}
    <DataPanel active={tab === 'data'} />

    {/* Rules Panel — markup + logic in RulesPanel.jsx */}
    <RulesPanel active={tab === 'rules'} />

    {/* Review Panel (Uncategorized) — markup + logic in ReviewPanel.jsx */}
    <ReviewPanel active={tab === 'review'} />
  </main>
  </div>
    </>
  );
}
