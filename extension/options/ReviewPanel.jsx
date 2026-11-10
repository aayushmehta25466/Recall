import { useEffect, useRef, useState } from 'react';
import { updateBookmark } from '../../database/indexeddb/db.js';
import { getSettings } from '../../shared/settings.js';
import { sendMessage } from '../../shared/platform.js';
import { CATEGORIES } from '../../shared/types/taxonomy.js';
import { CARD, BADGE, BADGE_DARK } from '../../shared/ui.js';
import { useOptions } from './OptionsContext.jsx';

// Faithful React port of the review block that lived in options.js
// (loadReview / renderReviewList / updateReviewBulkBar / bulk handlers /
// batch AI). Shared mutations (assignCategory,
// loadBookmarks, edit-mode read) still live in options.js and are pulled
// in through the cached dynamic import below — options.js must never be
// statically imported here: its top-level init needs the committed DOM.
const CATEGORY_OPTIONS = Object.values(CATEGORIES).filter(
  (c) => c !== CATEGORIES.UNCATEGORIZED
);
// Vanilla resets the subcategory select's placeholder to "(optional)"
// after the first interaction; the initial markup says plain "Subcategory".
const SUB_INITIAL = [{ value: '', label: 'Subcategory' }];
const SUB_RESET = [{ value: '', label: 'Subcategory (optional)' }];

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

export default function ReviewPanel({ active }) {
  const [items, setItems] = useState([]);
  const [loadError, setLoadError] = useState(false);
  const [emptyShown, setEmptyShown] = useState(false);
  const [selected, setSelected] = useState(() => new Set());
  const [statsText, setStatsText] = useState('');
  const [batchEnabled, setBatchEnabled] = useState(false); // setBatchButtonState
  const [editMode, setEditMode] = useState(false);
  const [bulkCat, setBulkCat] = useState('');
  const [subOptions, setSubOptions] = useState(SUB_INITIAL);
  const [subValue, setSubValue] = useState('');
  const [batchRunning, setBatchRunning] = useState(false);
  const [batch, setBatch] = useState(null); // { pct, status } while progress is shown
  const selectAllRef = useRef(null);
  const { setUncatCount, refreshTrashCount, customCategories } = useOptions();
  const categoryOptions = [...new Set([...CATEGORY_OPTIONS, ...customCategories])];

  // loadReview — fires each time the panel activates, the same lazy-loader
  // contract activateTab() had for the review tab.
  const load = async () => {
    try {
      const { getUncategorizedBookmarks } = await import(
        '../../core/ai-classifier/batchCategorizer.js'
      );
      const next = await getUncategorizedBookmarks();
      setLoadError(false);
      setItems(next);
      setEmptyShown(next.length === 0);
      setStatsText(
        next.length === 0
          ? ''
          : `${next.length} bookmark${next.length !== 1 ? 's' : ''} need categorization`
      );
      setBatchEnabled(next.length > 0);
      if (next.length === 0) {
        setSelected(new Set());
      } else {
        // Drop selections for bookmarks that no longer exist / are now categorized
        setSelected((prev) =>
          new Set([...prev].filter((url) => next.some((b) => b.url === url)))
        );
      }
      setUncatCount(next.length);
      setEditMode((await vanilla()).isEditMode());
    } catch (e) {
      console.error('Failed to load review:', e);
      setLoadError(true);
      setBatchEnabled(false);
    }
  };

  useEffect(() => {
    if (active) load();
    // load only uses stable setters + fresh imports
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);

  // Tri-state select-all: checked / indeterminate are DOM properties React
  // can't express as props — mirror them after every selection change.
  useEffect(() => {
    const el = selectAllRef.current;
    if (!el) return;
    el.checked = items.length > 0 && selected.size === items.length;
    el.indeterminate = selected.size > 0 && selected.size < items.length;
  }, [selected, items]);

  // After a card mutation: reload the queue and refresh the sidebar badge.
  const reload = async () => {
    await load();
    refreshTrashCount();
  };

  const toggleUrl = (url, on) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (on) next.add(url);
      else next.delete(url);
      return next;
    });

  const onCategoryChange = async (e) => {
    const cat = e.target.value;
    setBulkCat(cat);
    setSubValue('');
    setSubOptions(SUB_RESET);
    if (!cat) return;
    const { flattenSubcategoryPaths } = await import(
      '../../core/taxonomy/categories.js'
    );
    setSubOptions([
      { value: '', label: 'Subcategory (optional)' },
      ...flattenSubcategoryPaths(cat).map((p) => ({ value: p, label: p })),
    ]);
  };

  const onAssign = async () => {
    if (!bulkCat || selected.size === 0) return;
    const mod = await vanilla();
    await mod.assignCategory([...selected], bulkCat, subValue || null);
    setSelected(new Set());
    setBulkCat('');
    setSubOptions(SUB_RESET);
    setSubValue('');
    await load();
  };

  const onBulkOpen = () => {
    if (selected.size === 0) return;
    const urls = [...selected];
    if (urls.length === 1) {
      chrome.tabs.create({ url: urls[0], active: true });
      return;
    }
    sendMessage({ type: 'OPEN_IN_TAB_GROUP', urls });
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

  const onBulkDelete = async () => {
    for (const url of selected) await sendMessage({ type: 'TRASH_BOOKMARK', url });
    setSelected(new Set());
    await reload();
  };

  const onBatch = async () => {
    if (batchRunning || !batchEnabled) return;
    try {
      const { runBatchCategorize } = await import(
        '../../core/ai-classifier/batchCategorizer.js'
      );
      const settings = await getSettings();
      if (!settings.openrouterApiKey) {
        alert('Add an OpenRouter API key in Settings to use AI categorization.');
        return;
      }

      setBatchRunning(true);
      setBatch({ pct: 0, status: 'Starting...' });

      const { processed, categorized, errors } = await runBatchCategorize(
        settings,
        (current, total) => {
          const pct = total > 0 ? Math.round((current / total) * 100) : 0;
          setBatch({ pct, status: `Processing ${current} of ${total}...` });
        }
      );

      let status;
      if (errors && errors.length > 0) {
        status = `Failed: ${categorized}/${processed} categorized. First error: ${errors[0]}`;
        console.error('Batch categorize errors:', errors);
      } else if (processed === 0) {
        status = 'No uncategorized bookmarks found.';
      } else {
        status = `Done! Categorized ${categorized} of ${processed} bookmarks.`;
      }
      setBatch((b) => (b ? { ...b, status } : b));

      setTimeout(async () => {
        setBatch(null);
        setBatchRunning(false);
        await load();
        (await vanilla()).loadBookmarks();
      }, 2000);
    } catch (e) {
      console.error('Batch categorize failed:', e);
      setBatch((b) => ({ pct: b?.pct ?? 0, status: `Error: ${e.message}` }));
      setBatchRunning(false);
    }
  };

  const renderCard = (b, i) => {
    const isSelected = selected.has(b.url);
    const selectedCls = isSelected ? 'bg-surface-raised/30 shadow-clay' : '';
    return (
      <article
        key={b.url}
        className={`${CARD} mb-3 transition-all duration-fast group relative ${selectedCls} pl-12`}
        data-url={b.url}
        data-index={i}
        draggable={editMode}
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
              onClick={async () => {
                await updateBookmark(b.url, { isPinned: !b.isPinned });
                await reload();
              }}
            >
              {b.isPinned ? '★' : '☆'}
            </button>
            <button
              className="trash-btn text-xs font-bold text-red-600 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity"
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

  return (
    <div
      id="reviewPanel"
      className={`${active ? '' : 'hidden '}max-w-5xl mx-auto px-4 sm:px-6 py-5`}
    >
      <section className="bg-surface-card border-2 border-border-default rounded-md shadow-clay p-space-5 text-text-base">
        <div className="flex items-center justify-between gap-2 flex-wrap mb-3">
          <div>
            <h2 className="text-md font-extrabold tracking-tight text-text-base">
              Uncategorized Bookmarks
            </h2>
            <p className="text-sm text-text-muted mt-1">
              These bookmarks couldn't be categorized by local rules. Use AI to
              classify them in bulk.
            </p>
          </div>
          <button
            id="batchCategorizeBtn"
            disabled={!batchEnabled || batchRunning}
            title={
              batchEnabled
                ? 'Classify uncategorized bookmarks with AI'
                : 'No uncategorized bookmarks'
            }
            className={`font-primary text-sm font-bold tracking-wide border-2 border-accent-blue rounded-sm bg-surface-blue text-accent-blue shadow-clay-btn select-none transition-all duration-fast ease-in-out min-h-[44px] px-space-5 py-space-2 cursor-pointer hover:-translate-y-[2px] hover:shadow-clay-btn-hover active:translate-y-[1px] active:shadow-clay-pressed focus-visible:outline-[3px] focus-visible:outline-solid focus-visible:outline-accent-blue focus-visible:outline-offset-2 disabled:opacity-40 disabled:cursor-not-allowed disabled:pointer-events-none text-sm shrink-0${
              batchRunning ? ' opacity-50 cursor-not-allowed' : ''
            }`}
            onClick={onBatch}
          >
            Categorize with AI
          </button>
        </div>
        <div id="batchProgress" className={`mb-3 ${batch ? '' : 'hidden'}`}>
          <div className="flex justify-between text-sm mb-1">
            <span id="batchStatus" className="text-text-base">
              {batch ? batch.status : 'Processing...'}
            </span>
            <span id="batchPercent" className="text-text-base font-mono">
              {batch ? `${batch.pct}%` : '0%'}
            </span>
          </div>
          <div className="w-full bg-surface-inset rounded-xs h-3 border-2 border-border-default shadow-clay-inset">
            <div
              id="batchBar"
              className="bg-accent-blue h-full rounded-xs transition-all duration-normal"
              style={{ width: `${batch ? batch.pct : 0}%` }}
            ></div>
          </div>
        </div>
        <div id="reviewStats" className="text-sm text-text-secondary mb-3">
          {statsText}
        </div>

        {/* Review Bulk Bar — one row at md+, wraps to 2-3 rows below (row 1 = status + picks + Assign) */}
        <div
          id="rBulkBar"
          className={`bg-surface-muted border-2 border-border-default rounded-sm text-text-base shadow-clay mb-3 px-3 py-2.5${
            selected.size === 0 ? ' hidden' : ''
          }`}
        >
          <div className="flex flex-wrap items-center gap-x-2.5 gap-y-2">
            {/* Row 1 (full width below lg): status + picks + Assign, stretches to fill */}
            <div className="flex flex-wrap items-center gap-x-2.5 gap-y-2 w-full lg:w-auto lg:flex-1 min-w-0">
              <span
                id="rSelectedCount"
                className="flex items-center gap-1 text-xs font-bold text-accent-green shrink-0"
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
                    strokeWidth={2.5}
                    d="M5 13l4 4L19 7"
                  />
                </svg>
                <span>{selected.size}</span>
              </span>
              <label
                className="flex items-center gap-1 cursor-pointer select-none text-xs font-semibold text-text-base shrink-0"
                title="Select all in review"
              >
                <input
                  type="checkbox"
                  id="rSelectAllChk"
                  ref={selectAllRef}
                  className="w-4 h-4 rounded-xs border-2 border-border-default accent-accent-green cursor-pointer"
                  onChange={(e) =>
                    setSelected(
                      e.target.checked
                        ? new Set(items.map((b) => b.url))
                        : new Set()
                    )
                  }
                />
                <span>Select all</span>
              </label>
              <button
                id="rDeselectAllBtn"
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
                    strokeWidth={3}
                    d="M6 18L18 6M6 6l12 12"
                  />
                </svg>
              </button>
              <div className="w-px h-4 bg-border-default shrink-0"></div>
              <select
                id="rBulkCategory"
                value={bulkCat}
                onChange={onCategoryChange}
                className="shrink-0 w-[140px] max-w-full bg-surface-inset border-2 border-border-default rounded-xs text-xs text-text-base px-2 shadow-clay-inset focus-visible:outline-[3px] focus-visible:outline-solid focus-visible:outline-accent-blue focus-visible:outline-offset-2 h-8 cursor-pointer"
              >
                <option value="">Category…</option>
                {categoryOptions.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
              <select
                id="rBulkSubcategory"
                value={subValue}
                disabled={!bulkCat}
                onChange={(e) => setSubValue(e.target.value)}
                className="shrink-0 w-[145px] max-w-full bg-surface-inset border-2 border-border-default rounded-xs text-xs text-text-base px-2 shadow-clay-inset focus-visible:outline-[3px] focus-visible:outline-solid focus-visible:outline-accent-blue focus-visible:outline-offset-2 h-8 cursor-pointer truncate"
              >
                {subOptions.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
              <button
                id="rBulkAssignBtn"
                disabled={!bulkCat || selected.size === 0}
                className="font-primary text-xs font-bold tracking-wide border-2 border-border-strong rounded-xs bg-surface-raised text-text-base shadow-clay-btn select-none transition-all duration-fast ease-in-out h-8 px-3 cursor-pointer hover:-translate-y-px hover:shadow-clay-btn-hover active:translate-y-px active:shadow-clay-pressed focus-visible:outline-[3px] focus-visible:outline-solid focus-visible:outline-accent-green focus-visible:outline-offset-2 disabled:opacity-40 disabled:cursor-not-allowed shrink-0"
                onClick={onAssign}
              >
                Assign
              </button>
            </div>
            {/* Row 2 below lg, right side of the same row at lg+ */}
            <div className="flex items-center gap-2 flex-wrap w-full lg:w-auto lg:shrink-0">
              <button
                id="rBulkOpenBtn"
                className="font-primary text-xs font-bold tracking-wide border-2 border-accent-green rounded-xs bg-accent-green text-white shadow-clay-btn select-none transition-all duration-fast ease-in-out h-8 px-3 cursor-pointer hover:-translate-y-px hover:shadow-clay-btn-hover active:translate-y-px active:shadow-clay-pressed focus-visible:outline-[3px] focus-visible:outline-solid focus-visible:outline-accent-green focus-visible:outline-offset-2"
                title="Open selected"
                onClick={onBulkOpen}
              >
                Open
              </button>
              <button
                id="rBulkTagBtn"
                className="font-primary text-xs font-bold tracking-wide border-2 border-border-default rounded-xs bg-surface-card text-text-base shadow-clay-btn select-none transition-all duration-fast ease-in-out h-8 px-3 cursor-pointer hover:-translate-y-px hover:shadow-clay-btn-hover active:translate-y-px active:shadow-clay-pressed focus-visible:outline-[3px] focus-visible:outline-solid focus-visible:outline-accent-green focus-visible:outline-offset-2"
                title="Tag selected"
                onClick={onBulkTag}
              >
                Tags
              </button>
              <button
                id="rBulkDeleteBtn"
                className="font-primary text-xs font-bold tracking-wide border-2 border-accent-red rounded-xs bg-accent-red text-white shadow-clay-btn select-none transition-all duration-fast ease-in-out h-8 w-8 p-0 inline-flex items-center justify-center cursor-pointer hover:-translate-y-px hover:shadow-clay-btn-hover active:translate-y-px active:shadow-clay-pressed focus-visible:outline-[3px] focus-visible:outline-solid focus-visible:outline-accent-red focus-visible:outline-offset-2"
                title="Trash selected"
                onClick={onBulkDelete}
              >
                <svg
                  className="w-4 h-4"
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
              </button>
            </div>
          </div>
        </div>

        <div id="reviewList" className="flex flex-col gap-3">
          {loadError ? (
            <p className="text-sm font-bold text-red-600">
              Failed to load uncategorized bookmarks.
            </p>
          ) : (
            items.map((b, i) => renderCard(b, i))
          )}
        </div>
        <div
          id="reviewEmpty"
          className={`text-center py-12 text-text-secondary text-sm${
            emptyShown && !loadError ? '' : ' hidden'
          }`}
        >
          All bookmarks categorized! Nothing to review.
        </div>
      </section>
    </div>
  );
}
