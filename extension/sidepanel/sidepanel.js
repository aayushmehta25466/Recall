import { mountSearchPanel } from '../../shared/ui/searchPanel.js';

// Same surface as the popup — see shared/ui/searchPanel.js.
document.addEventListener('DOMContentLoaded', () => {
  mountSearchPanel({ variant: 'sidebar' });
});
