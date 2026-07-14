import React from 'react';
import { legalConfig } from '../../config/legal';

export function SubscriptionPage() {
  return (
    <>
      <h1>Условия подписки и рекуррентных платежей</h1>
      <p className="text-sm text-slate-500">Версия: {legalConfig.versions.subscription}. Дата: {legalConfig.dates.subscription}</p>
      
      <h2>1. Общие положения</h2>
      <p>
        Настоящие условия определяют порядок предоставления доступа к сервису по подписке (с регулярным списанием средств).
      </p>

      <h2>TODO_LEGAL(согласовать с юристом)</h2>
      <p>
        Необходимо детально прописать согласие на автоматические списания без участия пользователя, порядок отмены подписки, сроки списания.
      </p>
    </>
  );
}
