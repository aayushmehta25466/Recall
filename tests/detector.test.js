import { normalizeUrl, isDuplicate } from '../core/duplicate-detector/detector.js';

describe('Duplicate Detector', () => {
  describe('normalizeUrl', () => {
    test('should strip tracking parameters', () => {
      const url = 'https://example.com/page?utm_source=twitter&utm_medium=social&id=123';
      const result = normalizeUrl(url);
      expect(result).toBe('https://example.com/page?id=123');
    });

    test('should remove hash', () => {
      const url = 'https://example.com/page#section';
      expect(normalizeUrl(url)).toBe('https://example.com/page');
    });

    test('should remove trailing slash', () => {
      expect(normalizeUrl('https://example.com/')).toBe('https://example.com');
    });

    test('should lowercase hostname', () => {
      expect(normalizeUrl('https://EXAMPLE.COM/Page')).toBe('https://example.com/Page');
    });

    test('should handle invalid URLs gracefully', () => {
      expect(normalizeUrl('not-a-url')).toBe('not-a-url');
    });

    test('should strip multiple UTM params', () => {
      const url = 'https://example.com/page?utm_source=a&utm_medium=b&utm_campaign=c&utm_term=d&utm_content=e&real=1';
      expect(normalizeUrl(url)).toBe('https://example.com/page?real=1');
    });

    test('should strip fbclid and gclid', () => {
      const url = 'https://example.com/page?fbclid=abc123&gclid=xyz789';
      expect(normalizeUrl(url)).toBe('https://example.com/page');
    });
  });

  describe('isDuplicate', () => {
    const existing = [
      { url: 'https://example.com/page' },
      { url: 'https://other.com/item?utm_source=x' },
    ];

    test('should detect exact duplicates', () => {
      expect(isDuplicate('https://example.com/page', existing)).toBe(true);
    });

    test('should detect normalized duplicates', () => {
      expect(isDuplicate('https://example.com/page?utm_source=y', existing)).toBe(true);
    });

    test('should detect trailing slash duplicates', () => {
      expect(isDuplicate('https://example.com/page/', existing)).toBe(true);
    });

    test('should not flag unique URLs', () => {
      expect(isDuplicate('https://different.com/page', existing)).toBe(false);
    });
  });
});
