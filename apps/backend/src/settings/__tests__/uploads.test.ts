import express from 'express';
import request from 'supertest';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { config } from '../../config';
import { deleteUploadedFile } from '../../utils/upload';

const mockUsers = new Map<string, { id: string; avatarUrl: string | null }>();
const mockSettings = new Map<string, { hostUserId: string; customLogoUrl: string | null; customBgUrl: string | null; soundEnabled: boolean; soundTheme: string; bgTheme: string }>();
let failNextUserUpdate = false;
let failNextSettingsUpdate = false;

jest.mock('../../prisma', () => ({
  prisma: {
    hostUser: {
      findUnique: jest.fn(({ where: { id } }) => Promise.resolve(mockUsers.get(id) ?? null)),
      update: jest.fn(({ where: { id }, data }) => {
        if (failNextUserUpdate) {
          failNextUserUpdate = false;
          return Promise.reject(new Error('database unavailable'));
        }
        const user = mockUsers.get(id)!;
        const updated = { ...user, ...data };
        mockUsers.set(id, updated);
        return Promise.resolve(updated);
      }),
    },
    hostSettings: {
      findUnique: jest.fn(({ where: { hostUserId } }) => Promise.resolve(mockSettings.get(hostUserId) ?? null)),
      create: jest.fn(({ data }) => {
        const settings = {
          hostUserId: data.hostUserId,
          customLogoUrl: data.customLogoUrl ?? null,
          customBgUrl: data.customBgUrl ?? null,
          soundEnabled: data.soundEnabled ?? true,
          soundTheme: data.soundTheme ?? 'classic',
          bgTheme: data.bgTheme ?? 'light',
        };
        mockSettings.set(data.hostUserId, settings);
        return Promise.resolve(settings);
      }),
      update: jest.fn(({ where: { hostUserId }, data }) => {
        if (failNextSettingsUpdate) {
          failNextSettingsUpdate = false;
          return Promise.reject(new Error('database unavailable'));
        }
        const settings = { ...mockSettings.get(hostUserId)!, ...data };
        mockSettings.set(hostUserId, settings);
        return Promise.resolve(settings);
      }),
    },
  },
}));

jest.mock('../../auth/middleware', () => ({
  requireAuth: (req: express.Request, _res: express.Response, next: express.NextFunction) => {
    (req as express.Request & { userId: string }).userId = req.get('x-user-id') || 'owner';
    next();
  },
}));

import { authRouter } from '../../auth';
import { settingsRouter } from '..';

const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScL9pQAAAABJRU5ErkJggg==', 'base64');
const jpeg = Buffer.from('/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////2wBDAf//////////////////////////////////////////////////////////////////////////////////////wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAf/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIQAxAAAAH/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/9oACAEBAAEFAqf/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oACAEDAQE/Aaf/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oACAECAQE/Aaf/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/9oACAEBAAY/Aqf/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/9oACAEBAAE/IV//2gAMAwEAAgADAAAAEP/EABQRAQAAAAAAAAAAAAAAAAAAABD/2gAIAQMBAT8QH//EABQRAQAAAAAAAAAAAAAAAAAAABD/2gAIAQIBAT8QH//EABQQAQAAAAAAAAAAAAAAAAAAABD/2gAIAQEAAT8QH//Z', 'base64');

describe('secure image uploads', () => {
  const app = express();
  let root: string;
  let uploadDir: string;
  let stagingDir: string;

  app.use(express.json());
  app.use('/auth', authRouter);
  app.use('/settings', settingsRouter);

  async function files(directory: string) {
    try {
      return await fs.readdir(directory);
    } catch {
      return [];
    }
  }

  async function writePublic(name: string) {
    await fs.writeFile(path.join(uploadDir, name), png);
    return `/uploads/${name}`;
  }

  beforeEach(async () => {
    root = await fs.mkdtemp(path.join(os.tmpdir(), 'quiz-buzzer-upload-'));
    uploadDir = path.join(root, 'public');
    stagingDir = path.join(root, '.upload-tmp');
    config.uploadDir = uploadDir;
    await fs.mkdir(uploadDir, { recursive: true });
    mockUsers.clear();
    mockSettings.clear();
    mockUsers.set('owner', { id: 'owner', avatarUrl: null });
    mockUsers.set('other', { id: 'other', avatarUrl: null });
    failNextUserUpdate = false;
    failNextSettingsUpdate = false;
  });

  afterEach(async () => {
    await fs.rm(root, { recursive: true, force: true });
  });

  it.each([
    ['avatar', '/auth/avatar', 'avatar', 'avatarUrl'],
    ['logo', '/settings/upload-logo', 'logo', 'customLogoUrl'],
    ['background', '/settings/upload-bg', 'background', 'customBgUrl'],
  ])('stores a real PNG for %s under its detected extension despite a misleading filename and MIME', async (_kind, endpoint, field, property) => {
    const response = await request(app)
      .post(endpoint)
      .set('x-user-id', 'owner')
      .attach(field, png, { filename: 'image.html', contentType: 'text/html' });

    expect(response.status).toBe(200);
    const url = response.body[property];
    expect(url).toMatch(/^\/uploads\/[a-f0-9]{32}\.png$/);
    expect(await files(uploadDir)).toEqual([path.basename(url)]);
    expect(await files(stagingDir)).toEqual([]);
  });

  it('derives JPEG extension from content instead of the submitted PNG filename', async () => {
    const response = await request(app)
      .post('/settings/upload-logo')
      .set('x-user-id', 'owner')
      .attach('logo', jpeg, { filename: 'renamed.png', contentType: 'image/png' });

    expect(response.status).toBe(200);
    expect(response.body.customLogoUrl).toMatch(/^\/uploads\/[a-f0-9]{32}\.jpg$/);
  });

  it.each([
    ['spoofed multipart MIME', Buffer.from('<html>not an image</html>'), 'image/png'],
    ['SVG', Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>'), 'image/png'],
    ['HTML', Buffer.from('<html>not an image</html>'), 'image/jpeg'],
    ['random bytes', Buffer.from([1, 2, 3, 4]), 'image/webp'],
  ])('rejects %s without leaving public or staged files', async (_name, body, contentType) => {
    const response = await request(app)
      .post('/settings/upload-logo')
      .set('x-user-id', 'owner')
      .attach('logo', body, { filename: 'claimed-image.png', contentType });

    expect(response.status).toBe(400);
    expect(await files(uploadDir)).toEqual([]);
    expect(await files(stagingDir)).toEqual([]);
  });

  it('rejects files over 5 MB without leaving public or staged files', async () => {
    const response = await request(app)
      .post('/settings/upload-bg')
      .set('x-user-id', 'owner')
      .attach('background', Buffer.alloc(5 * 1024 * 1024 + 1), { filename: 'large.png', contentType: 'image/png' });

    expect(response.status).toBe(400);
    expect(await files(uploadDir)).toEqual([]);
    expect(await files(stagingDir)).toEqual([]);
  });

  it('ignores arbitrary image URLs in the shared settings PATCH', async () => {
    mockSettings.set('owner', {
      hostUserId: 'owner', customLogoUrl: null, customBgUrl: null, soundEnabled: true, soundTheme: 'classic', bgTheme: 'light',
    });

    const response = await request(app)
      .patch('/settings')
      .set('x-user-id', 'owner')
      .send({ customLogoUrl: '/uploads/other.png', customBgUrl: '/uploads/other-bg.png', soundEnabled: false });

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ customLogoUrl: null, customBgUrl: null, soundEnabled: false });
  });

  it('replaces only the current user logo and retains another user file', async () => {
    const previous = await writePublic('a'.repeat(32) + '.png');
    const other = await writePublic('b'.repeat(32) + '.png');
    mockSettings.set('owner', {
      hostUserId: 'owner', customLogoUrl: previous, customBgUrl: null, soundEnabled: true, soundTheme: 'classic', bgTheme: 'light',
    });
    mockSettings.set('other', {
      hostUserId: 'other', customLogoUrl: other, customBgUrl: null, soundEnabled: true, soundTheme: 'classic', bgTheme: 'light',
    });

    const response = await request(app)
      .post('/settings/upload-logo')
      .set('x-user-id', 'owner')
      .attach('logo', png, { filename: 'new.png', contentType: 'image/png' });

    expect(response.status).toBe(200);
    expect(await fs.stat(path.join(uploadDir, path.basename(other)))).toBeDefined();
    await expect(fs.stat(path.join(uploadDir, path.basename(previous)))).rejects.toThrow();
    expect(mockSettings.get('owner')!.customLogoUrl).toBe(response.body.customLogoUrl);
  });

  it('replaces a background without touching another user image', async () => {
    const previous = await writePublic('c'.repeat(32) + '.png');
    const other = await writePublic('d'.repeat(32) + '.png');
    mockSettings.set('owner', {
      hostUserId: 'owner', customLogoUrl: null, customBgUrl: previous, soundEnabled: true, soundTheme: 'classic', bgTheme: 'light',
    });
    mockSettings.set('other', {
      hostUserId: 'other', customLogoUrl: null, customBgUrl: other, soundEnabled: true, soundTheme: 'classic', bgTheme: 'light',
    });

    const response = await request(app)
      .post('/settings/upload-bg')
      .set('x-user-id', 'owner')
      .attach('background', png, { filename: 'new.png', contentType: 'image/png' });

    expect(response.status).toBe(200);
    expect(await fs.stat(path.join(uploadDir, path.basename(other)))).toBeDefined();
    await expect(fs.stat(path.join(uploadDir, path.basename(previous)))).rejects.toThrow();
  });

  it.each([
    ['avatar', '/auth/avatar', '/auth/avatar', 'avatarUrl'],
    ['logo', '/settings/upload-logo', '/settings/logo', 'customLogoUrl'],
    ['background', '/settings/upload-bg', '/settings/background', 'customBgUrl'],
  ])('deletes %s only from the authenticated user and is idempotent', async (_kind, uploadEndpoint, deleteEndpoint, property) => {
    const upload = await request(app)
      .post(uploadEndpoint)
      .set('x-user-id', 'owner')
      .attach(_kind === 'background' ? 'background' : _kind, png, { filename: 'owned.png', contentType: 'image/png' });
    const ownerUrl = upload.body[property];
    const otherUrl = await writePublic('e'.repeat(32) + '.png');
    if (_kind === 'avatar') mockUsers.set('other', { id: 'other', avatarUrl: otherUrl });
    else mockSettings.set('other', {
      hostUserId: 'other',
      customLogoUrl: _kind === 'logo' ? otherUrl : null,
      customBgUrl: _kind === 'background' ? otherUrl : null,
      soundEnabled: true, soundTheme: 'classic', bgTheme: 'light',
    });

    await request(app).delete(deleteEndpoint).set('x-user-id', 'owner').expect(200);
    await request(app).delete(deleteEndpoint).set('x-user-id', 'owner').expect(200);

    await expect(fs.stat(path.join(uploadDir, path.basename(ownerUrl)))).rejects.toThrow();
    expect(await fs.stat(path.join(uploadDir, path.basename(otherUrl)))).toBeDefined();
  });

  it('removes the new avatar and keeps the old one when database persistence fails', async () => {
    const previous = await writePublic('f'.repeat(32) + '.png');
    mockUsers.set('owner', { id: 'owner', avatarUrl: previous });
    failNextUserUpdate = true;

    await request(app)
      .post('/auth/avatar')
      .set('x-user-id', 'owner')
      .attach('avatar', png, { filename: 'new.png', contentType: 'image/png' })
      .expect(500);

    expect(await files(uploadDir)).toEqual([path.basename(previous)]);
    expect(mockUsers.get('owner')!.avatarUrl).toBe(previous);
    expect(await files(stagingDir)).toEqual([]);
  });

  it('keeps database and previous logo unchanged when public persistence fails', async () => {
    const previous = await writePublic('1'.repeat(32) + '.png');
    mockSettings.set('owner', {
      hostUserId: 'owner', customLogoUrl: previous, customBgUrl: null, soundEnabled: true, soundTheme: 'classic', bgTheme: 'light',
    });
    await fs.rm(uploadDir, { recursive: true, force: true });
    await fs.writeFile(uploadDir, 'not a directory');

    await request(app)
      .post('/settings/upload-logo')
      .set('x-user-id', 'owner')
      .attach('logo', png, { filename: 'new.png', contentType: 'image/png' })
      .expect(500);

    expect(mockSettings.get('owner')!.customLogoUrl).toBe(previous);
    expect(await files(stagingDir)).toEqual([]);
  });

  it('rejects external, nested, and traversal URLs while deleting only a direct internal upload URL', async () => {
    const owned = await writePublic('2'.repeat(32) + '.png');
    const outside = path.join(root, 'outside.png');
    await fs.writeFile(outside, png);

    await expect(deleteUploadedFile('https://example.test/uploads/outside.png')).resolves.toBe(false);
    await expect(deleteUploadedFile('/uploads/../outside.png')).resolves.toBe(false);
    await expect(deleteUploadedFile('/uploads/nested/file.png')).resolves.toBe(false);
    expect(await fs.stat(outside)).toBeDefined();

    await expect(deleteUploadedFile(owned)).resolves.toBe(true);
    await expect(deleteUploadedFile(owned)).resolves.toBe(false);
  });

  it('keeps a successful logo replacement response when old-file deletion fails', async () => {
    const previous = await writePublic('3'.repeat(32) + '.png');
    mockSettings.set('owner', {
      hostUserId: 'owner', customLogoUrl: previous, customBgUrl: null, soundEnabled: true, soundTheme: 'classic', bgTheme: 'light',
    });
    const unlink = jest.spyOn(fs, 'unlink').mockRejectedValueOnce(Object.assign(new Error('disk busy'), { code: 'EBUSY' }));
    const log = jest.spyOn(console, 'error').mockImplementation(() => undefined);

    const response = await request(app)
      .post('/settings/upload-logo')
      .set('x-user-id', 'owner')
      .attach('logo', png, { filename: 'new.png', contentType: 'image/png' });

    expect(response.status).toBe(200);
    expect(mockSettings.get('owner')!.customLogoUrl).toBe(response.body.customLogoUrl);
    expect(await fs.stat(path.join(uploadDir, path.basename(previous)))).toBeDefined();
    unlink.mockRestore();
    log.mockRestore();
  });
});
