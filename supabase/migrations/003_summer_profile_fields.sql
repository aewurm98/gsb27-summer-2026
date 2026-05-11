-- Remove pre-MBA / irrelevant columns
ALTER TABLE public.profiles DROP COLUMN IF EXISTS pre_mba_company;
ALTER TABLE public.profiles DROP COLUMN IF EXISTS pre_mba_role;
ALTER TABLE public.profiles DROP COLUMN IF EXISTS linkedin_url;
ALTER TABLE public.profiles DROP COLUMN IF EXISTS bio;

-- Add summer-relevant profile columns
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS additional_details text;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS can_host boolean NOT NULL DEFAULT false;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS hosting_details text;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS open_to_visit boolean NOT NULL DEFAULT false;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS has_completed_profile boolean NOT NULL DEFAULT false;

-- Add experience metadata to locations (each location is now a "summer experience")
ALTER TABLE public.locations ADD COLUMN IF NOT EXISTS label text;    -- "Summer Internship", "Traveling", "Visiting family", "Other"
ALTER TABLE public.locations ADD COLUMN IF NOT EXISTS company text;  -- optional
ALTER TABLE public.locations ADD COLUMN IF NOT EXISTS role text;     -- optional

-- Add date range to travel interests (for trek coordination)
ALTER TABLE public.travel_interests ADD COLUMN IF NOT EXISTS interest_start_date date;
ALTER TABLE public.travel_interests ADD COLUMN IF NOT EXISTS interest_end_date date;
