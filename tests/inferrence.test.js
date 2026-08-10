import { inferContentType } from '../core/metadata-extractor/inferrence.js';

describe('Inference Engine', () => {
  test('should infer GitHub Repo', () => {
    const type = inferContentType({ domain: 'github.com' }, 'https://github.com/facebook/react');
    expect(type).toBe('GitHub Repo');
  });

  test('should infer YouTube Video', () => {
    const type = inferContentType({ domain: 'youtube.com' }, 'https://www.youtube.com/watch?v=dQw4w9WgXcQ');
    expect(type).toBe('YouTube Video');
  });

  test('should infer Documentation from url and domain', () => {
    expect(inferContentType({ domain: 'docs.stripe.com' }, 'https://docs.stripe.com/api')).toBe('Documentation');
    expect(inferContentType({ domain: 'react.dev' }, 'https://react.dev/reference/react')).toBe('Documentation');
    expect(inferContentType({ title: 'API Documentation' }, 'https://example.com')).toBe('Documentation');
  });

  test('should infer Blog', () => {
    expect(inferContentType({ domain: 'medium.com' }, 'https://medium.com/engineering')).toBe('Blog');
    expect(inferContentType({ domain: 'example.com' }, 'https://example.com/blog/my-post')).toBe('Blog');
  });

  test('should fallback to Website', () => {
    expect(inferContentType({ domain: 'example.com', title: 'Home' }, 'https://example.com')).toBe('Website');
  });
});
