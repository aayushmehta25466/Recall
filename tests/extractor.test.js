import { extractMetadata } from '../core/metadata-extractor/extractor.js';

describe('Metadata Extractor', () => {
  test('should extract basic metadata', () => {
    const html = `
      <html>
        <head>
          <title>Test Page</title>
          <meta name="description" content="This is a test description.">
          <meta name="keywords" content="test, mock, jest">
          <html lang="en-US">
        </head>
      </html>
    `;
    const result = extractMetadata(html, 'https://example.com/test');
    
    expect(result.title).toBe('Test Page');
    expect(result.description).toBe('This is a test description.');
    expect(result.keywords).toEqual(['test', 'mock', 'jest']);
    expect(result.language).toBe('en');
    expect(result.domain).toBe('example.com');
  });

  test('should prefer Open Graph tags over standard tags', () => {
    const html = `
      <html>
        <head>
          <title>Standard Title</title>
          <meta property="og:title" content="Open Graph Title">
          <meta name="description" content="Standard description">
          <meta property="og:description" content="Open Graph description">
        </head>
      </html>
    `;
    const result = extractMetadata(html, 'https://example.com');
    
    expect(result.title).toBe('Open Graph Title');
    expect(result.description).toBe('Open Graph description');
  });
});
