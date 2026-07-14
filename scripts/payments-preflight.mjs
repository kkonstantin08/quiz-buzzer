import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';
import dotenv from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');

// Load environment variables for the preflight check
dotenv.config({ path: path.join(ROOT_DIR, 'apps/backend/.env') });

async function runPreflight() {
  console.log('Начинаем проверку готовности платежной системы (payments preflight)...');
  
  // 1. Сначала запускаем legal:check:strict
  try {
    console.log('1. Проверка юридических документов...');
    execSync('npm run legal:check:strict', { stdio: 'inherit', cwd: ROOT_DIR });
  } catch (error) {
    console.error('\n[FAIL] Preflight не пройден: остались метки TODO_LEGAL. Убедитесь, что все юридические документы заполнены.');
    process.exit(1);
  }

  // 2. Компилируем модуль readiness и импортируем его
  const tempDir = path.join(__dirname, '.temp-preflight');
  if (!fs.existsSync(tempDir)) {
    fs.mkdirSync(tempDir);
  }

  try {
    const readinessTs = path.join(ROOT_DIR, 'apps/backend/src/billing/readiness.ts');
    execSync(`npx tsc ${readinessTs} --outDir ${tempDir} --target esnext --module nodenext`, { stdio: 'ignore' });
    
    const readinessModule = await import(path.join(tempDir, 'readiness.js'));
    const readiness = readinessModule.checkBillingReadiness(process.env);
    
    if (!readiness.ready) {
      console.error('\n[FAIL] Preflight не пройден. Интеграция с платежным провайдером не завершена:');
      readiness.reasons.forEach(reason => console.error(` - ${reason}`));
      process.exit(1);
    }
  } catch (err) {
    console.error('\n[ERROR] Внутренняя ошибка при проверке readiness:', err);
    process.exit(1);
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }

  console.log('\n[SUCCESS] Payments preflight успешно пройден!');
}

runPreflight();
