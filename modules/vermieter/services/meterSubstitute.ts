import type { VermieterEstimationMethod } from "../db/types.js";

/**
 * §9a HeizkostenV substitute-value (Ersatzwert) resolution for a single
 * consumption-based cost pool (one Abrechnungskreis x one meter kind, e.g.
 * "heating" or "water" - see statementCalculation.ts's `computeHeatingLines`/
 * `computeConsumptionLines`, the only callers). Pure/side-effect-free like
 * the rest of statementCalculation.ts - services/statements.ts gathers the
 * DB data (current-period and prior-comparable-period metered consumption
 * per unit) and this function just does the §9a math.
 *
 * Note this only ever runs over the units that are *members of the cost
 * circuit* in the first place - a unit with an entirely different heat/water
 * source (e.g. its own electric Durchlauferhitzer) is excluded from the pool
 * one level up, by not being in the circuit at all, not by anything here.
 * This resolver's job is narrower: among units that DO share the pool, some
 * individually lack their own meter (or lack full-period readings), and
 * still need a fair, legally-grounded substitute charge rather than being
 * silently dropped to 0.
 *
 * Resolution order per unit, per §9a HeizkostenV:
 *  1. `metered` - a real reading-delta for this unit covering the period.
 *  2. `substitute_own_history` - this same unit's own metered consumption
 *     from a prior comparable period (e.g. the same meter, readings from
 *     before it stopped being read) - the law's preferred substitute.
 *  3. `substitute_comparable_units` - average consumption-per-m² among
 *     OTHER units in the same pool that DO have real metered consumption
 *     for this period, scaled by this unit's own size.
 *  4. `substitute_sqm_fallback` - when not even (3) is available (no unit in
 *     the whole pool has real metered data this period), a pure sqm-
 *     proportional share. This is the only branch that's an unsubstantiated
 *     estimate rather than a legally-grounded §9a substitute, hence its own
 *     distinct method tag.
 *
 * A resolved value is never indistinguishable from a real one in the
 * output - every result carries its `method` and `isEstimated` (true for
 * every branch except `metered`) so the caller can flag it (see
 * `vermieter_statement_lines.is_estimated`/`.estimation_method` and
 * pdf/render.ts's footnote marker).
 */

export interface UnitConsumptionInput {
  unitId: string;
  sizeSqm: number;
  /** Real metered consumption for this unit within the statement period, or null when there isn't a full reading-pair (no meter, or a gap) to compute one from. */
  currentPeriodValue: number | null;
  /** Real metered consumption for this SAME unit within a prior comparable period (same length, immediately preceding), or null when unavailable. Only ever used when currentPeriodValue is null. */
  priorPeriodValue: number | null;
}

export interface ResolvedUnitConsumption {
  unitId: string;
  value: number;
  method: VermieterEstimationMethod;
  isEstimated: boolean;
}

export function resolveCircuitConsumption(units: UnitConsumptionInput[]): ResolvedUnitConsumption[] {
  const metered = units.filter((u) => u.currentPeriodValue !== null);
  const totalMeteredConsumption = metered.reduce((sum, u) => sum + (u.currentPeriodValue ?? 0), 0);
  const totalMeteredSqm = metered.reduce((sum, u) => sum + u.sizeSqm, 0);
  const avgConsumptionPerSqm = totalMeteredSqm > 0 ? totalMeteredConsumption / totalMeteredSqm : null;

  return units.map((unit): ResolvedUnitConsumption => {
    if (unit.currentPeriodValue !== null) {
      return { unitId: unit.unitId, value: unit.currentPeriodValue, method: "metered", isEstimated: false };
    }
    if (unit.priorPeriodValue !== null) {
      return { unitId: unit.unitId, value: unit.priorPeriodValue, method: "substitute_own_history", isEstimated: true };
    }
    if (avgConsumptionPerSqm !== null) {
      return {
        unitId: unit.unitId,
        value: avgConsumptionPerSqm * unit.sizeSqm,
        method: "substitute_comparable_units",
        isEstimated: true,
      };
    }
    // Nobody in the whole pool has real metered data this period - fall back
    // to a pure sqm-proportional split. Using sizeSqm itself as the
    // "consumption" value is deliberate: every unit gets the same
    // fallback treatment, so normalizing proportionally across these values
    // (as computeHeatingLines/computeConsumptionLines already do for real
    // consumption) reduces exactly to an sqm-proportional cost split.
    return { unitId: unit.unitId, value: unit.sizeSqm, method: "substitute_sqm_fallback", isEstimated: true };
  });
}
