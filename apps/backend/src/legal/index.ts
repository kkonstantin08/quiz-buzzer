import { Router } from 'express';
import { prisma } from '../prisma';
import { requireAuth, AuthRequest } from '../auth/middleware';
import { LegalDocumentType, LegalAcceptanceSource, legalBackendConfig } from './config';

export const legalRouter = Router();

async function handleAcceptance(
  req: AuthRequest,
  res: any,
  acceptanceSource: LegalAcceptanceSource,
  allowedDocumentTypes: LegalDocumentType[]
) {
  try {
    const { documentType, documentVersion } = req.body;

    if (!documentType || !allowedDocumentTypes.includes(documentType)) {
      return res.status(400).json({ error: 'Неизвестный или недопустимый тип документа для данного действия' });
    }

    if (!documentVersion) {
      return res.status(400).json({ error: 'Не указана версия документа' });
    }

    const docType = documentType as LegalDocumentType;
    const serverVersion = legalBackendConfig.versions[docType];

    if (documentVersion !== serverVersion) {
      return res.status(409).json({
        code: 'DOCUMENT_VERSION_MISMATCH',
        message: 'Версия документа изменилась. Обновите страницу и повторите действие.',
        currentVersion: serverVersion
      });
    }

    const ipAddress = req.ip || req.socket.remoteAddress || null;
    const userAgent = req.headers['user-agent'] || null;

    // Idempotent upsert
    await prisma.legalAcceptance.upsert({
      where: {
        hostUserId_documentType_documentVersion: {
          hostUserId: req.userId!,
          documentType: docType,
          documentVersion: serverVersion
        }
      },
      update: {}, // Do nothing if exists
      create: {
        hostUserId: req.userId!,
        documentType: docType,
        documentVersion: serverVersion,
        acceptanceSource,
        ipAddress,
        userAgent
      }
    });

    return res.json({ success: true });
  } catch (error) {
    console.error('Legal accept error:', error);
    return res.status(500).json({ error: 'Внутренняя ошибка сервера' });
  }
}

legalRouter.post('/accept/updated-document', requireAuth, (req: AuthRequest, res: any) => {
  return handleAcceptance(req, res, LegalAcceptanceSource.DOCUMENT_UPDATE, [
    LegalDocumentType.TERMS,
    LegalDocumentType.OFFER,
    LegalDocumentType.PRIVACY_ACKNOWLEDGEMENT
  ]);
});

legalRouter.post('/accept/account-settings', requireAuth, (req: AuthRequest, res: any) => {
  return handleAcceptance(req, res, LegalAcceptanceSource.ACCOUNT_SETTINGS, [
    LegalDocumentType.TERMS,
    LegalDocumentType.OFFER,
    LegalDocumentType.PRIVACY_ACKNOWLEDGEMENT,
    LegalDocumentType.RECURRING_PAYMENT,
    LegalDocumentType.MARKETING
  ]);
});
