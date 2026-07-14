import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');

const SEARCH_PATTERN = 'TODO_LEGAL';
const EXCLUDE_DIRS = ['node_modules', 'dist', '.git', 'playwright-report', 'test-results', 'scripts'];
const EXCLUDE_FILES = ['legal-check.mjs', 'legal-readiness-todo.md'];

let foundTodos = false;

function scanDirectory(dir) {
  const files = fs.readdirSync(dir);

  for (const file of files) {
    const fullPath = path.join(dir, file);
    const relativePath = path.relative(ROOT_DIR, fullPath);

    if (EXCLUDE_DIRS.some(exclude => relativePath.startsWith(exclude) || relativePath.includes(`/${exclude}/`))) {
      continue;
    }

    if (EXCLUDE_FILES.includes(file)) {
      continue;
    }

    const stat = fs.statSync(fullPath);

    if (stat.isDirectory()) {
      scanDirectory(fullPath);
    } else if (stat.isFile() && (fullPath.endsWith('.ts') || fullPath.endsWith('.tsx') || fullPath.endsWith('.js') || fullPath.endsWith('.jsx'))) {
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

if (foundTodos) {
  console.error('\n[FAIL] Проверка не пройдена. В коде остались метки TODO_LEGAL. Приём платежей недопустим.');
  process.exit(1);
} else {
  console.log('\n[SUCCESS] Проверка пройдена. Меток TODO_LEGAL не найдено.');
  process.exit(0);
}
