import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { execSync } from 'child_process';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const FIXTURES_DIR = path.join(__dirname, 'fixtures', 'legal-check');

describe('legal-check.mjs', () => {
  beforeAll(() => {
    if (fs.existsSync(FIXTURES_DIR)) {
      fs.rmSync(FIXTURES_DIR, { recursive: true, force: true });
    }
    fs.mkdirSync(FIXTURES_DIR, { recursive: true });

    // 1. markdown with valid TODO_LEGAL
    fs.writeFileSync(path.join(FIXTURES_DIR, 'test.md'), 'Some text\nTODO_LEGAL(написать текст)\nmore text');
    
    // 2. json with valid TODO_LEGAL
    fs.writeFileSync(path.join(FIXTURES_DIR, 'test.json'), JSON.stringify({ prop: "TODO_LEGAL(заполнить)" }));
    
    // 3. Fake docs/legal-readiness-todo.md
    fs.mkdirSync(path.join(FIXTURES_DIR, 'docs'));
    fs.writeFileSync(path.join(FIXTURES_DIR, 'docs', 'legal-readiness-todo.md'), '- TODO_LEGAL(сделать это)');
    
    // 4. Fake file with TODO_LEGAL WITHOUT parenthesis (should be ignored)
    fs.writeFileSync(path.join(FIXTURES_DIR, 'ignored.ts'), 'const x = "TODO_LEGAL"; // Should not be found');
  });

  afterAll(() => {
    fs.rmSync(FIXTURES_DIR, { recursive: true, force: true });
  });

  it('finds TODO_LEGAL in non-strict mode without failing (exit code 0)', () => {
    const result = execSync(`node ${path.join(__dirname, 'legal-check.mjs')} 2>&1`, {
      env: { ...process.env, LEGAL_CHECK_ROOT: FIXTURES_DIR },
      encoding: 'utf8'
    });
    expect(result).toContain('Найдены метки TODO_LEGAL');
  });

  it('fails in strict mode (exit code 1)', () => {
    let error;
    try {
      execSync(`node ${path.join(__dirname, 'legal-check.mjs')} --strict 2>&1`, {
        env: { ...process.env, LEGAL_CHECK_ROOT: FIXTURES_DIR },
        encoding: 'utf8',
        stdio: 'pipe'
      });
    } catch (e: any) {
      error = e;
    }
    expect(error).toBeDefined();
    expect(error.status).toBe(1);
    
    const output = error.stdout ? error.stdout.toString() : '';
    expect(output).toContain('test.md:2');
    expect(output).toContain('test.json:1');
    expect(output).not.toContain('ignored.ts'); // Should not match TODO_LEGAL without parenthesis
  });

  it('ignores generated files, repository documentation, and test sources', () => {
    const ignoredRoot = path.join(FIXTURES_DIR, 'ignored-only');
    fs.mkdirSync(path.join(ignoredRoot, 'apps/frontend/dist'), { recursive: true });
    fs.mkdirSync(path.join(ignoredRoot, 'docs'), { recursive: true });
    fs.mkdirSync(path.join(ignoredRoot, 'scripts'), { recursive: true });
    fs.writeFileSync(path.join(ignoredRoot, 'apps/frontend/dist/bundle.js'), 'TODO_LEGAL(stale bundle)');
    fs.writeFileSync(path.join(ignoredRoot, 'docs/legal-readiness-todo.md'), 'TODO_LEGAL(documentation)');
    fs.writeFileSync(path.join(ignoredRoot, 'scripts/legal-check.test.ts'), 'TODO_LEGAL(test source)');

    const result = execSync(`node ${path.join(__dirname, 'legal-check.mjs')} --strict`, {
      env: { ...process.env, LEGAL_CHECK_ROOT: ignoredRoot },
      encoding: 'utf8'
    });

    expect(result).toContain('Проверка пройдена');
  });
});
