import React from 'react';
import { legalConfig } from '../../config/legal';
import { LegalDraftNotice } from '../../components/LegalDraftNotice';
import { LegalTodo } from '../../components/LegalTodo';

export function TermsPage() {
  return (
    <>
      <LegalDraftNotice />
      <h1>Пользовательское соглашение</h1>
      <p className="text-sm text-slate-500 mb-8">Версия: {legalConfig.versions.terms}. Дата: {legalConfig.dates.terms}</p>
      
      <h2>1. Общие положения</h2>
      <p>
        Настоящее Пользовательское соглашение регулирует отношения между <strong>{legalConfig.merchantName}</strong> и 
        Пользователем сервиса «{legalConfig.productName}».
      </p>

      <h2>2. Термины и определения</h2>
      <LegalTodo id="section" description="добавить точные юридические термины, используемые в сервисе: Ведущий, Участник, Комната, Подписка" />

      <h2>3. Регистрация и аккаунт</h2>
      <LegalTodo id="section" description="описать процесс регистрации, подтверждение email, обязанность указывать достоверные данные" />

      <h2>4. Требования к пользователю</h2>
      <LegalTodo id="section" description="установить возрастные ограничения, дееспособность, согласие с правилами" />

      <h2>5. Правила использования сервиса</h2>
      <LegalTodo id="section" description="описать допустимое использование, механику создания комнат, ограничения на количество участников" />

      <h2>6. Запрещенные действия</h2>
      <LegalTodo id="section" description="запретить спам, парсинг, использование уязвимостей, оскорбления в названиях комнат" />

      <h2>7. Пользовательский контент</h2>
      <LegalTodo id="section" description="описать ответственность за загружаемые логотипы и названия комнат, права платформы на модерацию" />

      <h2>8. Блокировка аккаунта</h2>
      <LegalTodo id="section" description="описать основания и порядок блокировки без возврата средств при нарушении правил" />

      <h2>9. Интеллектуальные права</h2>
      <LegalTodo id="section" description="закрепить права на код, дизайн и бренд за правообладателем, запретить копирование" />

      <h2>10. Ограничение ответственности</h2>
      <LegalTodo id="section" description="снять ответственность за технические сбои интернета, задержки пинга, потерю связи на устройствах участников" />

      <h2>11. Прекращение использования</h2>
      <LegalTodo id="section" description="описать порядок самостоятельного удаления аккаунта и расторжения соглашения" />

      <h2>12. Изменение условий</h2>
      <LegalTodo id="section" description="описать порядок уведомления об изменениях соглашения и вступления их в силу" />

      <h2>13. Контакты</h2>
      <LegalTodo id="section" description="указать почтовый адрес ИП для направления претензий и email техподдержки" />
    </>
  );
}
