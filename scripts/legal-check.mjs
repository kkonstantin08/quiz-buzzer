import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = process.env.LEGAL_CHECK_ROOT || path.resolve(__dirname, '..');

const SEARCH_PATTERN = 'TODO_LEGAL(';
const EXCLUDE_DIRS = ['node_modules', 'dist', 'build', 'coverage', 'playwright-report', 'test-results', '.git'];
const EXCLUDE_FILES = ['package-lock.json', 'legal-check.mjs', 'legal-check.test.mjs'];
const ALLOWED_EXTENSIONS = ['.ts', '.tsx', '.js', '.jsx', '.md', '.json', '.yml', '.yaml', '.html'];

let foundTodos = false;

function scanDirectory(dir) {
  if (!fs.existsSync(dir)) return;
  const files = fs.readdirSync(dir);

  for (const file of files) {
    const fullPath = path.join(dir, file);
    const relativePath = path.relative(ROOT_DIR, fullPath);

    if (EXCLUDE_DIRS.some(exclude => relativePath === exclude || relativePath.startsWith(exclude + path.sep))) {
      continue;
    }

    if (EXCLUDE_FILES.includes(file)) {
      continue;
    }

    if (file === 'fixtures' && relativePath.includes('legal-check')) {
       // skip test fixtures for this script itself when scanning the root project
       continue;
    }

    const stat = fs.statSync(fullPath);

    if (stat.isDirectory()) {
      scanDirectory(fullPath);
    } else if (stat.isFile() && ALLOWED_EXTENSIONS.some(ext => fullPath.endsWith(ext))) {
      const content = fs.readFileSync(fullPath, 'utf8');
      const lines = content.split('\n');

      for (let i = 0; i < lines.length; i++) {
        if (lines[i].includes(SEARCH_PATTERN)) {
          console.error(`[ERROR] Найден ${SEARCH_PATTERN} в файле ${relativePath}:${i + 1}`);
          console.error(`        ${lines[i].trim()}`);
          foundTodos = true;
        }
      }
    }
  }
}

console.log('Начинаем проверку юридической готовности (legal check)...');
scanDirectory(ROOT_DIR);

const isStrict = process.argv.includes('--strict');

if (foundTodos) {
  if (isStrict) {
    console.error('\n[FAIL] Проверка не пройдена. В коде остались метки TODO_LEGAL. Приём платежей недопустим.');
    process.exit(1);
  } else {
    console.warn('\n[WARN] Найдены метки TODO_LEGAL. В не-строгом режиме (без --strict) сборка продолжается.');
    process.exit(0);
  }
} else {
  console.log('\n[SUCCESS] Проверка пройдена. Меток TODO_LEGAL не найдено.');
  process.exit(0);
}
