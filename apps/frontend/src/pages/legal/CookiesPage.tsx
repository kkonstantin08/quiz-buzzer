import React from 'react';
import { legalConfig } from '../../config/legal';
import { LegalDocumentPage } from './LegalDocumentPage';

export function CookiesPage() {
  return <LegalDocumentPage document={legalConfig.documents.cookies} />;
}
