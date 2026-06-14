-- Add contacts (JSON array) and weatherData (JSON object) to ProductionCallSheet
ALTER TABLE "ProductionCallSheet" ADD COLUMN IF NOT EXISTS "contacts" JSONB NOT NULL DEFAULT '[]';
ALTER TABLE "ProductionCallSheet" ADD COLUMN IF NOT EXISTS "weatherData" JSONB;
