import { mountSearchPanel } from '../../shared/ui/searchPanel.js';

// The popup and the side panel share one implementation; only the host differences
// (canvas size, close behaviour, auto-focus) vary by variant.
document.addEventListener('DOMContentLoaded', () => {
  mountSearchPanel({ variant: 'popup' });
});
