import consent from '../../../../Документы КвизПульт/Markdown/Согласие на обработку персональных данных КвизПульт.md?raw';
import cookies from '../../../../Документы КвизПульт/Markdown/Политика использования cookie КвизПульт.md?raw';
import details from '../../../../Документы КвизПульт/Markdown/Реквизиты и контакты КвизПульт.md?raw';
import offer from '../../../../Документы КвизПульт/Markdown/Публичная оферта КвизПульт.md?raw';
import privacy from '../../../../Документы КвизПульт/Markdown/Политика обработки персональных данных КвизПульт.md?raw';
import refunds from '../../../../Документы КвизПульт/Markdown/Политика возвратов КвизПульт.md?raw';
import subscription from '../../../../Документы КвизПульт/Markdown/Условия предоставления доступа КвизПульт.md?raw';
import terms from '../../../../Документы КвизПульт/Markdown/Пользовательское соглашение КвизПульт.md?raw';

const effectiveDate = '18 июля 2026 года';

const documents = {
  details: { id: 'DETAILS', route: '/legal/details', version: '1.0', effectiveDate, markdown: details },
  offer: { id: 'OFFER', route: '/offer', version: '1.0', effectiveDate, markdown: offer },
  terms: { id: 'TERMS', route: '/terms', version: '1.0', effectiveDate, markdown: terms },
  privacy: { id: 'PRIVACY', route: '/privacy', version: '1.0', effectiveDate, markdown: privacy },
  cookies: { id: 'COOKIES', route: '/cookies', version: '1.0', effectiveDate, markdown: cookies },
  subscription: { id: 'SUBSCRIPTION', route: '/subscription', version: '1.0', effectiveDate, markdown: subscription },
  refunds: { id: 'REFUNDS', route: '/refunds', version: '1.0', effectiveDate, markdown: refunds },
  consent: { id: 'PERSONAL_DATA_CONSENT', route: '/consent', version: '1.0', effectiveDate, markdown: consent },
} as const;

export type LegalDocument = typeof documents[keyof typeof documents];

export const legalConfig = {
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
