-- CreateTable
CREATE TABLE "TicketConfig" (
    "id" SERIAL NOT NULL,
    "localId" INTEGER NOT NULL,
    "configJson" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TicketConfig_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "TicketConfig_localId_key" ON "TicketConfig"("localId");

-- CreateIndex
CREATE INDEX "TicketConfig_localId_idx" ON "TicketConfig"("localId");

-- AddForeignKey
ALTER TABLE "TicketConfig" ADD CONSTRAINT "TicketConfig_localId_fkey" FOREIGN KEY ("localId") REFERENCES "Local"("id") ON DELETE CASCADE ON UPDATE CASCADE;
