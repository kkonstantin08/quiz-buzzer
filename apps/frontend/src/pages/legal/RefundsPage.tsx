import React from 'react';
import { legalConfig } from '../../config/legal';
import { LegalDocumentPage } from './LegalDocumentPage';

export function RefundsPage() {
  return <LegalDocumentPage document={legalConfig.documents.refunds} />;
}
