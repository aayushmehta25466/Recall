/**
 * Lightweight regex-based metadata extraction.
 * Works everywhere — no DOM needed (service workers, Node, browsers).
 *
 * @param {string} html The raw HTML string
 * @param {string} url The URL of the page
 * @returns {Object} Structured metadata
 */
export function extractMetadata(html, url) {
  let domain = '';
  try { domain = new URL(url).hostname; } catch {}

  if (!html) return { title: '', description: '', siteName: domain, domain, language: 'en', author: '', keywords: [] };

  const getMetaContent = (pattern) => {
    const match = html.match(pattern);
    return match ? (match[1] || '').trim() : null;
  };

  const ogTitle = getMetaContent(/<meta\s+property="og:title"\s+content="([^"]+)"/i) ||
    getMetaContent(/<meta\s+content="([^"]+)"\s+property="og:title"/i) || '';
  const twitterTitle = getMetaContent(/<meta\s+name="twitter:title"\s+content="([^"]+)"/i) ||
    getMetaContent(/<meta\s+content="([^"]+)"\s+name="twitter:title"/i) || '';
  const titleTag = getMetaContent(/<title[^>]*>([^<]+)<\/title>/i) || '';

  const ogDesc = getMetaContent(/<meta\s+property="og:description"\s+content="([^"]+)"/i) ||
    getMetaContent(/<meta\s+content="([^"]+)"\s+property="og:description"/i) || '';
  const twitterDesc = getMetaContent(/<meta\s+name="twitter:description"\s+content="([^"]+)"/i) ||
    getMetaContent(/<meta\s+content="([^"]+)"\s+name="twitter:description"/i) || '';
  const descTag = getMetaContent(/<meta\s+name="description"\s+content="([^"]+)"/i) ||
    getMetaContent(/<meta\s+content="([^"]+)"\s+name="description"/i) || '';

  const title = ogTitle || twitterTitle || titleTag;
  const description = ogDesc || twitterDesc || descTag;

  const keywords =
    getMetaContent(/<meta\s+name="keywords"\s+content="([^"]+)"/i) ||
    getMetaContent(/<meta\s+content="([^"]+)"\s+name="keywords"/i) || '';

  const author =
    getMetaContent(/<meta\s+name="author"\s+content="([^"]+)"/i) ||
    getMetaContent(/<meta\s+content="([^"]+)"\s+name="author"/i) || '';

  const siteName =
    getMetaContent(/<meta\s+property="og:site_name"\s+content="([^"]+)"/i) ||
    getMetaContent(/<meta\s+content="([^"]+)"\s+property="og:site_name"/i) || domain;

  const langMatch = html.match(/<html[^>]*lang="([^"]+)"/i);
  const language = langMatch ? langMatch[1].split('-')[0] : 'en';

  const keywordsArray = keywords
    ? keywords.split(',').map(k => k.trim()).filter(Boolean)
    : [];

  return { title, description, siteName, domain, language, author, keywords: keywordsArray };
}
