-- Add location, coordinates, sun times, and weather to the scheduler CallSheet model
ALTER TABLE "CallSheet" ADD COLUMN IF NOT EXISTS "location"      TEXT;
ALTER TABLE "CallSheet" ADD COLUMN IF NOT EXISTS "locationLat"   DOUBLE PRECISION;
ALTER TABLE "CallSheet" ADD COLUMN IF NOT EXISTS "locationLng"   DOUBLE PRECISION;
ALTER TABLE "CallSheet" ADD COLUMN IF NOT EXISTS "sunrise"       TEXT;
ALTER TABLE "CallSheet" ADD COLUMN IF NOT EXISTS "sunset"        TEXT;
ALTER TABLE "CallSheet" ADD COLUMN IF NOT EXISTS "goldenHourAm"  TEXT;
ALTER TABLE "CallSheet" ADD COLUMN IF NOT EXISTS "goldenHourPm"  TEXT;
ALTER TABLE "CallSheet" ADD COLUMN IF NOT EXISTS "blueHourAm"    TEXT;
ALTER TABLE "CallSheet" ADD COLUMN IF NOT EXISTS "blueHourPm"    TEXT;
ALTER TABLE "CallSheet" ADD COLUMN IF NOT EXISTS "weatherData"   JSONB;
