import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { getTrashedBookmarks } from '../../database/indexeddb/db.js';
import { getSettings } from '../../shared/settings.js';

// Cross-panel React state for the options page. Sidebar badges and the shared
// sort value used to be patched into the DOM by the vanilla module; they now
// live here so every panel updates through props/context only.

const OptionsContext = createContext(null);

export function OptionsProvider({ children }) {
  const [trashCount, setTrashCount] = useState(0);
  const [uncatCount, setUncatCount] = useState(0);
  const [sort, setSort] = useState('manual');
  const [customCategories, setCustomCategories] = useState([]);

  const refreshTrashCount = useCallback(async () => {
    const items = await getTrashedBookmarks();
    setTrashCount(items.length);
  }, []);

  const refreshCustomCategories = useCallback(async () => {
    const settings = await getSettings();
    setCustomCategories(Array.isArray(settings.customCategories) ? settings.customCategories : []);
  }, []);

  useEffect(() => {
    refreshTrashCount();
    refreshCustomCategories();
  }, [refreshTrashCount, refreshCustomCategories]);

  const value = useMemo(
    () => ({
      trashCount,
      refreshTrashCount,
      uncatCount,
      setUncatCount,
      sort,
      setSort,
      customCategories,
      refreshCustomCategories,
    }),
    [trashCount, refreshTrashCount, uncatCount, sort, customCategories, refreshCustomCategories]
  );

  return <OptionsContext.Provider value={value}>{children}</OptionsContext.Provider>;
}

export function useOptions() {
  const ctx = useContext(OptionsContext);
  if (!ctx) throw new Error('useOptions must be used inside OptionsProvider');
  return ctx;
}
