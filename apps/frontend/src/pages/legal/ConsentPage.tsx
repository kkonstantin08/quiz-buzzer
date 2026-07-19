import React from 'react';
import { legalConfig } from '../../config/legal';
import { LegalDocumentPage } from './LegalDocumentPage';

export function ConsentPage() {
  return <LegalDocumentPage document={legalConfig.documents.consent} />;
}
