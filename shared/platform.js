/**
 * Cross-browser platform layer.
 *
 * Chromium exposes `chrome` (promise-based since MV3) and, from Chrome 148, `browser`.
 * Firefox exposes `browser` (promise-based) plus a **callback-based** `chrome`
 * compatibility namespace — so `await chrome.bookmarks.getTree()` yields `undefined`
 * there. Resolving the namespace lazily (on property access) also keeps this safe for
 * tests that install a `chrome` global *after* importing this module.
 */
export const api = new Proxy({}, {
  get(_target, prop) {
    const ns = globalThis.browser ?? globalThis.chrome;
    return ns?.[prop];
  },
});

/** What the current host actually provides. */
export const caps = {
  get sidePanel() {
    return Boolean(api.sidePanel);
  },
  get tabGroups() {
    return Boolean(api.tabGroups && api.tabs && api.tabs.group);
  },
};

/* ── messaging ─────────────────────────────────────────────────────────── */

/** Promise wrapper around the callback form, which both engines support. */
export function sendMessage(message) {
  return new Promise((resolve) => {
    try {
      api.runtime.sendMessage(message, (response) => {
        void api.runtime.lastError; // swallow "no receiver" without throwing
        resolve(response);
      });
    } catch {
      resolve(undefined);
    }
  });
}

/** Fire-and-forget message that must never throw when nobody is listening. */
export function broadcast(message) {
  try {
    const ret = api.runtime.sendMessage(message);
    if (ret && typeof ret.catch === 'function') ret.catch(() => {});
  } catch {
    /* no receiver */
  }
}

/* ── storage ───────────────────────────────────────────────────────────── */

export function storageGet(area, keys) {
  return new Promise((resolve) => {
    api.storage[area].get(keys, (data) => resolve(data || {}));
  });
}

export function storageSet(area, values) {
  return new Promise((resolve) => {
    api.storage[area].set(values, resolve);
  });
}

export function storageRemove(area, keys) {
  return new Promise((resolve) => {
    api.storage[area].remove(keys, resolve);
  });
}

/* ── side panel (Chromium) / sidebar (Firefox) ─────────────────────────── */

/**
 * Close the side panel / sidebar.
 *
 * Chromium only grew `sidePanel.close()` in 141, and it needs a target: the
 * global panel this extension uses is closed by `windowId` (a bare `close()`
 * rejects). Older Chromium has no close method at all, so the panel page —
 * which is the only caller — closes itself with `window.close()`.
 */
export async function closeSidebar() {
  if (api.sidePanel?.close) {
    try {
      const { id: windowId } = (await api.windows?.getCurrent?.()) || {};
      await api.sidePanel.close({ windowId });
      return true;
    } catch { /* pre-141 or no window context — fall through */ }
  }
  if (api.sidebarAction?.close) {
    try {
      await api.sidebarAction.close();
      return true;
    } catch { /* fall through */ }
  }
  try {
    window.close();
    return true;
  } catch {
    return false;
  }
}

export async function toggleSidebar() {
  if (api.sidebarAction?.toggle) {
    try {
      await api.sidebarAction.toggle();
      return true;
    } catch { /* fall through */ }
  }
  if (api.sidePanel) {
    try {
      const [tab] = await api.tabs.query({ active: true, currentWindow: true });
      if (!tab) return false;
      const state = await api.sidePanel.getPanelBehavior({ tabId: tab.id });
      if (state?.openPanelOnActionClick) {
        await api.sidePanel.close();
        await api.sidePanel.setPanelBehavior({ openPanelOnActionClick: false });
      } else {
        await api.sidePanel.open({ tabId: tab.id });
        await api.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
      }
      return true;
    } catch { /* fall through */ }
  }
  return false;
}
