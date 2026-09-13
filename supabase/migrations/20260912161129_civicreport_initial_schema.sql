/*
# CivicReport - Initial Schema

## Overview
Creates the full database schema for a civic complaint reporting app where citizens
report problems (potholes, streetlights, garbage, etc.) with photos and location,
track status changes through an append-only timeline, and merge nearby duplicate complaints.

## New Tables

### profiles
- `id` (uuid, PK, references auth.users) — one row per user account
- `pseudonym` (text) — public display name, never reveals real phone/email
- `created_at` (timestamptz)

### complaints
- `id` (uuid, PK)
- `user_id` (uuid, references auth.users) — the original reporter
- `category` (enum: pothole, streetlight, garbage, water_leak, road_safety, other)
- `description` (text) — what the problem is
- `latitude` / `longitude` (double precision) — GPS coordinates
- `location_text` (text, nullable) — optional human-readable address
- `photo_path` (text, nullable) — storage path for the report photo
- `status` (enum: open, in_progress, pending_confirmation, resolved)
- `priority_count` (integer, default 1) — incremented when nearby duplicates merge
- `merged_into` (uuid, nullable, references complaints) — set when this complaint is merged into another
- `created_at` / `updated_at` (timestamptz)

### timeline_entries
- `id` (uuid, PK)
- `complaint_id` (uuid, references complaints) — which complaint this entry belongs to
- `status` (enum) — the status set by this entry
- `note` (text, nullable) — optional note (e.g. reopen reason)
- `photo_path` (text, nullable) — proof photo for resolution attempts
- `created_by` (uuid, references auth.users) — who made the change
- `created_at` (timestamptz)
- This table is APPEND-ONLY: no UPDATE or DELETE policies are created.

## Security (RLS)
- profiles: all authenticated users can read (to see pseudonyms); users can update only their own.
- complaints: all authenticated users can read (public feed); any authenticated user can insert and update (status changes are community-driven).
- timeline_entries: all authenticated users can read and insert; NO update or delete policies (append-only by design).
- Storage bucket "complaint-photos" is public-readable, authenticated-writable.

## Triggers
- `on_auth_user_created`: auto-creates a profile with a random pseudonym (Adjective + Noun format) when a user signs up.
- `update_complaints_updated_at`: auto-updates the `updated_at` column on complaint changes.
*/

-- ============================================================
-- Enums
-- ============================================================
DO $$ BEGIN
  CREATE TYPE complaint_category AS ENUM ('pothole', 'streetlight', 'garbage', 'water_leak', 'road_safety', 'other');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE complaint_status AS ENUM ('open', 'in_progress', 'pending_confirmation', 'resolved');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ============================================================
-- Tables
-- ============================================================

CREATE TABLE IF NOT EXISTS profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  pseudonym text NOT NULL,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS complaints (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  category complaint_category NOT NULL,
  description text NOT NULL,
  latitude double precision NOT NULL,
  longitude double precision NOT NULL,
  location_text text,
  photo_path text,
  status complaint_status NOT NULL DEFAULT 'open',
  priority_count integer NOT NULL DEFAULT 1,
  merged_into uuid REFERENCES complaints(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS timeline_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  complaint_id uuid NOT NULL REFERENCES complaints(id) ON DELETE CASCADE,
  status complaint_status NOT NULL,
  note text,
  photo_path text,
  created_by uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz DEFAULT now()
);

-- ============================================================
-- Indexes
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_complaints_category ON complaints(category);
CREATE INDEX IF NOT EXISTS idx_complaints_status ON complaints(status);
CREATE INDEX IF NOT EXISTS idx_complaints_user_id ON complaints(user_id);
CREATE INDEX IF NOT EXISTS idx_complaints_merged_into ON complaints(merged_into);
CREATE INDEX IF NOT EXISTS idx_timeline_complaint_id ON timeline_entries(complaint_id);
CREATE INDEX IF NOT EXISTS idx_timeline_created_at ON timeline_entries(created_at);

-- ============================================================
-- RLS
-- ============================================================
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE complaints ENABLE ROW LEVEL SECURITY;
ALTER TABLE timeline_entries ENABLE ROW LEVEL SECURITY;

-- Profiles: anyone authenticated can read pseudonyms; users update only their own
DROP POLICY IF EXISTS "read_all_profiles" ON profiles;
CREATE POLICY "read_all_profiles" ON profiles FOR SELECT
  TO authenticated USING (true);

DROP POLICY IF EXISTS "update_own_profile" ON profiles;
CREATE POLICY "update_own_profile" ON profiles FOR UPDATE
  TO authenticated USING (auth.uid() = id) WITH CHECK (auth.uid() = id);

-- Complaints: public feed (read all), any authenticated can insert/update
DROP POLICY IF EXISTS "read_all_complaints" ON complaints;
CREATE POLICY "read_all_complaints" ON complaints FOR SELECT
  TO authenticated USING (true);

DROP POLICY IF EXISTS "insert_complaints" ON complaints;
CREATE POLICY "insert_complaints" ON complaints FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "update_complaints" ON complaints;
CREATE POLICY "update_complaints" ON complaints FOR UPDATE
  TO authenticated USING (true) WITH CHECK (true);

-- Timeline: append-only (read + insert only, NO update/delete)
DROP POLICY IF EXISTS "read_all_timeline" ON timeline_entries;
CREATE POLICY "read_all_timeline" ON timeline_entries FOR SELECT
  TO authenticated USING (true);

DROP POLICY IF EXISTS "insert_timeline" ON timeline_entries;
CREATE POLICY "insert_timeline" ON timeline_entries FOR INSERT
  TO authenticated WITH CHECK (true);

-- ============================================================
-- Triggers
-- ============================================================

-- Auto-create profile with random pseudonym on signup
CREATE OR REPLACE FUNCTION create_profile_on_signup() RETURNS trigger AS $$
DECLARE
  adjectives text[] := ARRAY['Swift', 'Bright', 'Calm', 'Bold', 'Keen', 'Wise', 'Fair', 'Warm', 'Crisp', 'Solid', 'Lively', 'Steady', 'Gentle', 'Sharp', 'Clear'];
  nouns text[] := ARRAY['Fox', 'Oak', 'Hawk', 'Wolf', 'Pine', 'Bear', 'Heron', 'Elm', 'Seal', 'Lark', 'Robin', 'Stag', 'Crane', 'Falcon', 'Cedar'];
  adj text;
  noun text;
BEGIN
  adj := adjectives[1 + floor(random() * array_length(adjectives, 1))::int];
  noun := nouns[1 + floor(random() * array_length(nouns, 1))::int];
  INSERT INTO profiles (id, pseudonym) VALUES (NEW.id, adj || ' ' || noun)
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION create_profile_on_signup();

-- Auto-update updated_at on complaints
CREATE OR REPLACE FUNCTION update_updated_at() RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_complaints_updated_at ON complaints;
CREATE TRIGGER trg_complaints_updated_at BEFORE UPDATE ON complaints
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================================
-- Storage bucket for complaint photos
-- ============================================================
INSERT INTO storage.buckets (id, name, public)
VALUES ('complaint-photos', 'complaint-photos', true)
ON CONFLICT (id) DO NOTHING;

-- Storage policies: public read, authenticated upload
DROP POLICY IF EXISTS "read_complaint_photos" ON storage.objects;
CREATE POLICY "read_complaint_photos" ON storage.objects FOR SELECT
  TO anon, authenticated USING (bucket_id = 'complaint-photos');

DROP POLICY IF EXISTS "upload_complaint_photos" ON storage.objects;
CREATE POLICY "upload_complaint_photos" ON storage.objects FOR INSERT
  TO authenticated WITH CHECK (bucket_id = 'complaint-photos');

DROP POLICY IF EXISTS "update_complaint_photos" ON storage.objects;
CREATE POLICY "update_complaint_photos" ON storage.objects FOR UPDATE
  TO authenticated USING (bucket_id = 'complaint-photos');