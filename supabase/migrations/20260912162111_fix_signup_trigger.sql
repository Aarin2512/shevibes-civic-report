/*
# Fix: Database error saving new user

## Problem
Signing up fails with "Database error saving new user" because the
`create_profile_on_signup` trigger function has a mutable search_path.
When the trigger fires from `auth.users`, the search_path may not
include `public`, so the unqualified `INSERT INTO profiles` fails.

Additionally, the `profiles` table has no INSERT RLS policy. While the
SECURITY DEFINER function (owned by `postgres`, the table owner) should
bypass RLS, adding an explicit INSERT policy is correct and eliminates
any edge-case failure.

## Changes
1. Recreate `create_profile_on_signup` with `SET search_path = public`.
2. Recreate `update_updated_at` with `SET search_path = public` (same lint fix).
3. Add INSERT policy on `profiles` for authenticated users (owner-scoped).
4. Revoke EXECUTE from anon/authenticated on the trigger function (not meant
   to be called via REST — only by the trigger).
*/

-- 1. Fix trigger function with explicit search_path
CREATE OR REPLACE FUNCTION create_profile_on_signup() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
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
$$;

-- 2. Fix update_updated_at with explicit search_path
CREATE OR REPLACE FUNCTION update_updated_at() RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- 3. Add missing INSERT policy on profiles (owner-scoped)
DROP POLICY IF EXISTS "insert_own_profile" ON profiles;
CREATE POLICY "insert_own_profile" ON profiles FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = id);

-- 4. Revoke direct EXECUTE on the trigger function from anon and authenticated
REVOKE EXECUTE ON FUNCTION create_profile_on_signup() FROM anon, authenticated;