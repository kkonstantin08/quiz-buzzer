import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import request from 'supertest';

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'quiz-buzzer-static-'));
const uploadDir = path.join(root, 'uploads');
const filename = `${'a'.repeat(32)}.png`;

process.env.UPLOAD_DIR = uploadDir;

const { app } = require('../server');

describe('public uploads', () => {
  beforeAll(() => {
    fs.mkdirSync(uploadDir, { recursive: true });
    fs.mkdirSync(path.join(uploadDir, '.staging'), { recursive: true });
    fs.writeFileSync(path.join(uploadDir, filename), Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScL9pQAAAABJRU5ErkJggg==', 'base64'));
    fs.writeFileSync(path.join(uploadDir, 'legacy.html'), '<script>alert(1)</script>');
    fs.writeFileSync(path.join(uploadDir, '.staging', 'temporary'), 'untrusted');
  });

  afterAll(() => {
    fs.rmSync(root, { recursive: true, force: true });
  });

  it('serves verified image names with their extension content type and nosniff', async () => {
    const response = await request(app).get(`/uploads/${filename}`);

    expect(response.status).toBe(200);
    expect(response.headers['content-type']).toMatch(/^image\/png/);
    expect(response.headers['x-content-type-options']).toBe('nosniff');
  });

  it('does not expose non-image upload filenames', async () => {
    await request(app).get('/uploads/legacy.html').expect(404);
    await request(app).get('/uploads/.staging/temporary').expect(404);
  });
});
