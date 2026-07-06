import { io } from "socket.io-client";
import fetch from "node-fetch";

const API_URL = "http://localhost:3001";

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function runTest() {
  console.log("1. Host login...");
  const res = await fetch(`${API_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'admin@example.com', password: 'admin123' })
  });
  const data = await res.json();
  const token = data.token;

  console.log("2. Host connects socket...");
  const hostSocket = io(API_URL, { auth: { token } });
  
  let roomCode = "";
  
  await new Promise(resolve => hostSocket.on('connect', resolve));
  console.log("Host connected!");

  console.log("3. Host creates a room...");
  await new Promise(resolve => {
    hostSocket.emit('ROOM_CREATE', token, (response) => {
      roomCode = response.room.roomCode;
      console.log(`Room created: ${roomCode}`);
      resolve();
    });
  });

  console.log("4. Participant 1 joins...");
  const p1Socket = io(API_URL);
  await new Promise(resolve => p1Socket.on('connect', resolve));
  await new Promise(resolve => {
    p1Socket.emit('ROOM_JOIN', { roomCode, displayName: 'Player 1' }, () => {
      console.log("Player 1 joined.");
      resolve();
    });
  });

  console.log("5. Participant 2 joins...");
  const p2Socket = io(API_URL);
  await new Promise(resolve => p2Socket.on('connect', resolve));
  await new Promise(resolve => {
    p2Socket.emit('ROOM_JOIN', { roomCode, displayName: 'Player 2' }, () => {
      console.log("Player 2 joined.");
      resolve();
    });
  });

  console.log("6. Host starts the round...");
  hostSocket.emit('ROUND_START');
  
  await sleep(100);

  console.log("7. Player 2 buzzes first, then Player 1 buzzes a little bit later...");
  
  const p2Promise = new Promise(resolve => {
    p2Socket.emit('BUZZ_SUBMIT', (res) => {
      resolve(res);
    });
  });

  await sleep(10); // 10ms delay

  const p1Promise = new Promise(resolve => {
    p1Socket.emit('BUZZ_SUBMIT', (res) => {
      resolve(res);
    });
  });

  const p2Res = await p2Promise;
  const p1Res = await p1Promise;

  console.log(`Player 2 buzz result (expected first/success):`, p2Res);
  console.log(`Player 1 buzz result (expected late/fail):`, p1Res);

  if (p2Res.success && !p1Res.success) {
    console.log("✅ TEST PASSED: Only one player got success:true, the other got success:false.");
  } else {
    console.log("❌ TEST FAILED.");
  }

  hostSocket.disconnect();
  p1Socket.disconnect();
  p2Socket.disconnect();
}

runTest().catch(console.error);
