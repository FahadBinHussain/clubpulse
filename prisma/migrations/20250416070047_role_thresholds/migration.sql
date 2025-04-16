-- CreateTable
CREATE TABLE "role_thresholds" (
    "id" TEXT NOT NULL,
    "roleName" TEXT NOT NULL,
    "threshold" INTEGER NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "role_thresholds_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "role_thresholds_roleName_key" ON "role_thresholds"("roleName");
