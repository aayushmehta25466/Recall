import { useEffect, useRef, useState } from 'react';
import { getActiveBookmarks, initDB } from '../../database/indexeddb/db.js';
import { createBookmark } from '../../shared/types/bookmark.js';
import { downloadCsv, downloadHtml, downloadJson } from './exporters.js';

// React port of the export/import block that lived in options.js. Parsing and
// dedupe rules are unchanged; only the DOM assembly moved into JSX.

let vanillaMod;
function vanilla() {
  if (!vanillaMod) vanillaMod = import('./options.js');
  return vanillaMod;
}

// Parse the three supported formats into a plain array of bookmark-shaped objects.
async function parseImportFile(file) {
  const text = await file.text();
  const ext = file.name.split('.').pop().toLowerCase();

  if (ext === 'json') {
    const data = JSON.parse(text);
    return Array.isArray(data) ? data : [];
  }

  if (ext === 'csv') {
    const lines = text.split('\n').filter(Boolean);
    const headers = lines[0].split(',').map((h) => h.replace(/"/g, '').trim());
    return lines.slice(1).map((line) => {
      const vals = line.match(/(".*?"|[^",]+)(?=\s*,|\s*$)/g) || [];
      const obj = {};
      headers.forEach((h, i) => {
        obj[h] = (vals[i] || '').replace(/^"|"$/g, '').replace(/""/g, '"');
      });
      if (obj.tags) obj.tags = obj.tags.split(';').map((t) => t.trim()).filter(Boolean);
      return obj;
    });
  }

  if (ext === 'html') {
    const parser = new DOMParser();
    const doc = parser.parseFromString(text, 'text/html');
    const links = doc.querySelectorAll('a');
    return Array.from(links)
      .map((a) => ({
        url: a.getAttribute('href'),
        title: a.textContent,
        dateAdded: a.getAttribute('ADD_DATE')
          ? new Date(parseInt(a.getAttribute('ADD_DATE'), 10) * 1000).toISOString()
          : new Date().toISOString(),
      }))
      .filter((b) => b.url);
  }

  return [];
}

const sectionCls =
  'bg-surface-card border-2 border-border-default rounded-md shadow-clay p-space-5 text-text-base';
const primaryBtn =
  'font-primary text-sm font-bold tracking-wide border-2 border-border-strong rounded-sm bg-surface-raised text-text-base shadow-clay-btn select-none transition-all duration-fast ease-in-out min-h-[44px] px-space-5 py-space-2 cursor-pointer hover:-translate-y-[2px] hover:shadow-clay-btn-hover active:translate-y-[1px] active:shadow-clay-pressed focus-visible:outline-[3px] focus-visible:outline-solid focus-visible:outline-accent-green focus-visible:outline-offset-2 disabled:opacity-40 disabled:cursor-not-allowed disabled:pointer-events-none text-sm';
const secondaryBtn =
  'font-primary text-sm font-bold tracking-wide border-2 border-border-default rounded-sm bg-surface-card text-text-base shadow-clay-btn select-none transition-all duration-fast ease-in-out min-h-[44px] px-space-5 py-space-2 cursor-pointer hover:-translate-y-[2px] hover:shadow-clay-btn-hover active:translate-y-[1px] active:shadow-clay-pressed focus-visible:outline-[3px] focus-visible:outline-solid focus-visible:outline-accent-green focus-visible:outline-offset-2 disabled:opacity-40 disabled:cursor-not-allowed disabled:pointer-events-none text-sm';

export default function DataPanel({ active }) {
  const [fileName, setFileName] = useState('');
  const [pending, setPending] = useState([]);
  const [preview, setPreview] = useState(null);
  const [importing, setImporting] = useState(false);
  const [progress, setProgress] = useState(null);
  const [exportStatus, setExportStatus] = useState('');
  const fileInputRef = useRef(null);

  useEffect(() => {
    if (!exportStatus) return;
    const t = setTimeout(() => setExportStatus(''), 3000);
    return () => clearTimeout(t);
  }, [exportStatus]);

  const onExport = async (kind) => {
    const bookmarks = await getActiveBookmarks();
    if (kind === 'json') downloadJson(bookmarks);
    if (kind === 'csv') downloadCsv(bookmarks);
    if (kind === 'html') downloadHtml(bookmarks);
    const label = kind === 'html' ? 'Chrome HTML' : kind.toUpperCase();
    setExportStatus(`Exported ${bookmarks.length} bookmarks as ${label}.`);
  };

  const onFileChange = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);

    try {
      const parsed = await parseImportFile(file);
      setPending(parsed);

      const existing = await getActiveBookmarks();
      const existingUrls = new Set(existing.map((b) => b.url));
      setPreview({
        newCount: parsed.filter((b) => b.url && !existingUrls.has(b.url)).length,
        dupeCount: parsed.filter((b) => b.url && existingUrls.has(b.url)).length,
      });
    } catch (err) {
      setPending([]);
      setPreview({ error: err.message });
    }
  };

  const onConfirmImport = async () => {
    if (pending.length === 0 || importing) return;
    setImporting(true);

    const existing = await getActiveBookmarks();
    const existingUrls = new Set(existing.map((b) => b.url));
    const toImport = pending.filter((b) => b.url && !existingUrls.has(b.url));
    const db = await initDB();

    for (let i = 0; i < toImport.length; i++) {
      const b = toImport[i];
      await db.put(
        'bookmarks',
        createBookmark({
          url: b.url,
          title: b.title || '',
          description: b.description || '',
          category: b.category || 'Uncategorized',
          subcategory: b.subcategory || '',
          tags: b.tags || [],
          dateAdded: b.dateAdded || new Date().toISOString(),
        })
      );
      const pct = Math.round(((i + 1) / toImport.length) * 100);
      setProgress({ pct, status: `Importing ${i + 1} of ${toImport.length}...` });
    }

    setProgress({ pct: 100, status: `Imported ${toImport.length} bookmarks!` });

    setTimeout(async () => {
      setProgress(null);
      setPreview(null);
      setPending([]);
      setFileName('');
      setImporting(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
      (await vanilla()).loadBookmarks();
    }, 1500);
  };

  return (
    <div
      id="dataPanel"
      className={`${active ? '' : 'hidden '}max-w-5xl mx-auto px-4 sm:px-6 py-5 flex flex-col gap-4`}
    >
      <section className={sectionCls}>
        <h2 className="text-md font-extrabold tracking-tight text-text-base">Export</h2>
        <p className="text-sm text-text-muted mb-3 mt-space-2">
          Export your indexed bookmarks. Choose a format:
        </p>
        <div className="flex gap-2">
          <button id="exportJson" className={primaryBtn} onClick={() => onExport('json')}>JSON</button>
          <button id="exportCsv" className={secondaryBtn} onClick={() => onExport('csv')}>CSV</button>
          <button id="exportHtml" className={secondaryBtn} onClick={() => onExport('html')}>Chrome HTML</button>
        </div>
        <p id="exportStatus" className={`text-sm text-accent-green mt-2 ${exportStatus ? '' : 'hidden'}`}>
          {exportStatus}
        </p>
      </section>

      <section className={sectionCls}>
        <h2 className="text-md font-extrabold tracking-tight text-text-base">Import</h2>
        <p className="text-sm text-text-muted mb-3 mt-space-2">
          Import bookmarks from a file. Supports JSON, CSV, and Chrome HTML format.
        </p>
        <input
          type="file"
          id="importFile"
          ref={fileInputRef}
          accept=".json,.csv,.html"
          className="hidden"
          onChange={onFileChange}
        />
        <div className="flex items-center gap-3 flex-wrap">
          <button id="importBtn" className={primaryBtn} onClick={() => fileInputRef.current?.click()}>
            Choose File
          </button>
          <span id="importFileName" className="text-sm text-text-secondary">{fileName}</span>
        </div>

        <div
          id="importPreview"
          className={`${preview ? '' : 'hidden '}mt-3 p-3 bg-surface-inset text-text-base border-2 border-border-default rounded-sm shadow-clay-inset`}
        >
          <p className="text-sm" id="importPreviewText">
            {preview?.error ? (
              <span className="font-bold text-red-600">Failed to parse file: {preview.error}</span>
            ) : preview ? (
              <>
                <span className="font-bold text-accent-green">{preview.newCount} new</span> bookmarks
                to import, <span className="font-bold text-amber-500">{preview.dupeCount} duplicates</span>{' '}
                will be skipped.
              </>
            ) : null}
          </p>
          <button
            id="importConfirmBtn"
            className={`${primaryBtn} mt-2`}
            disabled={importing}
            onClick={onConfirmImport}
          >
            Confirm Import
          </button>
        </div>

        <div id="importProgress" className={progress ? 'mt-3' : 'hidden'}>
          <div className="w-full bg-surface-inset rounded-xs h-3 border-2 border-border-default shadow-clay-inset">
            <div
              id="importBar"
              className="bg-accent-green h-full rounded-xs transition-all"
              style={{ width: `${progress?.pct ?? 0}%` }}
            ></div>
          </div>
          <p id="importStatus" className="text-sm text-text-secondary mt-1">{progress?.status ?? ''}</p>
        </div>
      </section>
    </div>
  );
}
