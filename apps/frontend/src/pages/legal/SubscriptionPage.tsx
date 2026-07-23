import React from 'react';
import { legalConfig } from '../../config/legal';
import { LegalDocumentPage } from './LegalDocumentPage';

export function SubscriptionPage() {
  return <LegalDocumentPage document={legalConfig.documents.subscription} />;
}
