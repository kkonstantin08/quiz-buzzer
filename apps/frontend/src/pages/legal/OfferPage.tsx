import React from 'react';
import { legalConfig } from '../../config/legal';

export function OfferPage() {
  return (
    <>
      <h1>Публичная оферта на оказание услуг</h1>
      <p className="text-sm text-slate-500">Версия: {legalConfig.versions.offer}. Дата: {legalConfig.dates.offer}</p>
      
      <h2>1. Общие положения</h2>
      <p>
        Настоящий документ является публичной офертой <strong>{legalConfig.merchantName}</strong> (далее — Исполнитель) 
        по предоставлению доступа к сервису «{legalConfig.productName}».
      </p>

      <h2>TODO_LEGAL(согласовать с юристом)</h2>
      <p>
        Необходимо добавить полные условия оферты, права и обязанности сторон, стоимость услуг и порядок оплаты.
      </p>
    </>
  );
}
