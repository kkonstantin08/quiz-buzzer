import React from 'react';
import { ShieldAlert } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';

export function LegalDraftNotice() {
  const isDev = import.meta.env.MODE === 'development';

  if (isDev) {
    return null;
  }

  return (
    <Card className="border-red-200 bg-red-50/50 mb-8 shadow-sm">
      <CardContent className="flex items-start gap-3 p-5">
        <ShieldAlert className="w-6 h-6 text-red-600 shrink-0 mt-0.5" />
        <div className="space-y-1">
          <p className="font-bold text-red-900 text-base">Документ находится в разработке</p>
          <p className="text-sm text-red-700/90 leading-relaxed">
            Представленный текст является черновиком. Приём платежей в данный момент отключён.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
