-- CreateTable
CREATE TABLE "HostUser" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT,
    "avatarUrl" TEXT,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "freeTrialUsed" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "Subscription" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "hostUserId" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "currentPeriodStart" DATETIME NOT NULL,
    "currentPeriodEnd" DATETIME NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Subscription_hostUserId_fkey" FOREIGN KEY ("hostUserId") REFERENCES "HostUser" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "HostSettings" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "hostUserId" TEXT NOT NULL,
    "soundEnabled" BOOLEAN NOT NULL DEFAULT true,
    "soundTheme" TEXT NOT NULL DEFAULT 'classic',
    "customLogoUrl" TEXT,
    "customBgUrl" TEXT,
    "bgTheme" TEXT NOT NULL DEFAULT 'light',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "HostSettings_hostUserId_fkey" FOREIGN KEY ("hostUserId") REFERENCES "HostUser" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "GameHistory" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "hostUserId" TEXT NOT NULL,
    "roomCode" TEXT NOT NULL,
    "winnerName" TEXT NOT NULL,
    "winnerScore" INTEGER NOT NULL,
    "participants" INTEGER NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "GameHistory_hostUserId_fkey" FOREIGN KEY ("hostUserId") REFERENCES "HostUser" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "HostUser_email_key" ON "HostUser"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Subscription_hostUserId_key" ON "Subscription"("hostUserId");

-- CreateIndex
CREATE UNIQUE INDEX "HostSettings_hostUserId_key" ON "HostSettings"("hostUserId");
