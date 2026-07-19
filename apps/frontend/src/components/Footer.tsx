import React from 'react';
import { Link } from 'react-router-dom';
import { legalConfig } from '../config/legal';
import { openCookieSettings } from '../lib/cookieNoticeStorage';
import { Target } from 'lucide-react';

export function Footer() {
  return (
    <footer className="bg-slate-900 py-12 border-t border-slate-800 text-slate-400 mt-auto">
      <div className="max-w-7xl mx-auto px-6">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-8 mb-8">
          <div>
            <Link to="/" className="inline-flex items-center gap-2 mb-4 group focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary rounded-md">
              <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-red-400 to-red-600 flex items-center justify-center shadow-md shadow-red-500/30">
                <Target className="w-5 h-5 text-white" strokeWidth={2.5} />
              </div>
              <span className="font-bold text-lg text-white tracking-tight group-hover:text-primary transition-colors">КвизПульт</span>
            </Link>
            <p className="text-sm leading-relaxed max-w-xs">
              Платформа для проведения интерактивных викторин и квизов.
            </p>
          </div>
          <div>
            <h3 className="font-semibold text-white mb-4">Документы</h3>
            <ul className="space-y-2 text-sm">
              <li><Link to={legalConfig.urls.offer} className="hover:text-white transition-colors">Публичная оферта</Link></li>
              <li><Link to={legalConfig.urls.terms} className="hover:text-white transition-colors">Пользовательское соглашение</Link></li>
              <li><Link to={legalConfig.urls.privacy} className="hover:text-white transition-colors">Политика конфиденциальности</Link></li>
              <li><Link to={legalConfig.urls.subscription} className="hover:text-white transition-colors">Условия подписки</Link></li>
              <li><Link to={legalConfig.urls.consent} className="hover:text-white transition-colors">Согласие на обработку персональных данных</Link></li>
            </ul>
          </div>
          <div>
            <h3 className="font-semibold text-white mb-4">Информация</h3>
            <ul className="space-y-2 text-sm">
              <li><Link to={legalConfig.urls.details} className="hover:text-white transition-colors">Реквизиты</Link></li>
              <li><Link to={legalConfig.urls.cookies} className="hover:text-white transition-colors">Политика Cookie</Link></li>
              <li><Link to={legalConfig.urls.refunds} className="hover:text-white transition-colors">Возврат средств</Link></li>
              <li><button type="button" onClick={openCookieSettings} className="hover:text-white transition-colors text-left">Настройки cookie</button></li>
            </ul>
          </div>
          <div>
            <h3 className="font-semibold text-white mb-4">Контакты</h3>
            <ul className="space-y-2 text-sm">
              <li>{legalConfig.merchantName}</li>
              <li><a href={`mailto:${legalConfig.email}`} className="hover:text-white transition-colors">{legalConfig.email}</a></li>
              <li><a href="tel:+79053979810" className="hover:text-white transition-colors">{legalConfig.phone}</a></li>
            </ul>
          </div>
        </div>
        
        <div className="pt-8 border-t border-slate-800 flex flex-col md:flex-row justify-between items-center gap-4 text-xs">
          <div className="text-slate-500">
            &copy; {new Date().getFullYear()} {legalConfig.merchantName}. Все права защищены.
          </div>
          <div className="text-slate-500 flex items-center gap-4">
            <span>ИНН: {legalConfig.inn}</span>
            <span>ОГРНИП: {legalConfig.ogrnip}</span>
          </div>
        </div>
      </div>
    </footer>
  );
}
