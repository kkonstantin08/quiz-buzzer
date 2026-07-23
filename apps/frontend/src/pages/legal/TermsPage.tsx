import React from 'react';
import { legalConfig } from '../../config/legal';
import { LegalDocumentPage } from './LegalDocumentPage';

export function TermsPage() {
  return <LegalDocumentPage document={legalConfig.documents.terms} />;
}
