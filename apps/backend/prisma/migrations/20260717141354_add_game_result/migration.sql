-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_GameHistory" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "hostUserId" TEXT NOT NULL,
    "roomCode" TEXT NOT NULL,
    "result" TEXT NOT NULL DEFAULT 'WINNER',
    "winnerName" TEXT,
    "winnerScore" INTEGER NOT NULL,
    "participants" INTEGER NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "GameHistory_hostUserId_fkey" FOREIGN KEY ("hostUserId") REFERENCES "HostUser" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_GameHistory" ("createdAt", "hostUserId", "id", "participants", "roomCode", "winnerName", "winnerScore") SELECT "createdAt", "hostUserId", "id", "participants", "roomCode", "winnerName", "winnerScore" FROM "GameHistory";
DROP TABLE "GameHistory";
ALTER TABLE "new_GameHistory" RENAME TO "GameHistory";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
