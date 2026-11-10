import { createRoot } from 'react-dom/client';
import OptionsApp from './OptionsApp.jsx';
import { OptionsProvider } from './OptionsContext.jsx';

// Theme detection (replaces inline script for CSP compliance)
chrome.storage.sync.get('settings', (data) => {
  const theme = data.settings?.theme || 'auto';
  const isDark = theme === 'dark' || (theme === 'auto' && window.matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.classList.toggle('dark', isDark);
  document.documentElement.classList.toggle('light', !isDark);
});

createRoot(document.getElementById('root')).render(
  <OptionsProvider>
    <OptionsApp />
  </OptionsProvider>
);
