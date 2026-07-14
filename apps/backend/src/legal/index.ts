import { Router } from 'express';
import { prisma } from '../prisma';
import { requireAuth, AuthRequest } from '../auth/middleware';
import { LegalDocumentType, LegalAcceptanceSource, legalBackendConfig } from './config';

export const legalRouter = Router();

legalRouter.post('/accept', requireAuth, async (req: AuthRequest, res) => {
  try {
    const { documentType } = req.body;

    if (!documentType || !Object.values(LegalDocumentType).includes(documentType)) {
      return res.status(400).json({ error: 'Неизвестный тип документа' });
    }

    const docType = documentType as LegalDocumentType;
    const serverVersion = legalBackendConfig.versions[docType];

    const ipAddress = req.ip || req.socket.remoteAddress || null;
    const userAgent = req.headers['user-agent'] || null;

    // Check if already accepted
    const existing = await prisma.legalAcceptance.findUnique({
      where: {
        hostUserId_documentType_documentVersion: {
          hostUserId: req.userId!,
          documentType: docType,
          documentVersion: serverVersion
        }
      }
    });

    if (existing) {
      return res.json({ success: true, message: 'Уже принято' });
    }

    await prisma.legalAcceptance.create({
      data: {
        hostUserId: req.userId!,
        documentType: docType,
        documentVersion: serverVersion,
        acceptanceSource: LegalAcceptanceSource.DOCUMENT_UPDATE, // Or another appropriate source
        ipAddress,
        userAgent
      }
    });

    return res.json({ success: true });
  } catch (error) {
    console.error('Legal accept error:', error);
    return res.status(500).json({ error: 'Внутренняя ошибка сервера' });
  }
});
