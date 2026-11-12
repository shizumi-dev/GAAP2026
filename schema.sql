CREATE TABLE IF NOT EXISTS registrations (
  id BIGSERIAL PRIMARY KEY,
  full_name TEXT NOT NULL,
  normalized_name TEXT NOT NULL,
  age SMALLINT NOT NULL CHECK (age BETWEEN 10 AND 100),
  division TEXT NOT NULL CHECK (division IN ('college','senior_high')),
  course TEXT,
  college_year SMALLINT,
  grade_level SMALLINT,
  strand TEXT,
  conditions_acknowledged BOOLEAN NOT NULL DEFAULT FALSE,
  payment_method TEXT NOT NULL DEFAULT 'offline',
  payment_status TEXT NOT NULL DEFAULT 'pending' CHECK (payment_status IN ('pending','paid')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (
    (division = 'college' AND course IN ('BSTM','BSIT') AND college_year BETWEEN 1 AND 4 AND grade_level IS NULL AND strand IS NULL)
    OR
    (division = 'senior_high' AND grade_level IN (11,12) AND strand IS NOT NULL AND course IS NULL AND college_year IS NULL)
  )
);
CREATE INDEX IF NOT EXISTS registrations_created_at_idx ON registrations(created_at);
CREATE INDEX IF NOT EXISTS registrations_division_idx ON registrations(division);
