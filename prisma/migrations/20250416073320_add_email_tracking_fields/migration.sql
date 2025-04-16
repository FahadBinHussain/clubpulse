-- AlterTable
ALTER TABLE "email_queue" ADD COLUMN     "openedAt" TIMESTAMP(3),
ADD COLUMN     "resendMessageId" TEXT;

-- CreateIndex
CREATE INDEX "email_queue_resendMessageId_idx" ON "email_queue"("resendMessageId");
