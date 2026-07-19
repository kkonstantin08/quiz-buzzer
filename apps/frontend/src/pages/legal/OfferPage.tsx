import React from 'react';
import { legalConfig } from '../../config/legal';
import { LegalDocumentPage } from './LegalDocumentPage';

export function OfferPage() {
  return <LegalDocumentPage document={legalConfig.documents.offer} />;
}
