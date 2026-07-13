# Socket.IO host session authentication

## Goal

No Socket.IO host operation may be authorized by a valid JWT signature alone. A host JWT is accepted only from the `hostToken` httpOnly cookie and must include `userId` and `sessionId`. The corresponding Session must exist, belong to that user, be unexpired, and be unrevoked.

## Connection authentication

Socket.IO reads only the `hostToken` cookie. A socket without that cookie can connect for participant actions and receives no host identity. A malformed JWT or an invalid, expired, foreign, missing, or revoked Session in a present cookie rejects the connection without exposing the cookie or JWT value in logs.

After successful verification the middleware stores both `socket.data.userId` and `socket.data.sessionId`. It does not assign a host role; room creation or authenticated rejoin assigns that role.

## Host authorization

A single central guard authorizes each host operation. It verifies the socket has `userId` and `sessionId`, revalidates the Session record, and then checks the host role, room owner, and controlling socket (`room.hostSocketId === socket.id`) where a room is involved. The guard is used by `ROOM_CREATE`, `HOST_REJOIN_ROOM`, `ROUND_START`, `ROUND_RESET`, `HOST_CLEAR_SCORES`, and `ROOM_FINISH`.

This keeps logout behavior intact: logout revokes the current Session and disconnects sockets with that `sessionId`; a later connection using its old cookie is rejected. Revalidation also prevents an already-connected socket from acting after a Session was revoked by another server-side path.

## Contract and frontend

`ROOM_CREATE` is callback-only: `socket.emit('ROOM_CREATE', callback)`. The shared token payload/schema and the backend fallback that verifies a payload JWT are removed. The frontend keeps its existing `withCredentials: true` Socket.IO connection and never reads or sends the host JWT directly.

## Tests

Integration tests use real Socket.IO lifecycle with temporary/mocked Session storage to verify:

- a valid JWT and active matching Session authorizes the host;
- missing `sessionId`, missing Session, foreign Session, expired Session, revoked Session, and invalid JWT do not authorize host actions;
- a socket without a host cookie can join as a participant but cannot create or control a room;
- valid host sessions can create and rejoin their own rooms, while host commands require the current controlling socket;
- legacy `ROOM_CREATE(token, callback)` cannot create a room;
- logout disconnects its Session, rejects later reconnect, and does not affect a different active Session for the same user.

Contract and frontend tests are updated to the callback-only `ROOM_CREATE` signature.

## Scope

The change does not alter participant reconnect, buzzer timing, room lifecycle, scoring, serialization, uploads, subscriptions, or visual design.
