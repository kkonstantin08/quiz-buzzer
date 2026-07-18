import { describe, expect, it } from 'vitest';
import { resolveAssetUrl } from '../assets';

describe('resolveAssetUrl', () => {
  const development = { development: true, backendOrigin: 'http://localhost:3001/api' };

  it('routes canonical upload URLs to the backend origin in development', () => {
    expect(resolveAssetUrl('/uploads/a.png', development)).toBe('http://localhost:3001/uploads/a.png');
  });

  it('keeps upload URLs same-origin in production', () => {
    expect(resolveAssetUrl('/uploads/a.png', { development: false })).toBe('/uploads/a.png');
  });

  it('leaves empty and absolute URLs unchanged', () => {
    expect(resolveAssetUrl(null, development)).toBeNull();
    expect(resolveAssetUrl('', development)).toBe('');
    expect(resolveAssetUrl('https://cdn.example/a.png', development)).toBe('https://cdn.example/a.png');
    expect(resolveAssetUrl('http://cdn.example/a.png', development)).toBe('http://cdn.example/a.png');
  });

  it('does not add an API prefix to non-upload URLs', () => {
    expect(resolveAssetUrl('/legal/privacy', development)).toBe('/legal/privacy');
  });
});
