import { beforeEach, describe, expect, it, vi } from 'vitest';
import { api } from '../api';

describe('image settings API flow', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ soundEnabled: false }),
    }));
  });

  it('keeps image URLs out of the general settings PATCH', async () => {
    await api.updateSettings({
      soundEnabled: false,
      customLogoUrl: '/uploads/other.png',
      customBgUrl: '/uploads/other-bg.png',
    } as any);

    const [, options] = vi.mocked(fetch).mock.calls[0];
    expect(JSON.parse(options!.body as string)).toEqual({ soundEnabled: false });
  });

  it('provides dedicated authenticated delete operations for every owned image', () => {
    expect(typeof (api as any).deleteAvatar).toBe('function');
    expect(typeof (api as any).deleteLogo).toBe('function');
    expect(typeof (api as any).deleteBg).toBe('function');
  });
});
