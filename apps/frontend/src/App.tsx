import React, { Suspense } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { Toaster } from '@/components/ui/sonner';
import { Loader2 } from 'lucide-react';
import { CookieBanner } from './components/CookieBanner';
import { AriaLiveProvider } from './lib/AriaLiveContext';
import { useFocusOnNavigation } from './lib/useFocusOnNavigation';

const LandingPage = React.lazy(() => import('./pages/LandingPage').then(m => ({ default: m.LandingPage })));
const HostAuth = React.lazy(() => import('./pages/HostAuth').then(m => ({ default: m.HostAuth })));
const HostDashboard = React.lazy(() => import('./pages/HostDashboard').then(m => ({ default: m.HostDashboard })));
const HostSettings = React.lazy(() => import('./pages/HostSettings').then(m => ({ default: m.HostSettings })));
const HostRoom = React.lazy(() => import('./pages/HostRoom').then(m => ({ default: m.HostRoom })));
const ParticipantRoom = React.lazy(() => import('./pages/ParticipantRoom').then(m => ({ default: m.ParticipantRoom })));

const LegalLayout = React.lazy(() => import('./pages/legal/LegalLayout').then(m => ({ default: m.LegalLayout })));
const DetailsPage = React.lazy(() => import('./pages/legal/DetailsPage').then(m => ({ default: m.DetailsPage })));
const OfferPage = React.lazy(() => import('./pages/legal/OfferPage').then(m => ({ default: m.OfferPage })));
const TermsPage = React.lazy(() => import('./pages/legal/TermsPage').then(m => ({ default: m.TermsPage })));
const PrivacyPage = React.lazy(() => import('./pages/legal/PrivacyPage').then(m => ({ default: m.PrivacyPage })));
const CookiesPage = React.lazy(() => import('./pages/legal/CookiesPage').then(m => ({ default: m.CookiesPage })));
const SubscriptionPage = React.lazy(() => import('./pages/legal/SubscriptionPage').then(m => ({ default: m.SubscriptionPage })));
const RefundsPage = React.lazy(() => import('./pages/legal/RefundsPage').then(m => ({ default: m.RefundsPage })));

const PageLoader = () => (
  <div className="min-h-screen flex items-center justify-center bg-slate-50">
    <Loader2 className="w-8 h-8 text-slate-500 animate-spin" />
  </div>
);

function FocusManager() {
  useFocusOnNavigation();
  return null;
}

export default function App() {
  return (
    <AriaLiveProvider>
      <a 
        href="#main-content" 
        className="sr-only focus:not-sr-only focus:absolute focus:z-50 focus:p-4 focus:bg-white focus:text-primary focus:font-bold"
        onClick={(e) => {
          const main = document.getElementById('main-content');
          if (main) {
            e.preventDefault();
            main.focus();
            main.scrollIntoView();
          }
        }}
      >
        Перейти к основному содержимому
      </a>
      <BrowserRouter>
        <FocusManager />
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

            <Route path="/legal" element={<LegalLayout />}>
              <Route path="details" element={<DetailsPage />} />
              <Route path="offer" element={<OfferPage />} />
              <Route path="terms" element={<TermsPage />} />
              <Route path="privacy" element={<PrivacyPage />} />
              <Route path="cookies" element={<CookiesPage />} />
              <Route path="subscription" element={<SubscriptionPage />} />
              <Route path="refunds" element={<RefundsPage />} />
            </Route>
          </Routes>
        </Suspense>
      </BrowserRouter>
    </AriaLiveProvider>
  );
}
