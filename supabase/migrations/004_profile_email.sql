-- Add email to profiles for admin pre-seeding and auto-claiming on signup
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS email text;

-- Unique index: only one profile per email (nulls excluded)
CREATE UNIQUE INDEX IF NOT EXISTS profiles_email_unique
  ON public.profiles (email)
  WHERE email IS NOT NULL;

-- Update trigger: claim pre-seeded profile by email on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  claimed_profile_id uuid;
BEGIN
  -- Guard: already linked
  IF EXISTS (SELECT 1 FROM public.profiles WHERE user_id = new.id) THEN
    RETURN new;
  END IF;

  -- Try to claim a pre-seeded profile with matching email
  SELECT id INTO claimed_profile_id
  FROM public.profiles
  WHERE email = new.email
    AND user_id IS NULL
  LIMIT 1;

  IF claimed_profile_id IS NOT NULL THEN
    UPDATE public.profiles
    SET user_id = new.id
    WHERE id = claimed_profile_id;
    RETURN new;
  END IF;

  -- No pre-seeded match — create a fresh profile stub
  INSERT INTO public.profiles (user_id, full_name, email)
  VALUES (
    new.id,
    COALESCE(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1)),
    new.email
  )
  ON CONFLICT DO NOTHING;

  RETURN new;
END;
$$;
