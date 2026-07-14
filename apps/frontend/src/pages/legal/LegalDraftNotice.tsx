import React from 'react';
import { AlertTriangle } from 'lucide-react';
import { legalConfig } from '../../config/legal';

export function LegalDraftNotice() {
  const isDraft = Object.values(legalConfig.dates).some(date => date.includes('TODO_LEGAL'));

  if (!isDraft) return null;

  return (
    <div className="bg-amber-50 border-b border-amber-200 p-3 sm:p-4 text-amber-800 flex items-start gap-3 justify-center z-50 relative">
      <AlertTriangle className="shrink-0 text-amber-500 mt-0.5" size={20} />
      <div className="text-sm">
        <strong className="font-semibold block mb-0.5">Документы находятся в разработке (черновик)</strong>
        Монетизация и оплата отключены до момента утверждения текстов и внесения реквизитов ИП.
      </div>
    </div>
  );
}
