import React from 'react';
import { legalConfig } from '../../config/legal';

export function PrivacyPage() {
  return (
    <>
      <h1>Политика обработки персональных данных</h1>
      <p className="text-sm text-slate-500">Версия: {legalConfig.versions.privacy}. Дата: {legalConfig.dates.privacy}</p>
      
      <h2>1. Общие положения</h2>
      <p>
        Настоящая Политика применяется к сервису «{legalConfig.productName}», предоставляемому <strong>{legalConfig.merchantName}</strong>.
      </p>

      <h2>TODO_LEGAL(согласовать с юристом)</h2>
      <p>
        Необходимо перечислить собираемые данные, цели обработки, условия передачи третьим лицам и срок хранения. 
        Указать юридический адрес и контактные данные оператора.
      </p>
    </>
  );
}
