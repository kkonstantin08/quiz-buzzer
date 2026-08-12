import { ArrowLeft, Target } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { useDocumentMetadata } from '../lib/useDocumentMetadata';

export function NotFound() {
  useDocumentMetadata('Страница не найдена | КвизПульт', 'Запрошенная страница не найдена.');

  return (
    <main id="main-content" tabIndex={-1} className="flex min-h-[100dvh] items-center justify-center bg-slate-50 p-6 text-center">
      <div className="w-full max-w-lg rounded-3xl border border-slate-200 bg-white p-8 shadow-xl shadow-slate-200/60 sm:p-12">
        <span className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-red-100 text-red-700" aria-hidden="true">
          <Target className="h-9 w-9" />
        </span>
        <p className="mt-6 text-sm font-black tracking-[0.25em] text-red-700">404</p>
        <h1 className="mt-2 text-3xl font-black tracking-tight text-slate-900 sm:text-4xl">Страница не найдена</h1>
        <p className="mt-4 text-slate-600">Возможно, адрес изменился или в ссылке есть ошибка.</p>
        <Button asChild size="lg" className="mt-8 min-h-11 bg-slate-900 text-white hover:bg-slate-800">
          <Link to="/">
            <ArrowLeft aria-hidden="true" />
            На главную
          </Link>
        </Button>
      </div>
    </main>
  );
}
