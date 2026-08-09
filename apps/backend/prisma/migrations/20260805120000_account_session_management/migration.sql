-- AlterTable
ALTER TABLE "Session" ADD COLUMN "ipAddress" TEXT;
ALTER TABLE "Session" ADD COLUMN "userAgent" TEXT;
ALTER TABLE "Session" ADD COLUMN "lastSeenAt" DATETIME;

-- CreateTable
CREATE TABLE "ArchivedLegalAcceptance" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "archiveSubjectId" TEXT NOT NULL,
    "documentType" TEXT NOT NULL,
    "documentVersion" TEXT NOT NULL,
    "acceptanceSource" TEXT NOT NULL,
    "acceptedAt" DATETIME NOT NULL,
    "archivedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "ArchivedSubscription" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "archiveSubjectId" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "currentPeriodStart" DATETIME NOT NULL,
    "currentPeriodEnd" DATETIME NOT NULL,
    "autoRenew" BOOLEAN NOT NULL,
    "cancelAtPeriodEnd" BOOLEAN NOT NULL,
    "canceledAt" DATETIME,
    "nextChargeAt" DATETIME,
    "lastPaymentId" TEXT,
    "providerPaymentMethodId" TEXT,
    "createdAt" DATETIME NOT NULL,
    "updatedAt" DATETIME NOT NULL,
    "archivedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "ArchivedPayment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "archiveSubjectId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "providerPaymentId" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "amountMinor" INTEGER NOT NULL,
    "currency" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL,
    "paidAt" DATETIME,
    "updatedAt" DATETIME NOT NULL,
    "archivedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "ArchivedRefund" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "archiveSubjectId" TEXT NOT NULL,
    "providerPaymentId" TEXT NOT NULL,
    "providerRefundId" TEXT NOT NULL,
    "amountMinor" INTEGER NOT NULL,
    "currency" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL,
    "updatedAt" DATETIME NOT NULL,
    "archivedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "ArchivedPaymentMethod" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "archiveSubjectId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "providerPaymentMethodId" TEXT NOT NULL,
    "recurringEnabled" BOOLEAN NOT NULL,
    "consentedAt" DATETIME,
    "disabledAt" DATETIME,
    "createdAt" DATETIME NOT NULL,
    "updatedAt" DATETIME NOT NULL,
    "archivedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE INDEX "Session_userId_revokedAt_expiresAt_idx" ON "Session"("userId", "revokedAt", "expiresAt");
CREATE INDEX "ArchivedLegalAcceptance_archiveSubjectId_idx" ON "ArchivedLegalAcceptance"("archiveSubjectId");
CREATE INDEX "ArchivedSubscription_archiveSubjectId_idx" ON "ArchivedSubscription"("archiveSubjectId");
CREATE UNIQUE INDEX "ArchivedPayment_providerPaymentId_key" ON "ArchivedPayment"("providerPaymentId");
CREATE UNIQUE INDEX "ArchivedPayment_idempotencyKey_key" ON "ArchivedPayment"("idempotencyKey");
CREATE INDEX "ArchivedPayment_archiveSubjectId_idx" ON "ArchivedPayment"("archiveSubjectId");
CREATE UNIQUE INDEX "ArchivedRefund_providerRefundId_key" ON "ArchivedRefund"("providerRefundId");
CREATE INDEX "ArchivedRefund_archiveSubjectId_idx" ON "ArchivedRefund"("archiveSubjectId");
CREATE UNIQUE INDEX "ArchivedPaymentMethod_providerPaymentMethodId_key" ON "ArchivedPaymentMethod"("providerPaymentMethodId");
CREATE INDEX "ArchivedPaymentMethod_archiveSubjectId_idx" ON "ArchivedPaymentMethod"("archiveSubjectId");
