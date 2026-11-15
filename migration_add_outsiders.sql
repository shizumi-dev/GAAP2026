-- Run this ONCE in the Supabase SQL Editor before deploying the outsider feature.
-- Existing participant records are preserved.

ALTER TABLE registrations
  ADD COLUMN IF NOT EXISTS was_sti_student BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE registrations
  DROP CONSTRAINT IF EXISTS registrations_division_check;

ALTER TABLE registrations
  DROP CONSTRAINT IF EXISTS registrations_check;

ALTER TABLE registrations
  ADD CONSTRAINT registrations_division_check
  CHECK (division IN ('college', 'senior_high', 'outsider'));

ALTER TABLE registrations
  ADD CONSTRAINT registrations_check
  CHECK (
    (division = 'college' AND course IN ('BSTM','BSIS','BSIT') AND college_year BETWEEN 1 AND 4 AND grade_level IS NULL AND strand IS NULL)
    OR
    (division = 'senior_high' AND grade_level IN (11,12) AND strand IS NOT NULL AND course IS NULL AND college_year IS NULL)
    OR
    (division = 'outsider' AND course IS NULL AND college_year IS NULL AND grade_level IS NULL AND strand IS NULL)
  );
