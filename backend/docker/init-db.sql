-- Khabar Database Initialization Script
-- This script runs on first database creation

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "postgis";
CREATE EXTENSION IF NOT EXISTS "postgis_topology";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

-- Function to update incident location geography from lat/lng
CREATE OR REPLACE FUNCTION update_incident_location()
RETURNS TRIGGER AS $$
BEGIN
  NEW.location = ST_SetSRID(ST_MakePoint(NEW.longitude::float, NEW.latitude::float), 4326)::geography;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Note: Trigger and GIST index will be created by Prisma service after table creation
-- The Prisma service handles:
-- 1. Adding the 'location' geography column
-- 2. Creating GIST index on 'location' column
-- 3. Creating trigger to auto-update location from lat/lng

-- Grant permissions
GRANT ALL PRIVILEGES ON DATABASE khabar TO khabar;

-- Create schema for analytics (optional)
CREATE SCHEMA IF NOT EXISTS analytics;
GRANT ALL ON SCHEMA analytics TO khabar;

-- Output initialization complete
DO $$
BEGIN
  RAISE NOTICE 'Khabar database initialized with PostGIS extensions';
END $$;
