import React from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { HostDashboard } from './pages/HostDashboard';
import { HostRoom } from './pages/HostRoom';
import { ParticipantJoin } from './pages/ParticipantJoin';
import { ParticipantRoom } from './pages/ParticipantRoom';

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<ParticipantJoin />} />
        <Route path="/room/:roomCode" element={<ParticipantRoom />} />
        <Route path="/host" element={<HostDashboard />} />
        <Route path="/host/room/:roomId" element={<HostRoom />} />
      </Routes>
    </BrowserRouter>
  );
}
