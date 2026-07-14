import { Router } from 'express';
import { prisma } from '../prisma';
import { requireAuth, AuthRequest } from '../auth/middleware';
import { LegalDocumentType, LegalAcceptanceSource, legalBackendConfig } from './config';

export const legalRouter = Router();

legalRouter.post('/accept/:source', requireAuth, async (req: AuthRequest, res: any) => {
  try {
    const { documentType, documentVersion } = req.body;
    const { source } = req.params;

    if (!documentType || !Object.values(LegalDocumentType).includes(documentType)) {
      return res.status(400).json({ error: 'Неизвестный тип документа' });
    }

    if (!documentVersion) {
      return res.status(400).json({ error: 'Не указана версия документа' });
    }

    // Server-side mapping of URL parameter to LegalAcceptanceSource
    const sourceMap: Record<string, LegalAcceptanceSource> = {
      'registration': LegalAcceptanceSource.REGISTRATION,
      'updated-document': LegalAcceptanceSource.DOCUMENT_UPDATE,
      'account-settings': LegalAcceptanceSource.ACCOUNT_SETTINGS,
      'checkout': LegalAcceptanceSource.CHECKOUT
    };

    const acceptanceSource = sourceMap[source.toLowerCase()];
    if (!acceptanceSource) {
      return res.status(400).json({ error: 'Неизвестный источник согласия' });
    }

    if (acceptanceSource === LegalAcceptanceSource.CHECKOUT) {
      return res.status(403).json({ error: 'Принятие через checkout временно недоступно' });
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
});
