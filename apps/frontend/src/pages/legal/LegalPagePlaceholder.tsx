import React from 'react';

interface Props {
  title: string;
  children: React.ReactNode;
}

export function LegalPagePlaceholder({ title, children }: Props) {
  if (import.meta.env.PROD) {
    return (
      <>
        <h1>{title}</h1>
        <div className="bg-slate-50 border border-slate-200 rounded-lg p-6 my-8 text-center text-slate-600">
          <p>Документ находится в подготовке. Приём платежей отключён.</p>
        </div>
      </>
    );
  }

  return <>{children}</>;
}
