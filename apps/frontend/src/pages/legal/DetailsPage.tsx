import React from 'react';
import { legalConfig } from '../../config/legal';
import { LegalDocumentPage } from './LegalDocumentPage';

export function DetailsPage() {
  return <LegalDocumentPage document={legalConfig.documents.details} />;
}
