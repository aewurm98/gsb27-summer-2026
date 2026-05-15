-- Phase 1 v2: richer travel preference fields
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS travel_budget text
    CHECK (travel_budget IN ('budget', 'moderate', 'splurge') OR travel_budget IS NULL),
  ADD COLUMN IF NOT EXISTS travel_pace text
    CHECK (travel_pace IN ('fast-paced', 'balanced', 'slow-immersive') OR travel_pace IS NULL);
