import React from 'react';
import { legalConfig } from '../../config/legal';
import { LegalPagePlaceholder } from './LegalPagePlaceholder';

export function DetailsPage() {
  return (
    <LegalPagePlaceholder title="Реквизиты ИП">
      <h1>Реквизиты ИП</h1>
      <div className="not-prose bg-slate-50 border border-slate-200 rounded-xl p-6 space-y-4">
        <div>
          <span className="text-slate-500 text-sm block mb-1">Наименование:</span>
          <strong className="text-slate-900 block">{legalConfig.merchantName}</strong>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <span className="text-slate-500 text-sm block mb-1">ИНН:</span>
            <strong className="text-slate-900">{legalConfig.inn}</strong>
          </div>
          <div>
            <span className="text-slate-500 text-sm block mb-1">ОГРНИП:</span>
            <strong className="text-slate-900">{legalConfig.ogrnip}</strong>
          </div>
        </div>
        <div>
          <span className="text-slate-500 text-sm block mb-1">Контактный Email:</span>
          <a href={`mailto:${legalConfig.email}`} className="text-primary font-medium">{legalConfig.email}</a>
        </div>
        <div>
          <span className="text-slate-500 text-sm block mb-1">Телефон:</span>
          <strong className="text-slate-900">{legalConfig.phone}</strong>
        </div>
        <div>
          <span className="text-slate-500 text-sm block mb-1">Банковские реквизиты:</span>
          <ul className="space-y-1 text-sm text-slate-700">
            <li>Банк: <strong>{legalConfig.bankDetails.bank}</strong></li>
            <li>БИК: <strong>{legalConfig.bankDetails.bik}</strong></li>
            <li>Р/С: <strong>{legalConfig.bankDetails.account}</strong></li>
            <li>К/С: <strong>{legalConfig.bankDetails.corrAccount}</strong></li>
            <li>ИНН банка: <strong>{legalConfig.bankDetails.bankInn}</strong></li>
          </ul>
        </div>
      </div>
    </LegalPagePlaceholder>
  );
}
