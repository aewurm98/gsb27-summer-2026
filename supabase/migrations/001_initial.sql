-- Enable UUID extension
create extension if not exists "uuid-ossp";

-- Profiles table (extends auth.users)
create table public.profiles (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid references auth.users(id) on delete cascade not null unique,
  full_name text not null,
  linkedin_url text,
  photo_url text,
  bio text,
  section text,
  pre_mba_company text,
  pre_mba_role text,
  is_admin boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Locations table (up to N stops per classmate, ordered)
create table public.locations (
  id uuid primary key default uuid_generate_v4(),
  profile_id uuid references public.profiles(id) on delete cascade not null,
  city text not null,
  city_ascii text,
  state text,
  country text not null default 'United States',
  lat double precision not null,
  lng double precision not null,
  start_date date,
  end_date date,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

create index locations_profile_id_idx on public.locations(profile_id);
create index locations_city_idx on public.locations(city);

-- Travel interests
create table public.travel_interests (
  id uuid primary key default uuid_generate_v4(),
  profile_id uuid references public.profiles(id) on delete cascade not null,
  destination_city text not null,
  destination_country text not null default 'United States',
  destination_lat double precision,
  destination_lng double precision,
  notes text,
  created_at timestamptz not null default now()
);

create index travel_interests_profile_id_idx on public.travel_interests(profile_id);

-- Treks (admin-created group trip proposals)
create table public.treks (
  id uuid primary key default uuid_generate_v4(),
  title text not null,
  destination_city text not null,
  destination_country text not null default 'United States',
  destination_lat double precision,
  destination_lng double precision,
  proposed_start date,
  proposed_end date,
  description text,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now()
);

-- Trek interest (classmate ↔ trek)
create table public.trek_interests (
  id uuid primary key default uuid_generate_v4(),
  trek_id uuid references public.treks(id) on delete cascade not null,
  profile_id uuid references public.profiles(id) on delete cascade not null,
  status text not null check (status in ('interested', 'confirmed', 'declined')) default 'interested',
  created_at timestamptz not null default now(),
  unique(trek_id, profile_id)
);

-- Auto-update updated_at on profiles
create or replace function public.handle_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger profiles_updated_at
  before update on public.profiles
  for each row execute function public.handle_updated_at();

-- Auto-create profile stub on new user signup
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer as $$
begin
  insert into public.profiles (user_id, full_name)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1))
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Row Level Security
alter table public.profiles enable row level security;
alter table public.locations enable row level security;
alter table public.travel_interests enable row level security;
alter table public.treks enable row level security;
alter table public.trek_interests enable row level security;

-- Profiles: everyone can read, only owner can update
create policy "Profiles are viewable by authenticated users"
  on public.profiles for select to authenticated using (true);

create policy "Users can update own profile"
  on public.profiles for update to authenticated
  using (user_id = auth.uid());

create policy "Users can insert own profile"
  on public.profiles for insert to authenticated
  with check (user_id = auth.uid());

-- Admin can do anything on profiles
create policy "Admins can do anything on profiles"
  on public.profiles for all to authenticated
  using (exists (select 1 from public.profiles p where p.user_id = auth.uid() and p.is_admin = true));

-- Locations: everyone can read, only owner can modify
create policy "Locations viewable by authenticated"
  on public.locations for select to authenticated using (true);

create policy "Users can manage own locations"
  on public.locations for all to authenticated
  using (profile_id in (select id from public.profiles where user_id = auth.uid()));

-- Travel interests
create policy "Travel interests viewable by authenticated"
  on public.travel_interests for select to authenticated using (true);

create policy "Users can manage own travel interests"
  on public.travel_interests for all to authenticated
  using (profile_id in (select id from public.profiles where user_id = auth.uid()));

-- Treks: everyone can read, only admins can create/update/delete
create policy "Treks viewable by authenticated"
  on public.treks for select to authenticated using (true);

create policy "Admins can manage treks"
  on public.treks for all to authenticated
  using (exists (select 1 from public.profiles p where p.user_id = auth.uid() and p.is_admin = true));

-- Trek interests: everyone can read own, can manage own
create policy "Trek interests viewable by authenticated"
  on public.trek_interests for select to authenticated using (true);

create policy "Users can manage own trek interests"
  on public.trek_interests for all to authenticated
  using (profile_id in (select id from public.profiles where user_id = auth.uid()));
