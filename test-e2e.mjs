import { chromium } from 'playwright';

(async () => {
  const browser = await chromium.launch({ headless: true });
  const hostContext = await browser.newContext();
  const participant1Context = await browser.newContext();
  const participant2Context = await browser.newContext();

  const hostPage = await hostContext.newPage();
  const p1Page = await participant1Context.newPage();
  const p2Page = await participant2Context.newPage();

  console.log("1. Host logs in");
  await hostPage.goto('http://192.168.1.214:5173/host');
  await hostPage.fill('input[type="email"]', 'admin@example.com');
  await hostPage.fill('input[type="password"]', 'admin123');
  await hostPage.click('button[type="submit"]');

  await hostPage.waitForSelector('button:has-text("Создать комнату")');
  console.log("2. Host creates a room");
  await hostPage.click('button:has-text("Создать комнату")');

  await hostPage.waitForSelector('text=Код комнаты');
  const roomCodeElement = await hostPage.$('h1');
  const roomCode = await roomCodeElement.innerText();
  console.log(`Room created with code: ${roomCode}`);

  console.log("3. Participant 1 scans QR (goes to /room/CODE)");
  await p1Page.goto(`http://192.168.1.214:5173/room/${roomCode}`);
  
  await p1Page.waitForSelector('input[placeholder="КОД КОМНАТЫ"]');
  const filledCode = await p1Page.$eval('input[placeholder="КОД КОМНАТЫ"]', el => el.value);
  if (filledCode !== roomCode) {
    throw new Error(`Auto-fill failed. Expected ${roomCode}, got ${filledCode}`);
  }
  console.log("✅ QR Auto-fill successful for P1!");

  await p1Page.fill('input[placeholder="Ваше имя"]', 'Player 1');
  await p1Page.click('button:has-text("Подключиться")');
  await p1Page.waitForSelector('text=Ожидайте старта');

  console.log("4. Participant 2 joins normally");
  await p2Page.goto(`http://192.168.1.214:5173/`);
  await p2Page.fill('input[placeholder="КОД КОМНАТЫ"]', roomCode);
  await p2Page.fill('input[placeholder="Ваше имя"]', 'Player 2');
  await p2Page.click('button:has-text("Подключиться")');
  await p2Page.waitForSelector('text=Ожидайте старта');

  console.log("5. Host starts the round");
  await hostPage.click('button:has-text("СТАРТ РАУНДА")');

  console.log("6. Participants wait for button to become active");
  await p1Page.waitForSelector('button:has-text("ЖМИ!")');
  await p2Page.waitForSelector('button:has-text("ЖМИ!")');

  console.log("7. Participant 2 clicks first");
  await p2Page.click('button:has-text("ЖМИ!")');

  await p2Page.waitForTimeout(500);

  const p2Text = await p2Page.innerText('body');
  if (p2Text.includes('Вы нажали первым')) {
    console.log("✅ Participant 2 successfully saw the GREEN first message!");
  } else {
    console.log("❌ Participant 2 did NOT see the first message.");
  }

  const p1Text = await p1Page.innerText('body');
  if (p1Text.includes('Кто-то успел раньше')) {
    console.log("✅ Participant 1 successfully saw the LOCKED message!");
  } else {
    console.log("❌ Participant 1 did NOT see the locked message.");
  }

  const hostText = await hostPage.innerText('body');
  if (hostText.includes('Нажатие!')) {
    console.log("✅ Host successfully saw the buzz event!");
  }

  await browser.close();
  console.log("E2E Test completed successfully!");
})();
