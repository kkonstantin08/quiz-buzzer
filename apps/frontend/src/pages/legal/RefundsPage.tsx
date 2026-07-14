import React from 'react';
import { legalConfig } from '../../config/legal';
import { LegalDraftNotice } from '../../components/LegalDraftNotice';
import { LegalTodo } from '../../components/LegalTodo';

export function RefundsPage() {
  return (
    <>
      <LegalDraftNotice />
      <h1>Политика возвратов</h1>
      <p className="text-sm text-slate-500 mb-8">Версия: {legalConfig.versions.refunds}. Дата: {legalConfig.dates.refunds}</p>
      
      <h2>1. Основания возврата</h2>
      <LegalTodo id="section" description="перечислить законные основания для возврата средств за SaaS, ст. 32 ЗОЗПП или отсутствие применимости ЗОЗПП" />

      <h2>2. Технические сбои</h2>
      <LegalTodo id="section" description="описать процесс возврата, если услуга не была оказана из-за недоступности серверов более X часов" />

      <h2>3. Полный возврат</h2>
      <LegalTodo id="section" description="установить условия полного возврата: например, обращение в первые 24 часа после списания при отсутствии активности" />

      <h2>4. Частичный возврат</h2>
      <LegalTodo id="section" description="определить условия частичного возврата: возможен ли перерасчет пропорционально неиспользованным дням" />

      <h2>5. Порядок обращения</h2>
      <LegalTodo id="section" description="описать, куда Заказчик должен отправить заявление на возврат: email, форма в ЛК" />

      <h2>6. Необходимые данные</h2>
      <LegalTodo id="section" description="перечислить требуемую информацию: логин, дата платежа, маскированная карта, причина" />

      <h2>7. Срок рассмотрения</h2>
      <LegalTodo id="section" description="зафиксировать срок рассмотрения заявления, например, 10 рабочих дней" />

      <h2>8. Срок перечисления</h2>
      <LegalTodo id="section" description="зафиксировать срок зачисления средств на карту пользователя после одобрения, с учетом работы банка-эмитента" />

      <h2>9. Способ возврата</h2>
      <LegalTodo id="section" description="закрепить правило, что возврат производится только на ту же банковскую карту, с которой была оплата" />

      <h2>10. Отказ в возврате</h2>
      <LegalTodo id="section" description="перечислить случаи отказа: блокировка за спам, несогласие с качеством при отсутствии технических проблем" />

      <h2>11. Контакты</h2>
      <LegalTodo id="section" description="указать точный email для запросов на возврат" />
    </>
  );
}
