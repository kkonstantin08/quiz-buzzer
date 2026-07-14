import React from 'react';
import { legalConfig } from '../../config/legal';
import { LegalDraftNotice } from '../../components/LegalDraftNotice';
import { LegalTodo } from '../../components/LegalTodo';

export function SubscriptionPage() {
  return (
    <>
      <LegalDraftNotice />
      <h1>Условия подписки и рекуррентных платежей</h1>
      <p className="text-sm text-slate-500 mb-8">Версия: {legalConfig.versions.subscription}. Дата: {legalConfig.dates.subscription}</p>
      
      <h2>1. Тариф</h2>
      <LegalTodo id="section" description="описать единственный доступный тариф PRO, открывающий безлимитный доступ ко всем функциям комнаты" />

      <h2>2. Стоимость</h2>
      <LegalTodo id="section" description="сослаться на актуальную стоимость, указанную на странице биллинга" />

      <h2>3. Расчётный период</h2>
      <LegalTodo id="section" description="указать точную длительность периода: 30 дней или 1 календарный месяц" />

      <h2>4. Пробный период (Free Trial)</h2>
      <LegalTodo id="section" description="описать условия активации 30-дневного пробного периода без привязки карты, единоразовость триала" />

      <h2>5. Необходимость привязки карты</h2>
      <LegalTodo id="section" description="описать, что для платной подписки требуется токенизация карты через шлюз ЮKassa" />

      <h2>6. Начало платного периода</h2>
      <LegalTodo id="section" description="зафиксировать момент начала подписки: сразу после успешной оплаты первого расчетного периода" />

      <h2>7. Регулярные списания</h2>
      <p><LegalTodo id="todo_7" description="получить явное согласие пользователя на безакцептное (автоматическое" /> списание средств каждый период)</p>

      <h2>8. Уведомление о списании</h2>
      <LegalTodo id="section" description="указать, будут ли отправляться email-предупреждения за X дней до списания" />

      <h2>9. Неуспешное списание</h2>
      <LegalTodo id="section" description="описать процесс ретраев: количество попыток списания при недостатке средств, приостановка подписки" />

      <h2>10. Отключение автопродления</h2>
      <LegalTodo id="section" description="описать пошаговый процесс отмены подписки в настройках личного кабинета" />

      <h2>11. Доступ после отмены</h2>
      <LegalTodo id="section" description="подтвердить сохранение PRO-доступа до конца оплаченного периода при отмене" />

      <h2>12. Изменение цены</h2>
      <LegalTodo id="section" description="описать право платформы менять цену, срок уведомления пользователя, неприменимость к уже оплаченным периодам" />

      <h2>13. Прекращение подписки</h2>
      <LegalTodo id="section" description="указать основания полного прекращения: удаление аккаунта, отмена пользователем, нарушение правил" />
    </>
  );
}
