import type { FinancialParams, AnnualYield, AnnualCashFlow, FinancialAnalysis } from "./types.js";

/**
 * Parameters for financial analysis.
 * @public
 */
export interface EconomicsInput {
  /** Annual energy production in kWh (first year). */
  readonly annualEnergy: number;
  /** Financial parameters for the system. */
  readonly financial: FinancialParams;
  /** Analysis period in years (default 25). */
  readonly analysisPeriod?: number;
  /** Self-consumption ratio (0-1, default 1). */
  readonly selfConsumption?: number;
  /** Annual degradation rate (0-1, default 0.005). */
  readonly degradationRate?: number;
  /** Annual electricity price escalation (0-1, default 0.02). */
  readonly annualEscalation?: number;
}

/**
 * Result of a payback period calculation.
 * @public
 */
export interface PaybackResult {
  /** Simple payback period in years. */
  readonly simple: number;
  /** Discounted payback period in years. */
  readonly discounted: number;
  /** Year when cumulative savings turn positive. */
  readonly breakEvenYear: number;
}

/**
 * Result of a net metering savings calculation.
 * @public
 */
export interface NetMeteringResult {
  /** Annual savings from self-consumption ($). */
  readonly selfConsumptionSavings: number;
  /** Annual savings from exported energy ($). */
  readonly exportSavings: number;
  /** Total annual savings ($). */
  readonly totalSavings: number;
  /** Exported energy (kWh). */
  readonly exportedEnergy: number;
  /** Self-consumed energy (kWh). */
  readonly selfConsumedEnergy: number;
}

/**
 * Complete economic analysis result.
 * @public
 */
export interface EconomicsResult {
  /** Payback period results. */
  readonly payback: PaybackResult;
  /** Net present value ($). */
  readonly netPresentValue: number;
  /** Internal rate of return (fraction 0-1). */
  readonly internalRateOfReturn: number;
  /** Levelized cost of energy ($/kWh). */
  readonly levelizedCost: number;
  /** Lifetime savings ($). */
  readonly lifetimeSavings: number;
  /** Annual cash flow projections. */
  readonly cashFlows: readonly AnnualCashFlow[];
  /** Net metering savings breakdown (first year). */
  readonly netMetering: NetMeteringResult;
}

/**
 * Calculate simple and discounted payback period.
 * @param input - Economic analysis input parameters
 * @returns Payback period results
 * @throws {RangeError} If annualEnergy ≤ 0 or systemCost ≤ 0
 * @example
 * const payback = calculatePayback({
 *   annualEnergy: 5000,
 *   financial: { systemCost: 15000, electricityRate: 0.15 }
 * });
 */
export function calculatePayback(input: EconomicsInput): PaybackResult {
  const { annualEnergy, financial } = input;
  if (annualEnergy <= 0) {
    throw new RangeError("annualEnergy must be greater than 0");
  }
  if (financial.systemCost <= 0) {
    throw new RangeError("systemCost must be greater than 0");
  }

  const selfConsumption = input.selfConsumption ?? 1;
  const degradation = input.degradationRate ?? 0.005;
  const escalation = input.annualEscalation ?? financial.annualEscalation ?? 0.02;
  const discountRate = financial.discountRate ?? 0.05;
  const taxCredit = financial.taxCredit ?? 0;
  const insurance = financial.insuranceCost ?? 0;
  const maintenance = financial.maintenanceCost ?? 0;
  const netMeteringRate = financial.netMeteringRate ?? financial.electricityRate;

  const initialCost = financial.systemCost * (1 - taxCredit);
  let cumulativeSimple = -initialCost;
  let cumulativeDiscounted = -initialCost;
  let simplePayback = Number.POSITIVE_INFINITY;
  let discountedPayback = Number.POSITIVE_INFINITY;
  let breakEvenYear = Number.POSITIVE_INFINITY;

  for (let year = 1; year <= 50; year++) {
    const degradationFactor = Math.pow(1 - degradation, year - 1);
    const energyProduced = annualEnergy * degradationFactor;
    const selfConsumed = energyProduced * selfConsumption;
    const exported = energyProduced - selfConsumed;
    const energyValue = selfConsumed * financial.electricityRate * Math.pow(1 + escalation, year - 1) +
      exported * netMeteringRate * Math.pow(1 + escalation, year - 1);
    const expenses = insurance + maintenance;
    const netSavings = energyValue - expenses;
    const discountedSavings = netSavings / Math.pow(1 + discountRate, year);

    cumulativeSimple += netSavings;
    cumulativeDiscounted += discountedSavings;

    if (cumulativeSimple >= 0 && simplePayback === Number.POSITIVE_INFINITY) {
      simplePayback = year - 1 + Math.max(0, -cumulativeSimple + netSavings) / netSavings;
    }
    if (cumulativeDiscounted >= 0 && discountedPayback === Number.POSITIVE_INFINITY) {
      discountedPayback = year - 1 + Math.max(0, -cumulativeDiscounted + discountedSavings) / discountedSavings;
    }
    if (cumulativeSimple >= 0 && year < breakEvenYear) {
      breakEvenYear = year;
    }

    if (year > 25 && cumulativeSimple > initialCost * 10) break;
  }

  return {
    simple: Math.min(simplePayback, 50),
    discounted: Math.min(discountedPayback, 50),
    breakEvenYear: Math.min(breakEvenYear, 50),
  };
}

/**
 * Calculate levelized cost of energy (LCOE) in $/kWh.
 * @param input - Economic analysis input parameters
 * @returns LCOE value
 * @throws {RangeError} If annualEnergy ≤ 0
 * @example
 * const lcoe = calculateLCOE({
 *   annualEnergy: 5000,
 *   financial: { systemCost: 15000, discountRate: 0.05 }
 * });
 */
export function calculateLCOE(input: EconomicsInput): number {
  const { annualEnergy, financial } = input;
  if (annualEnergy <= 0) {
    throw new RangeError("annualEnergy must be greater than 0");
  }

  const period = input.analysisPeriod ?? 25;
  const degradation = input.degradationRate ?? 0.005;
  const discountRate = financial.discountRate ?? 0.05;
  const taxCredit = financial.taxCredit ?? 0;
  const insurance = financial.insuranceCost ?? 0;
  const maintenance = financial.maintenanceCost ?? 0;

  let presentValueCosts = financial.systemCost * (1 - taxCredit);
  let presentValueEnergy = 0;

  for (let year = 1; year <= period; year++) {
    const discountFactor = 1 / Math.pow(1 + discountRate, year);
    presentValueCosts += (insurance + maintenance) * discountFactor;
    const energy = annualEnergy * Math.pow(1 - degradation, year - 1);
    presentValueEnergy += energy * discountFactor;
  }

  return presentValueCosts / presentValueEnergy;
}

/**
 * Calculate net metering savings breakdown for the first year.
 * @param input - Economic analysis input parameters
 * @returns Net metering savings result
 * @throws {RangeError} If annualEnergy ≤ 0
 * @example
 * const savings = calculateNetMeteringSavings({
 *   annualEnergy: 5000,
 *   financial: { electricityRate: 0.15, netMeteringRate: 0.10 },
 *   selfConsumption: 0.7
 * });
 */
export function calculateNetMeteringSavings(input: EconomicsInput): NetMeteringResult {
  const { annualEnergy, financial } = input;
  if (annualEnergy <= 0) {
    throw new RangeError("annualEnergy must be greater than 0");
  }

  const selfConsumption = input.selfConsumption ?? 1;
  const selfConsumed = annualEnergy * selfConsumption;
  const exported = annualEnergy - selfConsumed;
  const netMeteringRate = financial.netMeteringRate ?? financial.electricityRate;
  const selfConsumptionSavings = selfConsumed * financial.electricityRate;
  const exportSavings = exported * netMeteringRate;
  const totalSavings = selfConsumptionSavings + exportSavings;

  return {
    selfConsumptionSavings,
    exportSavings,
    totalSavings,
    exportedEnergy: exported,
    selfConsumedEnergy: selfConsumed,
  };
}

/**
 * Perform a complete economic analysis including NPV, IRR, LCOE, and cash flows.
 * @param input - Economic analysis input parameters
 * @returns Complete economic analysis result
 * @throws {RangeError} If annualEnergy ≤ 0 or systemCost ≤ 0
 * @example
 * const analysis = analyzeEconomics({
 *   annualEnergy: 5000,
 *   financial: { systemCost: 15000, electricityRate: 0.15, discountRate: 0.05 }
 * });
 */
export function analyzeEconomics(input: EconomicsInput): EconomicsResult {
  const { annualEnergy, financial } = input;
  if (annualEnergy <= 0) {
    throw new RangeError("annualEnergy must be greater than 0");
  }
  if (financial.systemCost <= 0) {
    throw new RangeError("systemCost must be greater than 0");
  }

  const period = input.analysisPeriod ?? 25;
  const degradation = input.degradationRate ?? 0.005;
  const escalation = input.annualEscalation ?? financial.annualEscalation ?? 0.02;
  const discountRate = financial.discountRate ?? 0.05;
  const taxCredit = financial.taxCredit ?? 0;
  const insurance = financial.insuranceCost ?? 0;
  const maintenance = financial.maintenanceCost ?? 0;
  const netMeteringRate = financial.netMeteringRate ?? financial.electricityRate;
  const selfConsumption = input.selfConsumption ?? 1;

  const initialCost = financial.systemCost * (1 - taxCredit);
  const cashFlows: AnnualCashFlow[] = [];
  let cumulativeSavings = -initialCost;

  for (let year = 1; year <= period; year++) {
    const degradationFactor = Math.pow(1 - degradation, year - 1);
    const energyProduced = annualEnergy * degradationFactor;
    const selfConsumed = energyProduced * selfConsumption;
    const exported = energyProduced - selfConsumed;
    const energyValue = selfConsumed * financial.electricityRate * Math.pow(1 + escalation, year - 1) +
      exported * netMeteringRate * Math.pow(1 + escalation, year - 1);
    const expenses = insurance + maintenance;
    const netSavings = energyValue - expenses;
    cumulativeSavings += netSavings;

    cashFlows.push({
      year,
      energyValue,
      expenses,
      netSavings,
      cumulativeSavings,
    });
  }

  const cashFlowSeries = [-initialCost, ...cashFlows.map(cf => cf.netSavings)];
  const npv = calculateNPV(cashFlowSeries, discountRate);
  const irr = calculateIRR(cashFlowSeries);
  const lcoe = calculateLCOE(input);
  const payback = calculatePayback(input);
  const netMetering = calculateNetMeteringSavings(input);
  const lifetimeSavings = cashFlows.reduce((sum, cf) => sum + cf.netSavings, -initialCost);

  return {
    payback,
    netPresentValue: npv,
    internalRateOfReturn: irr,
    levelizedCost: lcoe,
    lifetimeSavings,
    cashFlows,
    netMetering,
  };
}

/**
 * Calculate net present value of a cash flow series.
 * @param cashFlows - Array of cash flows (year 0 first)
 * @param discountRate - Discount rate (fraction)
 * @returns NPV value
 */
function calculateNPV(cashFlows: readonly number[], discountRate: number): number {
  return cashFlows.reduce((npv, cashFlow, year) => {
    return npv + cashFlow / Math.pow(1 + discountRate, year);
  }, 0);
}

/**
 * Calculate internal rate of return using Newton-Raphson iteration.
 * @param cashFlows - Array of cash flows (year 0 first)
 * @returns IRR as fraction (0-1)
 */
function calculateIRR(cashFlows: readonly number[]): number {
  const maxIterations = 100;
  const tolerance = 1e-6;
  let rate = 0.1;

  for (let i = 0; i < maxIterations; i++) {
    let npv = 0;
    let derivative = 0;

    for (let year = 0; year < cashFlows.length; year++) {
      const factor = Math.pow(1 + rate, year);
      npv += cashFlows[year] / factor;
      derivative -= year * cashFlows[year] / Math.pow(1 + rate, year + 1);
    }

    if (Math.abs(npv) < tolerance) {
      return Math.max(-0.5, Math.min(rate, 1));
    }

    if (Math.abs(derivative) < 1e-12) {
      break;
    }

    rate -= npv / derivative;
  }

  return Math.max(-0.5, Math.min(rate, 1));
}