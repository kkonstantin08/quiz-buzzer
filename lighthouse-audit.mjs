import fs from 'fs';
import puppeteer from 'puppeteer';
import lighthouse from 'lighthouse';
import { startFlow } from 'lighthouse/core/index.js';

const PORT = 4173;
const BASE_URL = `http://localhost:${PORT}`;

async function runAudit() {
  const browser = await puppeteer.launch({ 
    headless: true,
    executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
  });
  const page = await browser.newPage();

  // Run standard page audits
  console.log('Running audit for Landing Page...');
  const landingOptions = {
    logLevel: 'info',
    output: ['html', 'json'],
    port: new URL(browser.wsEndpoint()).port,
  };
  const landingResult = await lighthouse(`${BASE_URL}/`, landingOptions);
  fs.writeFileSync('reports/lighthouse/landing.html', landingResult.report[0]);
  fs.writeFileSync('reports/lighthouse/landing.json', landingResult.report[1]);

  console.log('Running audit for Host Login...');
  const loginResult = await lighthouse(`${BASE_URL}/login`, landingOptions);
  fs.writeFileSync('reports/lighthouse/login.html', loginResult.report[0]);
  fs.writeFileSync('reports/lighthouse/login.json', loginResult.report[1]);

  console.log('Skipping User Flow Audit for now...');
  /*
  const flow = await startFlow(page, {
    name: 'Participant Flow',
    configContext: {
      settingsOverrides: {
        screenEmulation: {
          mobile: true,
          width: 375,
          height: 667,
          deviceScaleFactor: 2,
          disabled: false,
        },
      },
    },
  });

  await flow.navigate(`${BASE_URL}/`, {
    stepName: 'Open Landing Page'
  });

  await flow.startTimespan({ stepName: 'Fill Room Code and Join' });
  await page.waitForSelector('input[placeholder="Код комнаты"]');
  await page.type('input[placeholder="Код комнаты"]', '123456');
  await page.type('input[placeholder="Ваше имя"]', 'TestUser');
  await page.click('button[type="submit"]');
  await page.waitForTimeout(1000); // Wait for navigation or state change
  await flow.endTimespan();

  const flowReport = await flow.generateReport();
  fs.writeFileSync('reports/lighthouse/flow-participant.html', flowReport);

  const flowJson = await flow.createFlowResult();
  fs.writeFileSync('reports/lighthouse/flow-participant.json', JSON.stringify(flowJson));
  */

  await browser.close();
  console.log('All audits completed successfully.');
}

runAudit().catch(err => {
  console.error(err);
  process.exit(1);
});
