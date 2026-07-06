import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { LandingPage } from './pages/LandingPage';
import { HostAuth } from './pages/HostAuth';
import { HostDashboard } from './pages/HostDashboard';
import { HostSettings } from './pages/HostSettings';
import { HostRoom } from './pages/HostRoom';
import { ParticipantRoom } from './pages/ParticipantRoom';
import { Toaster } from '@/components/ui/sonner';

export default function App() {
  return (
    <BrowserRouter>
      <Toaster position="top-center" />
      <Routes>
        <Route path="/" element={<LandingPage />} />
        <Route path="/room/:roomCode" element={<ParticipantRoom />} />
        <Route path="/login" element={<HostAuth defaultIsLogin={true} />} />
        <Route path="/register" element={<HostAuth defaultIsLogin={false} />} />
        <Route path="/dashboard" element={<HostDashboard />} />
        <Route path="/settings" element={<HostSettings />} />
        <Route path="/host/room/:roomId" element={<HostRoom />} />
      </Routes>
    </BrowserRouter>
  );
}
