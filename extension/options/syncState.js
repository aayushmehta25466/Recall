import { useEffect, useState } from 'react';

// Shared bulk-sync progress. The background worker broadcasts SYNC_PROGRESS,
// so Settings (progress bar) and Home (hero buttons) both need the same state.
// The listener is registered once at module scope and fans out to subscribers.

const IDLE = { active: false, complete: false, current: 0, total: 0, url: '' };

let state = IDLE;
let resetTimer = null;
const listeners = new Set();

function emit() {
  for (const fn of listeners) fn(state);
}

if (typeof chrome !== 'undefined' && chrome.runtime?.onMessage) {
  chrome.runtime.onMessage.addListener((message) => {
    if (message.type !== 'SYNC_PROGRESS') return;
    const { current, total, url } = message;
    clearTimeout(resetTimer);

    if (current < total) {
      state = { active: true, complete: false, current, total, url: url || '' };
      emit();
      return;
    }

    state = { active: true, complete: true, current, total, url: '' };
    emit();
    resetTimer = setTimeout(() => {
      state = IDLE;
      emit();
    }, 2000);
  });
}

export function subscribeSync(fn) {
  listeners.add(fn);
  fn(state);
  return () => listeners.delete(fn);
}

// Keep the service worker alive while a long sync runs.
export function startSync() {
  clearTimeout(resetTimer);
  state = { ...IDLE, active: true };
  emit();

  const port = chrome.runtime.connect({ name: 'sync-keepalive' });
  chrome.runtime.sendMessage({ type: 'START_BULK_SYNC' }, () => port.disconnect());
}

export function checkSyncStatus() {
  chrome.runtime.sendMessage({ type: 'GET_SYNC_STATUS' }, (response) => {
    if (response?.isSyncing && !state.active) {
      state = { ...IDLE, active: true };
      emit();
    }
  });
}

export function useSyncState() {
  const [snapshot, setSnapshot] = useState(state);
  useEffect(() => subscribeSync(setSnapshot), []);
  return snapshot;
}
