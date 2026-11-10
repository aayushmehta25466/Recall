import { useEffect, useState } from 'react';
import { getTrashedBookmarks } from '../../database/indexeddb/db.js';
import { sendMessage } from '../../shared/platform.js';
import { BTN_SECONDARY, CARD } from '../../shared/ui.js';
import { useOptions } from './OptionsContext.jsx';

// React port of the trash block that lived in options.js (loadTrash / restore /
// restore-all / empty-trash). The sidebar count and bookmark refresh still run
// through options.js so Home reacts the same way it did in vanilla.

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

export default function TrashPanel({ active }) {
  const [items, setItems] = useState([]);
  const { refreshTrashCount } = useOptions();

  const load = async () => {
    setItems(await getTrashedBookmarks());
  };

  useEffect(() => {
    if (!active) return;
    (async () => {
      await load();
      refreshTrashCount();
    })();
    // activation-driven, same lazy-loader contract as the vanilla tab
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);

  const onRestore = async (url) => {
    await sendMessage({ type: 'RESTORE_BOOKMARK', url });
    await load();
    refreshTrashCount();
    (await vanilla()).loadBookmarks();
  };

  const onRestoreAll = async () => {
    if (items.length === 0) return;
    if (!confirm(`Restore ${items.length} bookmark${items.length !== 1 ? 's' : ''} from trash?`)) return;
    for (const b of items) {
      await sendMessage({ type: 'RESTORE_BOOKMARK', url: b.url });
    }
    await load();
    refreshTrashCount();
    (await vanilla()).loadBookmarks();
  };

  const onEmptyTrash = async () => {
    if (!confirm(`Permanently delete ${items.length} bookmarks? This cannot be undone.`)) return;
    await sendMessage({ type: 'EMPTY_TRASH' });
    for (const b of items) {
      try {
        const results = await chrome.bookmarks.search({ url: b.url });
        for (const node of results) await chrome.bookmarks.remove(node.id);
      } catch { /* ignore */ }
    }
    await load();
    refreshTrashCount();
  };

  return (
    <div
      id="trashPanel"
      className={`${active ? '' : 'hidden '}max-w-5xl mx-auto px-4 sm:px-6 py-5`}
    >
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
        <h2 className="text-md font-extrabold tracking-tight text-text-base">Trashed Bookmarks</h2>
        <div className="flex gap-2 items-center flex-wrap">
          <span id="trashInfo" className="text-sm text-text-secondary">
            {items.length} item{items.length !== 1 ? 's' : ''}
          </span>
          <button
            id="restoreAllBtn"
            className="font-primary text-sm font-bold tracking-wide border-2 border-border-strong rounded-sm bg-surface-raised text-text-base shadow-clay-btn select-none transition-all duration-fast ease-in-out min-h-[44px] px-space-5 py-space-2 cursor-pointer hover:-translate-y-[2px] hover:shadow-clay-btn-hover active:translate-y-[1px] active:shadow-clay-pressed focus-visible:outline-[3px] focus-visible:outline-solid focus-visible:outline-accent-green focus-visible:outline-offset-2 disabled:opacity-40 disabled:cursor-not-allowed disabled:pointer-events-none text-sm"
            onClick={onRestoreAll}
          >
            Restore All
          </button>
          <button
            id="emptyTrashBtn"
            className="font-primary text-sm font-bold tracking-wide border-2 border-accent-red rounded-sm bg-accent-red text-white shadow-clay-btn select-none transition-all duration-fast ease-in-out min-h-[44px] px-space-5 py-space-2 cursor-pointer hover:-translate-y-[2px] hover:shadow-clay-btn-hover active:translate-y-[1px] active:shadow-clay-pressed focus-visible:outline-[3px] focus-visible:outline-solid focus-visible:outline-accent-red focus-visible:outline-offset-2 disabled:opacity-40 disabled:cursor-not-allowed disabled:pointer-events-none text-sm"
            onClick={onEmptyTrash}
          >
            Empty Trash
          </button>
        </div>
      </div>

      <div id="trashList" className="flex flex-col gap-3">
        {items.map((b) => (
          <div
            key={b.url}
            className={`${CARD} flex items-center justify-between gap-3 opacity-75`}
          >
            <div className="min-w-0 flex-1">
              <h3 className="text-sm font-bold text-text-base truncate">
                {b.title || b.url}
              </h3>
              <p className="text-xs text-text-secondary truncate">{b.url}</p>
              <p className="text-xs text-text-secondary mt-space-1">
                Trashed: {formatDate(b.trashedAt)}
              </p>
            </div>
            <button
              className={`restore-btn ${BTN_SECONDARY} text-xs shrink-0`}
              onClick={() => onRestore(b.url)}
            >
              Restore
            </button>
          </div>
        ))}
      </div>

      <div
        id="trashEmpty"
        className={`${items.length === 0 ? '' : 'hidden '}text-center py-16 text-text-secondary text-sm`}
      >
        Trash is empty.
      </div>
    </div>
  );
}
