import { io } from "socket.io-client";

const socket = io("http://localhost:3001");

socket.on("connect", () => {
  console.log("Connected with id:", socket.id);
  
  // Try to create a room first to get a code (but we need a token)
  // Let's just try to join a dummy room
  console.log("Attempting to join room...");
  socket.emit("ROOM_JOIN", { roomCode: "XYZ123", displayName: "TestUser" }, (res) => {
    console.log("ROOM_JOIN response:", res);
    process.exit(0);
  });
});

socket.on("connect_error", (err) => {
  console.error("Connection error:", err);
  process.exit(1);
});

setTimeout(() => {
  console.error("Timeout!");
  process.exit(1);
}, 3000);
