// Bookmark export helpers shared by the Data panel and the Home bulk toolbar.
// Pure functions — callers own any status text/progress UI.

function downloadFile(content, filename, type) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function escapeHtml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function downloadJson(bookmarks) {
  downloadFile(
    JSON.stringify(bookmarks, null, 2),
    'bookmarks-export.json',
    'application/json'
  );
}

export function downloadCsv(bookmarks) {
  const headers = ['title', 'url', 'category', 'subcategory', 'tags', 'description', 'dateAdded'];
  const rows = bookmarks.map((b) =>
    headers
      .map((h) => {
        const v = h === 'tags' ? (b.tags || []).join('; ') : b[h] || '';
        return `"${String(v).replace(/"/g, '""')}"`;
      })
      .join(',')
  );
  downloadFile([headers.join(','), ...rows].join('\n'), 'bookmarks-export.csv', 'text/csv');
}

export function downloadHtml(bookmarks) {
  let html =
    '<!DOCTYPE NETSCAPE-Bookmark-file-1>\n<!-- This is an automatically generated file.\n     It will be read and overwritten.\n     DO NOT EDIT! -->\n<META HTTP-EQUIV="Content-Type" CONTENT="text/html; charset=UTF-8">\n<TITLE>Bookmarks</TITLE>\n<H1>Bookmarks</H1>\n<DL><p>\n';

  const grouped = {};
  bookmarks.forEach((b) => {
    const cat = b.category || 'Uncategorized';
    if (!grouped[cat]) grouped[cat] = [];
    grouped[cat].push(b);
  });

  for (const [cat, items] of Object.entries(grouped)) {
    const ts = Math.floor(Date.now() / 1000);
    html += `    <DT><H3>${escapeHtml(cat)}</H3>\n    <DL><p>\n`;
    items.forEach((b) => {
      const addDate = b.dateAdded
        ? Math.floor(new Date(b.dateAdded).getTime() / 1000)
        : ts;
      html += `        <DT><A HREF="${escapeHtml(b.url)}" ADD_DATE="${addDate}">${escapeHtml(b.title || b.url)}</A>\n`;
      if (b.description) html += `        <DD>${escapeHtml(b.description)}\n`;
    });
    html += '    </DL><p>\n';
  }

  html += '</DL><p>';
  downloadFile(html, 'bookmarks-export.html', 'text/html');
}
