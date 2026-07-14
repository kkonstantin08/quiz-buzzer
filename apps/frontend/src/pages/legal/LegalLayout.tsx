import React from 'react';
import { Outlet, Link, useLocation } from 'react-router-dom';
import { LegalDraftNotice } from './LegalDraftNotice';
import { Footer } from '../../components/Footer';
import { Target, ArrowLeft } from 'lucide-react';

const LogoIcon = () => (
  <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-red-400 to-red-600 flex items-center justify-center shadow-md shadow-red-500/30">
    <Target className="w-5 h-5 text-white" strokeWidth={2.5} />
  </div>
);

const NAV_LINKS = [
  { path: '/legal/details', label: 'Реквизиты' },
  { path: '/legal/offer', label: 'Публичная оферта' },
  { path: '/legal/terms', label: 'Пользовательское соглашение' },
  { path: '/legal/privacy', label: 'Политика конфиденциальности' },
  { path: '/legal/cookies', label: 'Политика Cookie' },
  { path: '/legal/subscription', label: 'Условия подписки' },
  { path: '/legal/refunds', label: 'Правила возврата' },
];

export function LegalLayout() {
  const location = useLocation();

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col font-sans">
      <LegalDraftNotice />
      
      <header className="sticky top-0 z-40 bg-white/80 backdrop-blur-md border-b border-slate-200">
        <div className="max-w-5xl mx-auto px-4 h-16 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2 group focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary rounded-md">
            <LogoIcon />
            <span className="font-bold text-lg text-slate-800 tracking-tight group-hover:text-primary transition-colors">КвизПульт</span>
          </Link>
        </div>
      </header>

      <div className="flex-1 max-w-5xl mx-auto w-full px-4 py-8 md:py-12 flex flex-col md:flex-row gap-8">
        <aside className="w-full md:w-64 shrink-0">
          <nav className="flex flex-col gap-1 sticky top-24">
            <h2 className="font-semibold text-slate-900 mb-3 px-3 uppercase tracking-wider text-xs">Документы</h2>
            {NAV_LINKS.map(link => {
              const isActive = location.pathname === link.path;
              return (
                <Link
                  key={link.path}
                  to={link.path}
                  className={`px-3 py-2 rounded-lg text-sm transition-colors ${
                    isActive 
                      ? 'bg-primary/10 text-primary font-medium' 
                      : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                  }`}
                >
                  {link.label}
                </Link>
              );
            })}
          </nav>
        </aside>

        <main className="flex-1 bg-white rounded-2xl shadow-sm border border-slate-200 p-6 md:p-10 prose prose-slate max-w-none prose-headings:font-bold prose-h1:text-3xl prose-h2:text-xl prose-a:text-primary hover:prose-a:text-primary/80">
          <Outlet />
        </main>
      </div>

      <Footer />
    </div>
  );
}
