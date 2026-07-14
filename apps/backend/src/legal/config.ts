export enum LegalDocumentType {
  TERMS = 'TERMS',
  OFFER = 'OFFER',
  RECURRING_PAYMENT = 'RECURRING_PAYMENT',
  MARKETING = 'MARKETING',
  PRIVACY_ACKNOWLEDGEMENT = 'PRIVACY_ACKNOWLEDGEMENT'
}

export enum LegalAcceptanceSource {
  REGISTRATION = 'REGISTRATION',
  CHECKOUT = 'CHECKOUT',
  ACCOUNT_SETTINGS = 'ACCOUNT_SETTINGS',
  DOCUMENT_UPDATE = 'DOCUMENT_UPDATE'
}

export const legalBackendConfig = {
  versions: {
    [LegalDocumentType.TERMS]: '1.0',
    [LegalDocumentType.OFFER]: '1.0',
    [LegalDocumentType.RECURRING_PAYMENT]: '1.0',
    [LegalDocumentType.MARKETING]: '1.0',
    [LegalDocumentType.PRIVACY_ACKNOWLEDGEMENT]: '1.0',
  }
};
