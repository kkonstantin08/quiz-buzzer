/// <reference types="node" />

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const manifest = JSON.parse(readFileSync(resolve(process.cwd(), 'public/manifest.webmanifest'), 'utf8'));

describe('PWA manifest', () => {
  it('uses the current product brand and description', () => {
    expect(manifest).toMatchObject({
      name: 'КвизПульт',
      short_name: 'КвизПульт',
      description: 'Сервис для проведения викторин с игровыми пультами',
    });
  });
});
