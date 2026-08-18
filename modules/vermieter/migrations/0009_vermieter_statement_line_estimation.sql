-- Vermieter module - flags a statement line's unit share as a §9a HeizkostenV
-- substitute-value estimate rather than a real metered amount, so the PDF/UI
-- can visibly mark it (never let an estimate look identical to a metered
-- value in the output). See services/meterSubstitute.ts for the algorithm
-- and services/statementCalculation.ts for how it's threaded through.
ALTER TABLE vermieter_statement_lines ADD COLUMN is_estimated INTEGER NOT NULL DEFAULT 0;
ALTER TABLE vermieter_statement_lines ADD COLUMN estimation_method TEXT;
