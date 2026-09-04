-- ==============================================================================
-- DHR Corridor Slope Hazard Intelligence - Supabase Schema Migration
-- Run this in your Supabase Project SQL Editor (Dashboard -> SQL Editor -> New Query)
-- ==============================================================================

-- 1. Create hazard_reports table
CREATE TABLE IF NOT EXISTS public.hazard_reports (
  id TEXT PRIMARY KEY,
  created_at TIMESTAMPTZ NOT NULL,
  synced_at TIMESTAMPTZ DEFAULT now(),
  hazard_type TEXT NOT NULL,
  severity TEXT NOT NULL,
  vision_confidence REAL,
  landmark_label TEXT,
  latitude DOUBLE PRECISION,
  longitude DOUBLE PRECISION,
  altitude REAL,
  photo_url TEXT,
  context JSONB NOT NULL DEFAULT '{}'::jsonb,
  advisory JSONB NOT NULL DEFAULT '{}'::jsonb,
  device_id TEXT
);

-- Indexing for fast spatial & corridor queries
CREATE INDEX IF NOT EXISTS idx_hazard_reports_created_at ON public.hazard_reports (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_hazard_reports_severity ON public.hazard_reports (severity);
CREATE INDEX IF NOT EXISTS idx_hazard_reports_hazard_type ON public.hazard_reports (hazard_type);

-- Enable RLS on hazard_reports
ALTER TABLE public.hazard_reports ENABLE ROW LEVEL SECURITY;

-- Allow anonymous inserts & selects for emergency field dispatch
CREATE POLICY "Allow public read access on hazard_reports"
  ON public.hazard_reports
  FOR SELECT
  TO anon, authenticated
  USING (true);

CREATE POLICY "Allow public insert/upsert on hazard_reports"
  ON public.hazard_reports
  FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);

CREATE POLICY "Allow public update on hazard_reports"
  ON public.hazard_reports
  FOR UPDATE
  TO anon, authenticated
  USING (true)
  WITH CHECK (true);

-- 2. Create Storage Bucket for Hazard Evidence Photos
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'hazard-photos',
  'hazard-photos',
  true,
  10485760, -- 10MB limit
  ARRAY['image/jpeg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO UPDATE SET
  public = true,
  file_size_limit = 10485760,
  allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/webp'];

-- Enable storage RLS policies for hazard-photos
CREATE POLICY "Public read access for hazard-photos"
  ON storage.objects
  FOR SELECT
  TO anon, authenticated
  USING (bucket_id = 'hazard-photos');

CREATE POLICY "Public upload access for hazard-photos"
  ON storage.objects
  FOR INSERT
  TO anon, authenticated
  WITH CHECK (bucket_id = 'hazard-photos');

CREATE POLICY "Public update access for hazard-photos"
  ON storage.objects
  FOR UPDATE
  TO anon, authenticated
  USING (bucket_id = 'hazard-photos');

-- ==============================================================================
-- 3. Create official_alerts table (Relay Down Subsystem)
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.official_alerts (
  id TEXT PRIMARY KEY,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  hazard_type TEXT NOT NULL,
  severity TEXT NOT NULL,
  message TEXT NOT NULL,
  latitude DOUBLE PRECISION,
  longitude DOUBLE PRECISION,
  photo_url TEXT,
  hop_count INT NOT NULL DEFAULT 0
);

-- Indexing for official alerts
CREATE INDEX IF NOT EXISTS idx_official_alerts_created_at ON public.official_alerts (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_official_alerts_severity ON public.official_alerts (severity);
CREATE INDEX IF NOT EXISTS idx_official_alerts_hazard_type ON public.official_alerts (hazard_type);

-- Enable RLS
ALTER TABLE public.official_alerts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow public read access on official_alerts"
  ON public.official_alerts
  FOR SELECT
  TO anon, authenticated
  USING (true);

CREATE POLICY "Allow public insert/upsert on official_alerts"
  ON public.official_alerts
  FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);

CREATE POLICY "Allow public update on official_alerts"
  ON public.official_alerts
  FOR UPDATE
  TO anon, authenticated
  USING (true)
  WITH CHECK (true);

