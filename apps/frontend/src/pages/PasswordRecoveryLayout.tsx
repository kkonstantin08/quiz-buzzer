import React from 'react';
import { Link } from 'react-router-dom';
import { Target } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Footer } from '../components/Footer';

export function PasswordRecoveryLayout({ title, description, children }: { title: string; description: string; children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col bg-slate-50">
      <main id="main-content" tabIndex={-1} className="relative flex flex-1 flex-col items-center justify-center overflow-hidden p-4 focus:outline-none">
        <div className="pointer-events-none absolute inset-0 overflow-hidden">
          <div className="absolute h-[400px] w-[400px] -translate-y-20 translate-x-10 rounded-full bg-blue-200/40 blur-[80px]" />
          <div className="absolute h-[300px] w-[300px] translate-y-20 -translate-x-20 rounded-full bg-red-200/40 blur-[80px]" />
        </div>
        <Link to="/" className="relative z-10 mb-8 flex items-center gap-3 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-red-400 to-red-600 shadow-lg shadow-red-500/30"><Target className="h-6 w-6 text-white" strokeWidth={2.5} /></span>
          <span className="text-3xl font-black tracking-tight text-slate-800">КвизПульт</span>
        </Link>
        <Card className="relative z-10 w-full max-w-md border border-white/60 bg-white/70 shadow-2xl shadow-slate-200/50 backdrop-blur-md">
          <CardHeader className="text-center">
            <CardTitle className="text-2xl font-bold">{title}</CardTitle>
            <CardDescription className="font-medium text-slate-600">{description}</CardDescription>
          </CardHeader>
          <CardContent>{children}</CardContent>
        </Card>
      </main>
      <Footer />
    </div>
  );
}
