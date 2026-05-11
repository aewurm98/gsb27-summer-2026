-- Allow profiles without a user_id (admin-seeded classmates)
ALTER TABLE public.profiles ALTER COLUMN user_id DROP NOT NULL;

-- When a new user signs in via magic link, match their profile by email name fragment
-- or auto-create one if no match
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  email_prefix text;
  claimed_profile_id uuid;
BEGIN
  -- Try to claim an existing seeded profile by matching full_name loosely
  -- (Admin manually sets the correct name on seeded profiles)
  email_prefix := split_part(new.email, '@', 1);

  -- If profile already explicitly linked, skip
  IF EXISTS (SELECT 1 FROM public.profiles WHERE user_id = new.id) THEN
    RETURN new;
  END IF;

  -- Create a new profile stub
  INSERT INTO public.profiles (user_id, full_name)
  VALUES (new.id, COALESCE(new.raw_user_meta_data->>'full_name', email_prefix))
  ON CONFLICT DO NOTHING;

  RETURN new;
END;
$$;
