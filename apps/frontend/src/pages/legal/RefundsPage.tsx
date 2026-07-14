import React from 'react';
import { legalConfig } from '../../config/legal';

export function RefundsPage() {
  return (
    <>
      <h1>Правила возврата денежных средств</h1>
      <p className="text-sm text-slate-500">Версия: {legalConfig.versions.refunds}. Дата: {legalConfig.dates.refunds}</p>
      
      <h2>1. Порядок возврата</h2>
      <p>
        Возврат денежных средств осуществляется в случаях, предусмотренных законодательством РФ и настоящими Правилами.
      </p>

      <h2>TODO_LEGAL(согласовать с юристом)</h2>
      <p>
        Необходимо указать сроки подачи претензии, условия полного или частичного возврата за услуги, а также сроки перечисления средств на карту пользователя.
      </p>
    </>
  );
}
