import { useEffect, useState } from 'react';
import { clearAllBookmarks } from '../../database/indexeddb/db.js';
import { getSettings, saveSettings } from '../../shared/settings.js';
import { startSync, useSyncState } from './syncState.js';
import { useOptions } from './OptionsContext.jsx';

// React port of the settings block that lived in options.js. Values load once
// on mount and every change writes the whole settings object back to sync
// storage — the same shape the vanilla listeners used.

let vanillaMod;
function vanilla() {
  if (!vanillaMod) vanillaMod = import('./options.js');
  return vanillaMod;
}

const MODELS = [
  ['google/gemini-2.5-flash-lite', 'Gemini 2.5 Flash Lite (default)'],
  ['google/gemini-2.5-flash', 'Gemini 2.5 Flash'],
  ['google/gemini-3-flash-preview', 'Gemini 3 Flash (preview)'],
  ['x-ai/grok-4.1-fast', 'Grok 4.1 Fast'],
  ['deepseek/deepseek-v3.1-terminus:exacto', 'DeepSeek V3.1 Terminus'],
  ['openai/gpt-4o-mini', 'GPT-4o Mini'],
  ['openai/gpt-5-nano', 'GPT-5 Nano'],
  ['meta-llama/llama-4-scout', 'Llama 4 Scout'],
  ['openai/gpt-oss-120b', 'GPT-OSS 120B'],
];

const SORT_OPTIONS = [
  ['manual', 'Manual (drag to reorder)'],
  ['date_desc', 'Newest first'],
  ['date_asc', 'Oldest first'],
  ['title_asc', 'Title A-Z'],
  ['title_desc', 'Title Z-A'],
  ['category', 'By Category'],
];

function Switch({ id, checked, onChange }) {
  return (
    <input
      type="checkbox"
      id={id}
      role="switch"
      aria-checked={checked}
      checked={checked}
      onChange={(e) => onChange(e.target.checked)}
      className="peer sr-only"
    />
  );
}

// Static visual shell for the switch (peer-* classes react to the sr-only input).
function SwitchTrack() {
  return (
    <span className="relative shrink-0 w-12 h-7 rounded-full bg-surface-inset border-2 border-border-default shadow-clay-inset transition-colors duration-fast after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:w-5 after:h-5 after:rounded-full after:bg-surface-card after:shadow-clay-btn after:transition-transform after:duration-fast peer-checked:bg-accent-green peer-checked:border-accent-green peer-checked:after:translate-x-5 peer-focus-visible:outline-[3px] peer-focus-visible:outline-solid peer-focus-visible:outline-accent-green peer-focus-visible:outline-offset-2"></span>
  );
}

const sectionCls =
  'bg-surface-card border-2 border-border-default rounded-md shadow-clay p-space-5 text-text-base';
const selectCls =
  'w-full bg-surface-inset border-2 border-border-default rounded-sm text-sm text-text-base px-space-4 py-space-2 placeholder-text-secondary shadow-clay-inset focus-visible:outline-[3px] focus-visible:outline-solid focus-visible:outline-accent-blue focus-visible:outline-offset-2 min-h-[44px] cursor-pointer';
const inputCls =
  'w-full bg-surface-inset border-2 border-border-default rounded-sm text-sm text-text-base px-space-4 py-space-2 placeholder-text-secondary shadow-clay-inset focus-visible:outline-[3px] focus-visible:outline-solid focus-visible:outline-accent-blue focus-visible:outline-offset-2 min-h-[44px]';
const primaryBtn =
  'font-primary text-sm font-bold tracking-wide border-2 border-border-strong rounded-sm bg-surface-raised text-text-base shadow-clay-btn select-none transition-all duration-fast ease-in-out min-h-[44px] px-space-5 py-space-2 cursor-pointer hover:-translate-y-[2px] hover:shadow-clay-btn-hover active:translate-y-[1px] active:shadow-clay-pressed focus-visible:outline-[3px] focus-visible:outline-solid focus-visible:outline-accent-green focus-visible:outline-offset-2 disabled:opacity-40 disabled:cursor-not-allowed disabled:pointer-events-none';
const dangerBtn =
  'font-primary text-sm font-bold tracking-wide border-2 border-accent-red rounded-sm bg-accent-red text-white shadow-clay-btn select-none transition-all duration-fast ease-in-out min-h-[44px] px-space-5 py-space-2 cursor-pointer hover:-translate-y-[2px] hover:shadow-clay-btn-hover active:translate-y-[1px] active:shadow-clay-pressed focus-visible:outline-[3px] focus-visible:outline-solid focus-visible:outline-accent-red focus-visible:outline-offset-2 disabled:opacity-40 disabled:cursor-not-allowed disabled:pointer-events-none';

export default function SettingsPanel({ active }) {
  const [settings, setSettings] = useState(null);
  const [clearDone, setClearDone] = useState(false);
  const sync = useSyncState();
  const { setSort } = useOptions();

  useEffect(() => {
    getSettings().then((s) => {
      setSettings(s);
      setSort(s.defaultSort || 'manual');
    });
    // initial load only — the default sort seeds the shared Home sort value
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const patch = async (key, value) => {
    setSettings((prev) => ({ ...prev, [key]: value }));
    const next = { ...(await getSettings()), [key]: value };
    await saveSettings(next);
    return next;
  };

  if (!settings) {
    return (
      <div
        id="settingsPanel"
        className={`${active ? '' : 'hidden '}max-w-5xl mx-auto px-4 sm:px-6 py-5 flex flex-col gap-4`}
      />
    );
  }

  const savedModel = settings.openrouterModel || 'google/gemini-2.5-flash-lite';
  const modelValue = MODELS.some(([v]) => v === savedModel)
    ? savedModel
    : 'google/gemini-2.5-flash-lite';

  const aiEnabled = Boolean(settings.openrouterApiKey);
  const aiStatusText = aiEnabled
    ? `AI enabled — ${settings.openrouterModel || 'google/gemini-2.5-flash-lite'}`
    : 'AI disabled — add an API key to enable';

  const pct = sync.total > 0 ? Math.round((sync.current / sync.total) * 100) : 0;
  const syncStatus = sync.complete
    ? 'Sync complete!'
    : sync.total > 0
      ? `Processing ${sync.current} of ${sync.total}...`
      : 'Starting...';

  const onClearDb = async () => {
    if (!confirm('Clear all indexed bookmarks? Chrome bookmarks are untouched.')) return;
    await clearAllBookmarks();
    (await vanilla()).loadBookmarks();
    setClearDone(true);
    setTimeout(() => setClearDone(false), 3000);
  };

  return (
    <div
      id="settingsPanel"
      className={`${active ? '' : 'hidden '}max-w-5xl mx-auto px-4 sm:px-6 py-5 flex flex-col gap-4`}
    >
      <section className={sectionCls}>
        <h2 className="text-md font-extrabold tracking-tight text-text-base">Auto-Organize</h2>
        <label className="flex items-center gap-3 cursor-pointer mt-space-3">
          <Switch
            id="autoOrganizeToggle"
            checked={Boolean(settings.autoOrganize)}
            onChange={(v) => patch('autoOrganize', v)}
          />
          <SwitchTrack />
          <span className="text-sm text-text-base font-semibold">Enable auto-organize</span>
        </label>
      </section>

      <section className={`${sectionCls} border-t-[3px] border-t-accent-blue`}>
        <h2 className="text-md font-extrabold tracking-tight text-text-base">Bulk Organize</h2>
        <div className="flex items-center gap-3 flex-wrap mb-3 mt-space-3">
          <button
            id="runSyncBtn"
            className={primaryBtn}
            disabled={sync.active}
            onClick={() => !sync.active && startSync()}
          >
            Organize All
          </button>
        </div>
        <div id="syncProgress" className={sync.active ? '' : 'hidden'}>
          <div className="flex justify-between text-sm mb-1">
            <span id="syncStatus" className="text-text-base">{syncStatus}</span>
            <span id="syncPercent" className="text-text-base font-mono">{pct}%</span>
          </div>
          <div className="w-full bg-surface-inset rounded-xs h-3 border-2 border-border-default shadow-clay-inset">
            <div
              id="syncBar"
              className="bg-accent-green h-full rounded-xs transition-all duration-normal"
              style={{ width: `${pct}%` }}
            ></div>
          </div>
          <p id="syncUrl" className="text-xs text-text-secondary mt-1 truncate">
            {sync.complete ? '' : sync.url}
          </p>
        </div>
      </section>

      <section className={sectionCls}>
        <h2 className="text-md font-extrabold tracking-tight text-text-base">Default Sort</h2>
        <select
          id="defaultSort"
          value={settings.defaultSort || 'manual'}
          onChange={(e) => {
            patch('defaultSort', e.target.value);
            setSort(e.target.value);
          }}
          className={`${selectCls} mt-space-3`}
        >
          {SORT_OPTIONS.map(([v, label]) => (
            <option key={v} value={v}>{label}</option>
          ))}
        </select>
      </section>

      <section className={`${sectionCls} border-t-[3px] border-t-accent-red`}>
        <h2 className="text-md font-extrabold tracking-tight text-text-base">Duplicate Policy</h2>
        <select
          id="duplicatePolicy"
          value={settings.duplicatePolicy || 'keep_oldest'}
          onChange={(e) => patch('duplicatePolicy', e.target.value)}
          className={`${selectCls} mt-space-3`}
        >
          <option value="keep_oldest">Keep Oldest, Skip Newest</option>
          <option value="overwrite">Silently Overwrite</option>
        </select>
      </section>

      <section className={sectionCls}>
        <h2 className="text-md font-extrabold tracking-tight text-text-base">AI Classification</h2>
        <p className="text-sm text-text-muted mb-3 mt-space-2">
          Use AI to classify bookmarks that can't be categorized by local rules.
        </p>
        <div className="space-y-3">
          <div>
            <label className="block text-sm text-text-base mb-1 font-semibold">OpenRouter API Key</label>
            <input
              type="password"
              id="openrouterApiKey"
              placeholder="sk-or-..."
              value={settings.openrouterApiKey || ''}
              onChange={(e) => setSettings((prev) => ({ ...prev, openrouterApiKey: e.target.value }))}
              onBlur={(e) => patch('openrouterApiKey', e.target.value.trim())}
              className={inputCls}
            />
          </div>
          <div>
            <label className="block text-sm text-text-base mb-1 font-semibold">Model</label>
            <select
              id="openrouterModel"
              value={modelValue}
              onChange={(e) => patch('openrouterModel', e.target.value)}
              className={selectCls}
            >
              {MODELS.map(([v, label]) => (
                <option key={v} value={v}>{label}</option>
              ))}
            </select>
          </div>
          <label className="flex items-center gap-3 cursor-pointer">
            <Switch
              id="autoAiCategorize"
              checked={settings.autoAiCategorize === true}
              onChange={(v) => patch('autoAiCategorize', v)}
            />
            <SwitchTrack />
            <span className="text-sm text-text-base font-semibold">Automatically categorize with AI</span>
          </label>
          <p className="text-xs text-text-muted -mt-1">
            When fast rules can't classify a new bookmark, ask OpenRouter and file it there. Needs an API key.
          </p>
          <label className="flex items-center gap-3 cursor-pointer">
            <Switch
              id="aiTagSuggest"
              checked={settings.aiTagSuggest !== false}
              onChange={(v) => patch('aiTagSuggest', v)}
            />
            <SwitchTrack />
            <span className="text-sm text-text-base font-semibold">Auto-suggest tags after sync</span>
          </label>
          <div
            id="aiStatus"
            className={`text-sm ${aiEnabled ? 'text-accent-green' : 'text-text-secondary'}`}
          >
            {aiStatusText}
          </div>
        </div>
      </section>

      <section className={sectionCls}>
        <h2 className="text-md font-extrabold tracking-tight text-text-base">Trash</h2>
        <div className="space-y-3 mt-space-3">
          <div>
            <label className="block text-sm text-text-base mb-1 font-semibold">Auto-purge after</label>
            <select
              id="trashAutoPurge"
              value={String(settings.trashAutoPurgeDays ?? 30)}
              onChange={(e) => patch('trashAutoPurgeDays', parseInt(e.target.value, 10))}
              className={selectCls}
            >
              <option value="7">7 days</option>
              <option value="30">30 days</option>
              <option value="0">Never</option>
            </select>
          </div>
          <div>
            <label className="block text-sm text-text-base mb-1 font-semibold">Max trash size</label>
            <input
              type="number"
              id="trashMaxSize"
              min="100"
              max="5000"
              step="100"
              value={settings.trashMaxSize || 500}
              onChange={(e) => setSettings((prev) => ({ ...prev, trashMaxSize: e.target.value }))}
              onBlur={(e) => patch('trashMaxSize', parseInt(e.target.value, 10))}
              className={inputCls}
            />
          </div>
        </div>
      </section>

      <section className="bg-surface-card border-2 border-accent-red rounded-md shadow-clay p-space-5 text-text-base">
        <h2 className="text-md font-extrabold tracking-tight text-accent-red">Danger Zone</h2>
        <p className="text-sm text-text-muted mb-3 mt-space-2">
          Clear all bookmarks from the local database.
        </p>
        <div className="flex items-center gap-3 flex-wrap">
          <button id="clearDbBtn" className={dangerBtn} onClick={onClearDb}>
            Clear Database
          </button>
          <span id="clearStatus" className={`text-sm text-accent-green ${clearDone ? '' : 'hidden'}`}>
            Database cleared.
          </span>
        </div>
      </section>
    </div>
  );
}
