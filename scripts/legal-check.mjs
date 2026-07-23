import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = process.env.LEGAL_CHECK_ROOT || path.resolve(__dirname, '..');
const SEARCH_PATTERN = 'TODO_LEGAL(';
const EXCLUDE_DIRS = ['node_modules', 'dist', 'build', 'coverage', 'playwright-report', 'test-results', '.git', 'docs'];
const ALLOWED_EXTENSIONS = ['.ts', '.tsx', '.js', '.jsx', '.md', '.json', '.yml', '.yaml', '.html'];
const FINAL_ROUTES = ['/offer', '/terms', '/privacy', '/cookies', '/subscription', '/refunds', '/consent', '/legal/details', '/tariff'];
const LEGACY_ROUTES = ['/legal/terms', '/legal/offer', '/legal/privacy', '/legal/cookies', '/legal/subscription', '/legal/refunds', '/legal/consent'];

function isExcluded(relativePath) {
  const parts = relativePath.split(path.sep);
  return parts.some(part => EXCLUDE_DIRS.includes(part)) || /\.(test|spec)\.[cm]?[jt]sx?$/.test(relativePath);
}

function filesIn(dir, root = dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const file = path.join(dir, entry.name);
    const relative = path.relative(root, file);
    if (entry.isDirectory()) return isExcluded(relative) ? [] : filesIn(file, root);
    return entry.isFile() && ALLOWED_EXTENSIONS.some((extension) => file.endsWith(extension)) ? [file] : [];
  });
}

function read(relativePath) {
  const file = path.join(ROOT_DIR, relativePath);
  return fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '';
}

function strictErrors() {
  const errors = [];
  const frontendSource = filesIn(path.join(ROOT_DIR, 'apps/frontend/src')).map(file => fs.readFileSync(file, 'utf8')).join('\n');
  const app = read('apps/frontend/src/App.tsx');
  const legalConfig = read('apps/frontend/src/config/legal.ts');
  const backendLegalConfig = read('apps/backend/src/legal/config.ts');
  const sharedLegalConfig = read('packages/shared/src/legal.ts');
  const auth = read('apps/frontend/src/pages/HostAuth.tsx');
  const footer = read('apps/frontend/src/components/Footer.tsx');
  const cookieBanner = read('apps/frontend/src/components/CookieBanner.tsx');
  const envExample = read('.env.example');

  for (const route of FINAL_ROUTES) if (!app.includes(`path="${route}"`)) errors.push(`Не найден итоговый маршрут ${route}`);
  for (const term of ['LegalTodo', 'LegalDraftNotice', 'черновой редакции']) if (frontendSource.includes(term)) errors.push(`Найден запрещённый черновой элемент: ${term}`);
  for (const route of LEGACY_ROUTES) if (frontendSource.includes(route)) errors.push(`Найдена устаревшая ссылка ${route}`);
  for (const required of ['documentVersion', 'effectiveDate', 'inn:', 'ogrnip:', 'phone:', 'email:']) if (!legalConfig.includes(required)) errors.push(`В frontend legal config отсутствует ${required}`);
  for (const required of ['LEGAL_DOCUMENT_VERSION', '[LegalDocumentType.TERMS]', '[LegalDocumentType.PERSONAL_DATA_CONSENT]']) if (!backendLegalConfig.includes(required)) errors.push(`Не совпадают версии ${required}`);
  if (!/^export const LEGAL_DOCUMENT_VERSION = '1\.0';$/m.test(sharedLegalConfig)) errors.push('Не найдена единая версия пакета 1.0');
  for (const required of ['terms-checkbox', 'personal-data-consent-checkbox', 'termsAccepted', 'personalDataConsentAccepted']) if (!auth.includes(required)) errors.push(`Не найдено регистрационное согласие ${required}`);
  if (!footer.includes('openCookieSettings') || !cookieBanner.includes('Настройки cookie')) errors.push('Не найдены настройки cookie');
  for (const required of ['VITE_YANDEX_METRIKA_ID=', 'PAYMENTS_ENABLED=false', 'REGISTRATION_ENABLED=false']) if (!envExample.includes(required)) errors.push(`В .env.example отсутствует ${required}`);
  return errors;
}

const isStrict = process.argv.includes('--strict');
const todoErrors = [];

for (const file of filesIn(ROOT_DIR)) {
  const relativePath = path.relative(ROOT_DIR, file);
  if (isExcluded(relativePath) || path.basename(file) === 'legal-check.mjs' || relativePath.includes(`${path.sep}fixtures${path.sep}`)) continue;
  fs.readFileSync(file, 'utf8').split('\n').forEach((line, index) => {
    if (line.includes(SEARCH_PATTERN)) todoErrors.push(`${relativePath}:${index + 1}`);
  });
}

console.log('Начинаем проверку юридической готовности (legal check)...');
for (const error of todoErrors) console.error(`[ERROR] Найден ${SEARCH_PATTERN} в файле ${error}`);

if (isStrict) {
  const errors = [...todoErrors.map(error => `Найден ${SEARCH_PATTERN} в файле ${error}`), ...strictErrors()];
  if (errors.length) {
    errors.forEach(error => console.error(`[ERROR] ${error}`));
    console.error('\n[FAIL] Строгая юридическая проверка не пройдена.');
    process.exit(1);
  }
  console.log('\n[SUCCESS] Строгая юридическая проверка пройдена.');
} else if (todoErrors.length) {
  console.warn('\n[WARN] Найдены метки TODO_LEGAL. В не-строгом режиме (без --strict) сборка продолжается.');
} else {
  console.log('\n[SUCCESS] Проверка пройдена. Меток TODO_LEGAL не найдено.');
}
