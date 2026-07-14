import React from 'react';
import { legalConfig } from '../../config/legal';
import { LegalDraftNotice } from '../../components/LegalDraftNotice';
import { LegalTodo } from '../../components/LegalTodo';

export function PrivacyPage() {
  return (
    <>
      <LegalDraftNotice />
      <h1>Политика конфиденциальности</h1>
      <p className="text-sm text-slate-500 mb-8">Версия: {legalConfig.versions.privacy}. Дата: {legalConfig.dates.privacy}</p>
      
      <h2>1. Сведения об операторе</h2>
      <LegalTodo id="section" description="вписать ФИО ИП, ИНН, ОГРНИП, адрес регистрации, статус оператора ПДн" />

      <h2>2. Категории субъектов</h2>
      <LegalTodo id="section" description="определить субъектов: посетители сайта, зарегистрированные Ведущие, неавторизованные Участники" />

      <h2>3. Данные ведущих</h2>
      <LegalTodo id="section" description="описать собираемые данные: email, хеш пароля, имя, история игр, статус подписки" />

      <h2>4. Данные участников</h2>
      <LegalTodo id="section" description="описать собираемые данные участников: временные имена, баллы, отсутствие привязки к личности" />

      <h2>5. IP и User-Agent</h2>
      <LegalTodo id="section" description="зафиксировать сбор IP-адресов и User-Agent для логов, безопасности и фиксации юридических согласий" />

      <h2>6. Cookies и localStorage</h2>
      <LegalTodo id="section" description="сделать ссылку на Политику использования файлов cookie" />

      <h2>7. Загружаемые файлы</h2>
      <LegalTodo id="section" description="указать правила обработки загружаемых логотипов и фонов, отказ от обработки биометрии" />

      <h2>8. Цели обработки</h2>
      <LegalTodo id="section" description="перечислить цели: оказание услуг, исполнение договора, техподдержка, улучшение сервиса, биллинг" />

      <h2>9. Правовые основания</h2>
      <p><LegalTodo id="todo_5" description="указать основания по 152-ФЗ: исполнение договора (оферты" />, согласие субъекта)</p>

      <h2>10. Способы обработки</h2>
      <LegalTodo id="section" description="указать: автоматизированная обработка, сбор, запись, систематизация, хранение, извлечение" />

      <h2>11. Сроки хранения</h2>
      <LegalTodo id="section" description="определить срок хранения игровой истории и аккаунта, срок хранения логов" />

      <h2>12. Передача подрядчикам</h2>
      <LegalTodo id="section" description="описать передачу данных платежному шлюзу ЮKassa, хостинг-провайдеру" />

      <h2>13. Локализация</h2>
      <LegalTodo id="section" description="подтвердить хранение баз данных на территории РФ согласно ч.5 ст.18 152-ФЗ" />

      <h2>14. Трансграничная передача</h2>
      <LegalTodo id="section" description="указать, осуществляется ли трансграничная передача данных" />

      <h2>15. Права субъекта</h2>
      <LegalTodo id="section" description="описать право на доступ к данным, уточнение, блокировку, отзыв согласия" />

      <h2>16. Удаление данных</h2>
      <LegalTodo id="section" description="описать процесс удаления аккаунта через настройки или по email, сроки физического удаления из БД" />

      <h2>17. Меры защиты</h2>
      <LegalTodo id="section" description="описать применяемые меры: шифрование паролей bcrypt, использование HTTPS, ограничение доступа к БД" />

      <h2>18. Контакты</h2>
      <p><LegalTodo id="todo_6" description="указать email для обращений субъектов персональных данных (DPO" />)</p>
    </>
  );
}
