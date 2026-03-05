// REMOVED external import: import type { ReadonlyDeep } from "type-fest";

/**
 * Geographic location with latitude, longitude, and optional elevation.
 * Latitude must be between -90 and 90 degrees.
 * Longitude must be between -180 and 180 degrees.
 * Elevation is in meters above sea level.
 */
export interface Location {
  readonly latitude: number; // degrees, -90 to 90
  readonly longitude: number; // degrees, -180 to 180
  readonly elevation?: number; // meters, optional
}

/**
 * Solar panel configuration for a single array.
 */
export interface PanelConfig {
  readonly tilt: number; // degrees from horizontal (0-90)
  readonly azimuth: number; // degrees from true north (0-360)
  readonly ratedPower: number; // Watts (W)
  readonly temperatureCoefficient?: number; // % per °C, typically -0.3 to -0.5
  readonly panelArea?: number; // square meters (m²), optional
}

/**
 * Sun position at a specific moment.
 * All angles are in degrees.
 */
export interface SunPosition {
  readonly altitude: number; // degrees above horizon (-90 to 90)
  readonly azimuth: number; // degrees from true north (0-360)
  readonly hourAngle: number; // degrees
  readonly declination: number; // degrees
  readonly zenith: number; // degrees (90 - altitude)
}

/**
 * Solar irradiance components on different planes.
 * All values are in watts per square meter (W/m²).
 */
export interface Irradiance {
  readonly directNormal: number; // DNI
  readonly diffuseHorizontal: number; // DHI
  readonly globalHorizontal: number; // GHI
  readonly globalTilted?: number; // GTI (calculated)
}

/**
 * Monthly solar yield result for a specific month.
 */
export interface MonthlyYield {
  readonly month: number; // 1-12 (January = 1)
  readonly energy: number; // kilowatt-hours (kWh)
  readonly peakSunHours: number; // hours
  readonly averageEfficiency: number; // 0-1 (fraction)
}

/**
 * Annual yield summary.
 */
export interface AnnualYield {
  readonly totalEnergy: number; // kWh
  readonly capacityFactor: number; // 0-1 (fraction)
  readonly monthlyBreakdown: readonly MonthlyYield[];
}

/**
 * Factors that derate panel output from STC conditions.
 */
export interface DeratingFactors {
  readonly soiling: number; // 0-1 (fraction)
  readonly shading: number; // 0-1 (fraction)
  readonly wiringLosses: number; // 0-1 (fraction)
  readonly mismatch: number; // 0-1 (fraction)
  readonly age: number; // 0-1 (fraction, 1 = new)
  readonly availability: number; // 0-1 (fraction)
  readonly inverterEfficiency: number; // 0-1 (fraction)
}

/**
 * String sizing parameters for connecting panels to an inverter.
 */
export interface StringSizingParams {
  readonly panelVoc: number; // Open-circuit voltage per panel (V)
  readonly panelIsc: number; // Short-circuit current per panel (A)
  readonly panelVmp: number; // Maximum power voltage per panel (V)
  readonly panelImp: number; // Maximum power current per panel (A)
  readonly inverterMpptMin: number; // Inverter MPPT minimum voltage (V)
  readonly inverterMpptMax: number; // Inverter MPPT maximum voltage (V)
  readonly inverterMaxCurrent: number; // Inverter maximum input current (A)
  readonly maxStringVoltage?: number; // System max voltage (V), optional
  readonly safetyFactor?: number; // Multiplier for cold temperature derate, default 1.1
}

/**
 * String sizing calculation results.
 */
export interface StringSizingResult {
  readonly maxPanelsPerString: number;
  readonly minPanelsPerString: number;
  readonly maxStringsPerInverter: number;
  readonly recommendedStrings: number;
  readonly maxPower: number; // W
  readonly isWithinLimits: boolean;
  readonly coldTempVoltage?: number; // V at lowest expected temperature
}

/**
 * Financial parameters for payback and ROI analysis.
 */
export interface FinancialParams {
  readonly systemCost: number; // Total installed cost (USD)
  readonly electricityRate: number; // $/kWh
  readonly annualEscalation?: number; // % per year (0-1)
  readonly discountRate?: number; // % per year (0-1)
  readonly taxCredit?: number; // % of system cost (0-1)
  readonly insuranceCost?: number; // $/year
  readonly maintenanceCost?: number; // $/year
  readonly degradationRate?: number; // % per year (0-1)
  readonly netMeteringRate?: number; // $/kWh for exported energy
  readonly netMeteringCap?: number; // kWh/year export limit
}

/**
 * Annual cash flow for a specific year.
 */
export interface AnnualCashFlow {
  readonly year: number;
  readonly energyValue: number; // $
  readonly expenses: number; // $
  readonly netSavings: number; // $
  readonly cumulativeSavings: number; // $
}

/**
 * Financial analysis results.
 */
export interface FinancialAnalysis {
  readonly paybackPeriod: number; // years
  readonly netPresentValue: number; // NPV in $
  readonly internalRateOfReturn: number; // IRR as fraction (0-1)
  readonly levelizedCost: number; // LCOE in $/kWh
  readonly lifetimeSavings: number; // $
  readonly cashFlows: readonly AnnualCashFlow[];
}

/**
 * Complete system configuration for a yield calculation.
 */
export interface SystemConfig {
  readonly location: Location;
  readonly panel: PanelConfig;
  readonly derating: DeratingFactors;
  readonly financial?: FinancialParams;
}

/**
 * Complete calculation results.
 */
export interface CalculationResult {
  readonly annualYield: AnnualYield;
  readonly stringSizing?: StringSizingResult;
  readonly financial?: FinancialAnalysis;
  readonly timestamp: Date;
}

/**
 * Temperature data for a specific month.
 */
export interface MonthlyTemperature {
  readonly month: number; // 1-12
  readonly averageHigh: number; // °C
  readonly averageLow: number; // °C
}

/**
 * Weather data for a location.
 */
export interface WeatherData {
  readonly location: Location;
  readonly monthlyTemperatures: readonly MonthlyTemperature[];
  readonly averageAnnualTemp: number; // °C
  readonly koeppenClimate?: string; // e.g., "Cfb"
}

/**
 * Utility type for readonly deep objects.
 */
export type DeepReadonly<T> = ReadonlyDeep<T>;

/**
 * Validation error for invalid parameter ranges.
 */
export class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ValidationError";
  }
}

/**
 * Result of a validation check.
 */
export interface ValidationResult {
  readonly isValid: boolean;
  readonly errors: readonly string[];
}