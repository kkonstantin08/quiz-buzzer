import React from 'react';
import { legalConfig } from '../../config/legal';

export function TermsPage() {
  return (
    <>
      <h1>Пользовательское соглашение</h1>
      <p className="text-sm text-slate-500">Версия: {legalConfig.versions.terms}. Дата: {legalConfig.dates.terms}</p>
      
      <h2>1. Общие положения</h2>
      <p>
        Настоящее Пользовательское соглашение регулирует отношения между <strong>{legalConfig.merchantName}</strong> и 
        Пользователем сервиса «{legalConfig.productName}».
      </p>

      <h2>TODO_LEGAL(согласовать с юристом)</h2>
      <p>
        Необходимо добавить полные условия использования, правила поведения, ограничения ответственности и прочее.
      </p>
    </>
  );
}
