import type { RoomCreateResult } from 'shared';
import { socket } from './socket';

export function emitRoomCreateWhenConnected(
  onResult: (result: RoomCreateResult) => void,
  onConnectionError: (error: Error) => void,
) {
  let emitted = false;
  const emitRoomCreate = () => {
    if (emitted) return;
    emitted = true;
    socket.off('connect_error', onConnectError);
    socket.emit('ROOM_CREATE', onResult);
  };
  const onConnectError = (error: Error) => {
    socket.off('connect', emitRoomCreate);
    onConnectionError(error);
  };

  if (socket.connected) {
    emitRoomCreate();
    return;
  }

  socket.once('connect', emitRoomCreate);
  socket.once('connect_error', onConnectError);
  socket.connect();
}
