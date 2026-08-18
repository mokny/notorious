-- Vermieter module - additional context persisted per statement line:
--  - basis_numerator/basis_denominator: the raw allocation-basis numbers
--    (e.g. the unit's own sqm and the circuit's total sqm) that PRODUCE a
--    line's percentage - lets the PDF's per-tenant explanation paragraph
--    (pdf/explanationText.ts) show the underlying fraction, not just the
--    resulting percentage. Null for fixed_manual/external_provider lines,
--    which have no allocation-key fraction to explain.
--  - external_provider_name: the metering-service name (e.g. "Techem") an
--    'external_provider'-mode line's cost was transcribed from - see
--    migrations/0012 and services/statementCalculation.ts.
-- A statement is a point-in-time legal snapshot (see
-- services/statementCalculation.ts's doc comment), so this is captured once
-- at generation time, not recomputed live.
ALTER TABLE vermieter_statement_lines ADD COLUMN basis_numerator REAL;
ALTER TABLE vermieter_statement_lines ADD COLUMN basis_denominator REAL;
ALTER TABLE vermieter_statement_lines ADD COLUMN external_provider_name TEXT;
