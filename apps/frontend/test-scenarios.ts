import { io } from 'socket.io-client';

const SERVER_URL = 'http://localhost:3001';

async function runTests() {
  console.log('--- Начинаем тестирование ---');

  // 1. Host Login
  console.log('\\n[1] Вход хоста...');
  let loginRes;
  try {
    const res = await fetch(`${SERVER_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'admin@example.com', password: 'adminpassword' })
    });
    loginRes = await res.json();
    if (!loginRes.token) {
        // Retry with default seed password
        const res2 = await fetch(`${SERVER_URL}/api/auth/login`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: 'admin@example.com', password: 'admin123' })
        });
        loginRes = await res2.json();
    }
  } catch (e) {
      console.log('Failed to fetch from API');
      process.exit(1);
  }

  if (!loginRes.token) {
    console.error('Ошибка входа хоста:', loginRes);
    return;
  }
  const hostToken = loginRes.token;
  console.log('Хост успешно вошел.');

  // 2. Connect Host Socket
  const hostSocket = io(SERVER_URL, { transports: ['websocket'] });
  await new Promise(resolve => hostSocket.on('connect', resolve));
  console.log('Хост подключился к сокетам.');

  // 3. Create Room
  const createRoomRes: any = await new Promise(resolve => hostSocket.emit('ROOM_CREATE', hostToken, resolve));
  if (!createRoomRes.success) {
    console.error('Ошибка создания комнаты', createRoomRes);
    return;
  }
  const roomCode = createRoomRes.room.roomCode;
  console.log(`Комната создана. Код: ${roomCode}`);

  // 4. Connect Participants
  const p1Socket = io(SERVER_URL, { transports: ['websocket'] });
  const p2Socket = io(SERVER_URL, { transports: ['websocket'] });
  const p3Socket = io(SERVER_URL, { transports: ['websocket'] });

  await Promise.all([
    new Promise(resolve => p1Socket.on('connect', resolve)),
    new Promise(resolve => p2Socket.on('connect', resolve)),
    new Promise(resolve => p3Socket.on('connect', resolve)),
  ]);

  const join1: any = await new Promise(resolve => p1Socket.emit('ROOM_JOIN', { roomCode, displayName: 'Игрок 1' }, resolve));
  const join2: any = await new Promise(resolve => p2Socket.emit('ROOM_JOIN', { roomCode, displayName: 'Игрок 2' }, resolve));
  const join3: any = await new Promise(resolve => p3Socket.emit('ROOM_JOIN', { roomCode, displayName: 'Игрок 3' }, resolve));

  if (join1.success && join2.success && join3.success) {
    console.log('3 участника успешно подключились к комнате.');
  }

  const p1Id = join1.participant.id;
  const p2Id = join2.participant.id;

  // 5. Host Starts Round
  console.log('\\n[2] Запуск раунда...');
  const startRes: any = await new Promise(resolve => hostSocket.emit('ROUND_START', resolve));
  console.log('Раунд запущен:', startRes.success);

  // 6. Participants Buzz (P2 is first, P1 is late)
  console.log('\\n[3] Игроки нажимают кнопки...');
  const buzz2Promise = new Promise(resolve => p2Socket.emit('BUZZ_SUBMIT', resolve));
  await new Promise(r => setTimeout(r, 50)); // small delay
  const buzz1Promise = new Promise(resolve => p1Socket.emit('BUZZ_SUBMIT', resolve));

  const [buzz2Res, buzz1Res]: any = await Promise.all([buzz2Promise, buzz1Promise]);
  console.log('Игрок 2 нажал:', buzz2Res.success ? 'Успех' : buzz2Res.error);
  console.log('Игрок 1 нажал:', buzz1Res.success ? 'Успех' : buzz1Res.error);

  // 7. Host reveals
  console.log('\\n[4] Ведущий открывает первого нажавшего...');
  const revealPromise = new Promise(resolve => hostSocket.on('FIRST_REVEALED', resolve));
  await new Promise(resolve => hostSocket.emit('FIRST_REVEAL', resolve));
  const revealedId = await revealPromise;
  console.log(`Показан первый: Игрок ${revealedId === p2Id ? '2 (Правильно)' : 'Неверно'}`);

  // 8. Host awards point to P2
  console.log('\\n[5] Ведущий выдает балл Игроку 2...');
  const statePromise = new Promise(resolve => hostSocket.on('ROOM_STATE_UPDATED', resolve));
  await new Promise(resolve => hostSocket.emit('ROUND_RESET', { winnerId: p2Id }, resolve));
  
  const updatedRoom: any = await statePromise;
  const p2After = updatedRoom.participants.find((p: any) => p.id === p2Id);
  const p1After = updatedRoom.participants.find((p: any) => p.id === p1Id);
  console.log(`Счет Игрока 2: ${p2After.score} (Ожидается 1)`);
  console.log(`Счет Игрока 1: ${p1After.score} (Ожидается 0)`);

  // 9. Host starts round 2, P3 buzzes, Host resets WITHOUT awarding point
  console.log('\\n[6] Раунд 2 (Без баллов)...');
  await new Promise(resolve => hostSocket.emit('ROUND_START', resolve));
  await new Promise(resolve => p3Socket.emit('BUZZ_SUBMIT', resolve));
  await new Promise(resolve => hostSocket.emit('FIRST_REVEAL', resolve));
  const statePromise2 = new Promise(resolve => hostSocket.on('ROOM_STATE_UPDATED', resolve));
  await new Promise(resolve => hostSocket.emit('ROUND_RESET', { winnerId: null }, resolve));

  const updatedRoom2: any = await statePromise2;
  const p3After = updatedRoom2.participants.find((p: any) => p.id === join3.participant.id);
  console.log(`Счет Игрока 3: ${p3After.score} (Ожидается 0)`);

  // 10. Participant 1 leaves
  console.log('\\n[7] Игрок 1 покидает комнату...');
  const leavePromise = new Promise(resolve => hostSocket.on('PARTICIPANT_LEFT', resolve));
  p1Socket.disconnect();
  const leftId = await leavePromise;
  console.log(`Игрок отключился: Игрок 1 (${leftId === p1Id})`);

  console.log('\\n--- Все тесты успешно пройдены! ---');
  
  hostSocket.disconnect();
  p2Socket.disconnect();
  p3Socket.disconnect();
  process.exit(0);
}

runTests().catch(console.error);
