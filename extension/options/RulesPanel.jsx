import { useEffect, useState } from 'react';
import { getSettings, saveSettings } from '../../shared/settings.js';
import { CATEGORIES } from '../../shared/types/taxonomy.js';
import { flattenSubcategoryPaths } from '../../core/taxonomy/categories.js';
import {
  RULE_FIELDS,
  OPERATOR_LABELS,
  describeRule,
  normalizeRule,
} from '../../core/taxonomy/ruleEngine.js';
import { applyRulesToExisting } from '../../core/sync-engine/applyRules.js';
import { BADGE, CARD } from '../../shared/ui.js';
import { useOptions } from './OptionsContext.jsx';

// Full custom-rules manager. Rules live in settings.customRules and are
// evaluated by core/taxonomy/ruleEngine.js before built-in classification.
// Legacy domain mappings keep working and can be imported into the new format.

const CATEGORY_OPTIONS = Object.values(CATEGORIES).filter((c) => c !== CATEGORIES.UNCATEGORIZED);
const MAX_RULES = 50;

const inputCls =
  'bg-surface-inset border-2 border-border-default rounded-sm text-sm text-text-base px-space-3 py-space-2 placeholder-text-secondary shadow-clay-inset focus-visible:outline-[3px] focus-visible:outline-solid focus-visible:outline-accent-blue focus-visible:outline-offset-2 min-h-[40px]';
const smallBtn =
  'font-primary text-xs font-bold tracking-wide border-2 border-border-default rounded-xs bg-surface-card text-text-base shadow-clay-btn select-none transition-all duration-fast ease-in-out h-8 px-2.5 cursor-pointer hover:-translate-y-px hover:shadow-clay-btn-hover active:translate-y-px active:shadow-clay-pressed focus-visible:outline-[3px] focus-visible:outline-solid focus-visible:outline-accent-green focus-visible:outline-offset-2 disabled:opacity-40 disabled:cursor-not-allowed';
const dangerBtn =
  'font-primary text-xs font-bold tracking-wide border-2 border-accent-red rounded-xs bg-accent-red text-white shadow-clay-btn select-none transition-all duration-fast ease-in-out h-8 px-2.5 cursor-pointer hover:-translate-y-px hover:shadow-clay-btn-hover active:translate-y-px active:shadow-clay-pressed focus-visible:outline-[3px] focus-visible:outline-solid focus-visible:outline-accent-red focus-visible:outline-offset-2 disabled:opacity-40 disabled:cursor-not-allowed';
const primaryBtn =
  'font-primary text-sm font-bold tracking-wide border-2 border-border-strong rounded-sm bg-surface-raised text-text-base shadow-clay-btn select-none transition-all duration-fast ease-in-out min-h-[44px] px-space-5 py-space-2 cursor-pointer hover:-translate-y-[2px] hover:shadow-clay-btn-hover active:translate-y-[1px] active:shadow-clay-pressed focus-visible:outline-[3px] focus-visible:outline-solid focus-visible:outline-accent-green focus-visible:outline-offset-2 disabled:opacity-40 disabled:cursor-not-allowed disabled:pointer-events-none text-sm';
const cancelBtn =
  'font-primary text-sm font-bold tracking-wide border-2 border-accent-red rounded-sm bg-accent-red text-white shadow-clay-btn select-none transition-all duration-fast ease-in-out min-h-[44px] px-space-5 py-space-2 cursor-pointer hover:-translate-y-[2px] hover:shadow-clay-btn-hover active:translate-y-[1px] active:shadow-clay-pressed focus-visible:outline-[3px] focus-visible:outline-solid focus-visible:outline-accent-red focus-visible:outline-offset-2 disabled:opacity-40 disabled:cursor-not-allowed disabled:pointer-events-none text-sm';
const blueBtn =
  'font-primary text-sm font-bold tracking-wide border-2 border-accent-blue rounded-sm bg-surface-blue text-accent-blue shadow-clay-btn select-none transition-all duration-fast ease-in-out min-h-[44px] px-space-5 py-space-2 cursor-pointer hover:-translate-y-[2px] hover:shadow-clay-btn-hover active:translate-y-[1px] active:shadow-clay-pressed focus-visible:outline-[3px] focus-visible:outline-solid focus-visible:outline-accent-blue focus-visible:outline-offset-2 disabled:opacity-40 disabled:cursor-not-allowed disabled:pointer-events-none text-sm';

function newDraft(priority) {
  return {
    id: `r_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    name: '',
    enabled: true,
    priority,
    match: 'all',
    conditions: [{ field: 'domain', op: 'contains', value: '' }],
    customCategory: false,
    customSubcategory: false,
    action: { category: CATEGORIES.DEVELOPMENT, subcategory: '', tags: '' },
  };
}

function draftFromRule(rule) {
  const category = rule.action.category || '';
  const builtIn = Object.values(CATEGORIES).includes(category);
  const paths = flattenSubcategoryPaths(category);
  const subcategory = rule.action.subcategory || '';
  return {
    ...rule,
    customCategory: !builtIn,
    customSubcategory: Boolean(subcategory) && !paths.includes(subcategory),
    action: { ...rule.action, tags: (rule.action.tags || []).join(', ') },
  };
}

function fieldDef(field) {
  return RULE_FIELDS.find((f) => f.field === field) || RULE_FIELDS[0];
}

// Keep the user-defined category registry in sync with the rules that use it.
function collectCustomCategories(base, rules) {
  const builtIn = new Set(Object.values(CATEGORIES));
  const out = new Set((Array.isArray(base) ? base : []).filter(Boolean));
  for (const rule of rules) {
    const category = rule?.action?.category;
    if (typeof category === 'string' && category && !builtIn.has(category)) {
      out.add(category);
    }
  }
  return [...out];
}

export default function RulesPanel({ active }) {
  const [settings, setSettings] = useState(null);
  const [rules, setRules] = useState([]);
  const [legacy, setLegacy] = useState({});
  const [draft, setDraft] = useState(null);
  const [error, setError] = useState('');
  const [status, setStatus] = useState('');
  const [applying, setApplying] = useState(false);
  const { refreshCustomCategories } = useOptions();

  const load = async () => {
    const s = await getSettings();
    setSettings(s);
    setRules((s.customRules || []).map(normalizeRule).filter(Boolean));
    setLegacy(s.customDomainMappings || {});
  };

  useEffect(() => {
    if (active) load();
    // activation-driven reload; load only reads settings
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);

  useEffect(() => {
    if (!status) return;
    const t = setTimeout(() => setStatus(''), 4000);
    return () => clearTimeout(t);
  }, [status]);

  const persist = async (inputRules) => {
    const base = settings || (await getSettings());
    const nextRules = inputRules.map(normalizeRule).filter(Boolean);
    const next = {
      ...base,
      customRules: nextRules,
      customCategories: collectCustomCategories(base.customCategories, nextRules),
    };
    await saveSettings(next);
    setSettings(next);
    setRules(nextRules);
    refreshCustomCategories();
    return next;
  };

  const openNew = () => {
    setError('');
    setDraft(newDraft(rules.length));
  };

  const openEdit = (rule) => {
    setError('');
    setDraft(draftFromRule(rule));
  };

  const updateDraftCondition = (index, patch) => {
    setDraft((prev) => {
      const conditions = prev.conditions.map((c, i) => (i === index ? { ...c, ...patch } : c));
      return { ...prev, conditions };
    });
  };

  const changeConditionField = (index, field) => {
    const def = fieldDef(field);
    updateDraftCondition(index, { field, op: def.ops[0], value: '' });
  };

  const addCondition = () => {
    setDraft((prev) => ({
      ...prev,
      conditions: [...prev.conditions, { field: 'title', op: 'contains', value: '' }],
    }));
  };

  const removeCondition = (index) => {
    setDraft((prev) => ({
      ...prev,
      conditions: prev.conditions.filter((_, i) => i !== index),
    }));
  };

  const saveDraft = async () => {
    const normalized = normalizeRule({
      ...draft,
      priority: Number(draft.priority) || 0,
    });
    if (!normalized) {
      setError('Add at least one complete condition and choose a category.');
      return;
    }

    const exists = rules.some((r) => r.id === normalized.id);
    if (!exists && rules.length >= MAX_RULES) {
      setError(`You can keep up to ${MAX_RULES} rules. Delete one first.`);
      return;
    }

    const next = exists
      ? rules.map((r) => (r.id === normalized.id ? normalized : r))
      : [...rules, normalized];
    next.sort((a, b) => a.priority - b.priority);
    next.forEach((r, i) => { r.priority = i; });

    await persist(next);
    setDraft(null);
    setError('');
    setStatus('Rule saved.');
  };

  const toggleRule = async (id, enabled) => {
    await persist(rules.map((r) => (r.id === id ? { ...r, enabled } : r)));
  };

  const moveRule = async (index, direction) => {
    const target = index + direction;
    if (target < 0 || target >= rules.length) return;
    const next = [...rules];
    [next[index], next[target]] = [next[target], next[index]];
    next.forEach((r, i) => { r.priority = i; });
    await persist(next);
  };

  const deleteRule = async (id) => {
    if (!confirm('Delete this rule?')) return;
    await persist(rules.filter((r) => r.id !== id));
    setStatus('Rule deleted.');
  };

  const importLegacy = async () => {
    const converted = Object.entries(legacy)
      .map(([domain, mapping], i) =>
        normalizeRule({
          id: `legacy_${domain}`,
          name: `Domain: ${domain}`,
          enabled: true,
          priority: rules.length + i,
          match: 'all',
          conditions: [{ field: 'domain', op: 'equals', value: domain }],
          action: mapping,
        })
      )
      .filter(Boolean);

    const base = settings || (await getSettings());
    const nextRules = [...rules, ...converted];
    const next = {
      ...base,
      customRules: nextRules,
      customCategories: collectCustomCategories(base.customCategories, nextRules),
      customDomainMappings: {},
    };
    await saveSettings(next);
    setSettings(next);
    setRules(nextRules);
    setLegacy({});
    refreshCustomCategories();
    setStatus(`Imported ${converted.length} domain rule${converted.length === 1 ? '' : 's'}.`);
  };

  const applyNow = async () => {
    if (!confirm('Apply the current rules to all existing bookmarks? Matching bookmarks will be re-categorized and moved.')) return;
    setApplying(true);
    try {
      const count = await applyRulesToExisting();
      setStatus(
        count === 0
          ? 'No existing bookmarks matched the rules.'
          : `Updated ${count} bookmark${count === 1 ? '' : 's'}.`
      );
      (await import('./options.js')).loadBookmarks();
    } catch (e) {
      setStatus(`Failed: ${e.message}`);
    } finally {
      setApplying(false);
    }
  };

  const builtInCategory = draft ? Object.values(CATEGORIES).includes(draft.action.category) : false;
  const subcategoryOptions = draft && builtInCategory ? flattenSubcategoryPaths(draft.action.category) : [];
  const categoryChoices = [
    ...new Set([...CATEGORY_OPTIONS, ...(settings?.customCategories || [])]),
  ];
  const legacyCount = Object.keys(legacy).length;

  return (
    <div
      id="rulesPanel"
      className={`${active ? '' : 'hidden '}max-w-5xl mx-auto px-4 sm:px-6 py-5`}
    >
      <section className="bg-surface-card border-2 border-border-default rounded-md shadow-clay p-space-5 text-text-base">
        <h2 className="text-md font-extrabold tracking-tight text-text-base">Custom Rules</h2>
        <p className="text-sm text-text-muted mb-3 mt-space-2">
          Rules run before built-in classification. Lower priority numbers run first; the first
          matching rule wins. Match on domain, URL, title, description, keywords, tags, content
          type, and more.
        </p>

        {status && <p className="text-sm text-accent-green mb-3">{status}</p>}

        {legacyCount > 0 && (
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-3 px-3 py-2 bg-surface-inset border-2 border-border-default rounded-sm shadow-clay-inset">
            <p className="text-sm text-text-base">
              {legacyCount} legacy domain rule{legacyCount === 1 ? '' : 's'} found.
            </p>
            <button className={smallBtn} onClick={importLegacy}>Import to custom rules</button>
          </div>
        )}

        <div id="rulesList" className="flex flex-col gap-2 mb-3">
          {rules.length === 0 ? (
            <p className="text-sm text-text-secondary">No custom rules defined.</p>
          ) : (
            rules.map((rule, index) => (
              <div
                key={rule.id}
                className={`${CARD} px-space-4 py-space-2 flex flex-col sm:flex-row sm:items-center justify-between gap-2`}
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-bold text-text-base truncate">{rule.name}</span>
                    <span className={`${BADGE} text-xs`}>
                      {rule.action.category}
                      {rule.action.subcategory ? ` / ${rule.action.subcategory}` : ''}
                    </span>
                    <span className="text-xs text-text-secondary font-mono">#{index + 1}</span>
                  </div>
                  <p className="text-xs text-text-secondary mt-space-1 break-words">
                    {describeRule(rule)}
                    {rule.action.tags?.length > 0 && ` · tags: ${rule.action.tags.join(', ')}`}
                  </p>
                </div>
                <div className="flex items-center gap-1.5 shrink-0 flex-wrap">
                  <label className="flex items-center gap-1 cursor-pointer select-none text-xs font-semibold">
                    <input
                      type="checkbox"
                      className="w-4 h-4 rounded-xs border-2 border-border-default accent-accent-green cursor-pointer"
                      checked={rule.enabled}
                      onChange={(e) => toggleRule(rule.id, e.target.checked)}
                    />
                    <span className="text-text-base">{rule.enabled ? 'On' : 'Off'}</span>
                  </label>
                  <button className={smallBtn} title="Move up" disabled={index === 0} onClick={() => moveRule(index, -1)}>↑</button>
                  <button className={smallBtn} title="Move down" disabled={index === rules.length - 1} onClick={() => moveRule(index, 1)}>↓</button>
                  <button className={smallBtn} onClick={() => openEdit(rule)}>Edit</button>
                  <button className={dangerBtn} onClick={() => deleteRule(rule.id)}>Delete</button>
                </div>
              </div>
            ))
          )}
        </div>

        {!draft && (
          <div className="flex gap-2 flex-wrap">
            <button className={primaryBtn} onClick={openNew}>Add Rule</button>
            <button className={blueBtn} disabled={applying} onClick={applyNow}>
              {applying ? 'Applying…' : 'Apply to existing bookmarks'}
            </button>
          </div>
        )}

        {draft && (
          <div className={`${CARD} border-2 border-accent-green mt-3`}>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block">
                <span className="block text-sm text-text-base mb-1 font-semibold">Rule name</span>
                <input
                  type="text"
                  value={draft.name}
                  onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                  placeholder="e.g. React docs → Frontend"
                  className={`${inputCls} w-full`}
                />
              </label>
              <div className="grid grid-cols-2 gap-3">
                <label className="block">
                  <span className="block text-sm text-text-base mb-1 font-semibold">Priority</span>
                  <input
                    type="number"
                    value={draft.priority}
                    onChange={(e) => setDraft({ ...draft, priority: e.target.value })}
                    className={`${inputCls} w-full`}
                  />
                </label>
                <label className="block">
                  <span className="block text-sm text-text-base mb-1 font-semibold">Combine</span>
                  <select
                    value={draft.match}
                    onChange={(e) => setDraft({ ...draft, match: e.target.value })}
                    className={`${inputCls} w-full cursor-pointer`}
                  >
                    <option value="all">Match all</option>
                    <option value="any">Match any</option>
                  </select>
                </label>
              </div>
            </div>

            <div className="mt-4">
              <p className="text-xs font-bold uppercase tracking-widest text-text-secondary mb-2">Conditions</p>
              <div className="flex flex-col gap-2">
                {draft.conditions.map((condition, index) => {
                  const def = fieldDef(condition.field);
                  return (
                    <div key={index} className="flex items-center gap-2 flex-wrap">
                      <select
                        value={condition.field}
                        onChange={(e) => changeConditionField(index, e.target.value)}
                        className={`${inputCls} cursor-pointer min-w-[130px]`}
                      >
                        {RULE_FIELDS.map((f) => (
                          <option key={f.field} value={f.field}>{f.label}</option>
                        ))}
                      </select>
                      <select
                        value={condition.op}
                        onChange={(e) => updateDraftCondition(index, { op: e.target.value })}
                        className={`${inputCls} cursor-pointer min-w-[120px]`}
                      >
                        {def.ops.map((op) => (
                          <option key={op} value={op}>{OPERATOR_LABELS[op]}</option>
                        ))}
                      </select>
                      <input
                        type="text"
                        value={condition.value}
                        onChange={(e) => updateDraftCondition(index, { value: e.target.value })}
                        placeholder={condition.op.startsWith('includes') ? 'comma,separated' : 'value'}
                        className={`${inputCls} flex-1 min-w-[150px]`}
                      />
                      <button
                        className={smallBtn}
                        disabled={draft.conditions.length === 1}
                        title="Remove condition"
                        onClick={() => removeCondition(index)}
                      >
                        ✕
                      </button>
                    </div>
                  );
                })}
              </div>
              <button className={`${smallBtn} mt-2`} onClick={addCondition}>+ Add condition</button>
            </div>

            <div className="mt-4 grid gap-3 sm:grid-cols-3">
              <div className="block">
                <span className="block text-sm text-text-base mb-1 font-semibold">Category</span>
                {draft.customCategory ? (
                  <div className="flex items-center gap-1.5">
                    <input
                      type="text"
                      value={draft.action.category}
                      onChange={(e) =>
                        setDraft({ ...draft, action: { ...draft.action, category: e.target.value } })
                      }
                      placeholder="Custom category"
                      className={`${inputCls} w-full`}
                    />
                    <button
                      type="button"
                      className={smallBtn}
                      title="Choose from list"
                      onClick={() =>
                        setDraft({
                          ...draft,
                          customCategory: false,
                          customSubcategory: false,
                          action: { ...draft.action, category: CATEGORY_OPTIONS[0], subcategory: '' },
                        })
                      }
                    >
                      List
                    </button>
                  </div>
                ) : (
                  <select
                    value={draft.action.category}
                    onChange={(e) => {
                      const value = e.target.value;
                      if (value === '__custom__') {
                        setDraft({
                          ...draft,
                          customCategory: true,
                          customSubcategory: true,
                          action: { ...draft.action, category: '', subcategory: '' },
                        });
                      } else {
                        setDraft({
                          ...draft,
                          customCategory: false,
                          customSubcategory: false,
                          action: { ...draft.action, category: value, subcategory: '' },
                        });
                      }
                    }}
                    className={`${inputCls} w-full cursor-pointer`}
                  >
                    {categoryChoices.map((c) => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                    <option value="__custom__">Custom…</option>
                  </select>
                )}
              </div>
              <div className="block">
                <span className="block text-sm text-text-base mb-1 font-semibold">Subcategory</span>
                {draft.customCategory || draft.customSubcategory ? (
                  <div className="flex items-center gap-1.5">
                    <input
                      type="text"
                      value={draft.action.subcategory}
                      onChange={(e) =>
                        setDraft({ ...draft, action: { ...draft.action, subcategory: e.target.value } })
                      }
                      placeholder="Custom subcategory"
                      className={`${inputCls} w-full`}
                    />
                    {!draft.customCategory && (
                      <button
                        type="button"
                        className={smallBtn}
                        title="Choose from list"
                        onClick={() =>
                          setDraft({ ...draft, customSubcategory: false, action: { ...draft.action, subcategory: '' } })
                        }
                      >
                        List
                      </button>
                    )}
                  </div>
                ) : (
                  <select
                    value={draft.action.subcategory}
                    onChange={(e) => {
                      const value = e.target.value;
                      if (value === '__custom__') {
                        setDraft({ ...draft, customSubcategory: true, action: { ...draft.action, subcategory: '' } });
                      } else {
                        setDraft({ ...draft, action: { ...draft.action, subcategory: value } });
                      }
                    }}
                    className={`${inputCls} w-full cursor-pointer`}
                  >
                    <option value="">(none)</option>
                    {subcategoryOptions.map((p) => (
                      <option key={p} value={p}>{p}</option>
                    ))}
                    <option value="__custom__">Custom…</option>
                  </select>
                )}
              </div>
              <label className="block">
                <span className="block text-sm text-text-base mb-1 font-semibold">Add tags</span>
                <input
                  type="text"
                  value={draft.action.tags}
                  onChange={(e) =>
                    setDraft({ ...draft, action: { ...draft.action, tags: e.target.value } })
                  }
                  placeholder="comma,separated"
                  className={`${inputCls} w-full`}
                />
              </label>
            </div>

            {error && <p className="text-sm text-red-600 mt-3">{error}</p>}

            <div className="flex items-center justify-between gap-2 flex-wrap mt-4">
              <button className={primaryBtn} onClick={saveDraft}>Save Rule</button>
              <button className={cancelBtn} onClick={() => { setDraft(null); setError(''); }}>Cancel</button>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
