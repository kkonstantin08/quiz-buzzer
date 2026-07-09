import React, { Suspense } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { Toaster } from '@/components/ui/sonner';
import { Loader2 } from 'lucide-react';
import { CookieBanner } from './components/CookieBanner';

const LandingPage = React.lazy(() => import('./pages/LandingPage').then(m => ({ default: m.LandingPage })));
const HostAuth = React.lazy(() => import('./pages/HostAuth').then(m => ({ default: m.HostAuth })));
const HostDashboard = React.lazy(() => import('./pages/HostDashboard').then(m => ({ default: m.HostDashboard })));
const HostSettings = React.lazy(() => import('./pages/HostSettings').then(m => ({ default: m.HostSettings })));
const HostRoom = React.lazy(() => import('./pages/HostRoom').then(m => ({ default: m.HostRoom })));
const ParticipantRoom = React.lazy(() => import('./pages/ParticipantRoom').then(m => ({ default: m.ParticipantRoom })));

const PageLoader = () => (
  <div className="min-h-screen flex items-center justify-center bg-slate-50">
    <Loader2 className="w-8 h-8 text-slate-500 animate-spin" />
  </div>
);

export default function App() {
  return (
    <BrowserRouter>
      <Toaster position="top-center" />
      <CookieBanner />
      <Suspense fallback={<PageLoader />}>
        <Routes>
          <Route path="/" element={<LandingPage />} />
          <Route path="/room/:roomCode" element={<ParticipantRoom />} />
          <Route path="/login" element={<HostAuth defaultIsLogin={true} />} />
          <Route path="/register" element={<HostAuth defaultIsLogin={false} />} />
          <Route path="/dashboard" element={<HostDashboard />} />
          <Route path="/settings" element={<HostSettings />} />
          <Route path="/host/room/:roomId" element={<HostRoom />} />
        </Routes>
      </Suspense>
    </BrowserRouter>
  );
}
