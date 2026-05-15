-- Optional neighborhood/area for more descriptive map popup display
ALTER TABLE locations
  ADD COLUMN IF NOT EXISTS neighborhood text;
