-- Vermieter module - explicit, independently-editable headcount on a lease,
-- used by the 'persons' allocation key instead of counting linked
-- vermieter_lease_tenants rows (a landlord may need e.g. 3 for a household
-- with 2 non-tenant children living there too) - see services/leases.ts and
-- services/statementCalculation.ts. Nullable at the column level; the
-- create-lease flow always defaults it to the linked-tenant count when the
-- caller doesn't supply one, and it's never silently recomputed on update
-- (same independence model as cold_rent_cents, which is only ever changed
-- via POST .../leases/:id/rent-changes, not updateLease).
ALTER TABLE vermieter_leases ADD COLUMN person_count INTEGER;

-- Backfill: every existing lease (this module already has real test data in
-- the dev DB from earlier sessions) defaults to its currently-linked tenant
-- count, matching create-time default behavior.
UPDATE vermieter_leases
SET person_count = (
  SELECT COUNT(*) FROM vermieter_lease_tenants lt WHERE lt.lease_id = vermieter_leases.id
)
WHERE person_count IS NULL;
