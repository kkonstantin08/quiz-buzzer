import React from 'react';
import { legalConfig } from '../../config/legal';
import { LegalDocumentPage } from './LegalDocumentPage';

export function PrivacyPage() {
  return <LegalDocumentPage document={legalConfig.documents.privacy} />;
}
