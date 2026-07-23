import consent from '../../../../Документы КвизПульт/Markdown/Согласие на обработку персональных данных КвизПульт.md?raw';
import cookies from '../../../../Документы КвизПульт/Markdown/Политика использования cookie КвизПульт.md?raw';
import details from '../../../../Документы КвизПульт/Markdown/Реквизиты и контакты КвизПульт.md?raw';
import offer from '../../../../Документы КвизПульт/Markdown/Публичная оферта КвизПульт.md?raw';
import privacy from '../../../../Документы КвизПульт/Markdown/Политика обработки персональных данных КвизПульт.md?raw';
import refunds from '../../../../Документы КвизПульт/Markdown/Политика возвратов КвизПульт.md?raw';
import subscription from '../../../../Документы КвизПульт/Markdown/Условия предоставления доступа КвизПульт.md?raw';
import terms from '../../../../Документы КвизПульт/Markdown/Пользовательское соглашение КвизПульт.md?raw';
import { LEGAL_DOCUMENT_VERSION } from 'shared';

const effectiveDate = '18 июля 2026 года';
const documentVersion = LEGAL_DOCUMENT_VERSION;

const documents = {
  details: { id: 'DETAILS', route: '/legal/details', version: documentVersion, effectiveDate, title: 'Реквизиты и контактная информация | КвизПульт', description: 'Реквизиты и контактная информация сервиса «КвизПульт».', markdown: details },
  offer: { id: 'OFFER', route: '/offer', version: documentVersion, effectiveDate, title: 'Публичная оферта | КвизПульт', description: 'Публичная оферта на предоставление доступа к сервису «КвизПульт».', markdown: offer },
  terms: { id: 'TERMS', route: '/terms', version: documentVersion, effectiveDate, title: 'Пользовательское соглашение | КвизПульт', description: 'Пользовательское соглашение сервиса «КвизПульт».', markdown: terms },
  privacy: { id: 'PRIVACY', route: '/privacy', version: documentVersion, effectiveDate, title: 'Политика обработки персональных данных | КвизПульт', description: 'Политика обработки персональных данных сервиса «КвизПульт».', markdown: privacy },
  cookies: { id: 'COOKIES', route: '/cookies', version: documentVersion, effectiveDate, title: 'Политика Cookie | КвизПульт', description: 'Политика использования cookie сервиса «КвизПульт».', markdown: cookies },
  subscription: { id: 'SUBSCRIPTION', route: '/subscription', version: documentVersion, effectiveDate, title: 'Условия предоставления доступа | КвизПульт', description: 'Условия предоставления доступа к сервису «КвизПульт».', markdown: subscription },
  refunds: { id: 'REFUNDS', route: '/refunds', version: documentVersion, effectiveDate, title: 'Политика возвратов | КвизПульт', description: 'Политика возвратов сервиса «КвизПульт».', markdown: refunds },
  consent: { id: 'PERSONAL_DATA_CONSENT', route: '/consent', version: documentVersion, effectiveDate, title: 'Согласие на обработку персональных данных | КвизПульт', description: 'Согласие на обработку персональных данных для сервиса «КвизПульт».', markdown: consent },
} as const;

export type LegalDocument = typeof documents[keyof typeof documents];

export const legalConfig = {
  documentVersion,
  effectiveDate,
  productName: "КвизПульт",
  merchantName: "Индивидуальный предприниматель Тумакин Алексей Анатольевич",
  inn: "344211197773",
  ogrnip: "314344311900126",
  phone: "+7 905 397-98-10",
  email: "videoaleks@mail.ru",
  bankDetails: {
    account: "40802810400006291018",
    bank: "АО «ТБанк»",
    bik: "044525974",
    bankInn: "7710140679",
    corrAccount: "30101810145250000974",
  },
  documents,
  urls: Object.fromEntries(Object.entries(documents).map(([key, document]) => [key, document.route])) as Record<keyof typeof documents, string>,
  versions: Object.fromEntries(Object.entries(documents).map(([key, document]) => [key, document.version])) as Record<keyof typeof documents, string>,
  dates: Object.fromEntries(Object.entries(documents).map(([key, document]) => [key, document.effectiveDate])) as Record<keyof typeof documents, string>,
};
