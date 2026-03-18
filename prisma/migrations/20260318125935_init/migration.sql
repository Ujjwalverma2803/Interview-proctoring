-- CreateTable
CREATE TABLE "Incident" (
    "id" TEXT NOT NULL,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "event" TEXT NOT NULL,
    "severity" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "candidateName" TEXT NOT NULL,
    "targetRole" TEXT NOT NULL,
    "experience" TEXT NOT NULL,

    CONSTRAINT "Incident_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Incident_candidateName_targetRole_idx" ON "Incident"("candidateName", "targetRole");
