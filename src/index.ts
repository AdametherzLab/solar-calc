import type {
  Location,
  PanelConfig,
  SunPosition,
  Irradiance,
  MonthlyYield,
  AnnualYield,
  DeratingFactors,
  StringSizingParams,
  StringSizingResult,
  FinancialParams,
  AnnualCashFlow,
  FinancialAnalysis,
  SystemConfig,
  CalculationResult,
  MonthlyTemperature,
  WeatherData,
  DeepReadonly,
  ValidationError,
  ValidationResult,
} from "./types.js";

import type {
  AtmosphericConditions,
  SolarValidationError,
} from "./solar.js";

import type {
  EconomicsInput,
  PaybackResult,
  NetMeteringResult,
  EconomicsResult,
} from "./economics.js";

import type {
  MonthlyIrradiance,
  WeatherDataWithIrradiance,
  FetchWeatherOptions,
} from "./weather.js";

export {
  Location,
  PanelConfig,
  SunPosition,
  Irradiance,
  MonthlyYield,
  AnnualYield,
  DeratingFactors,
  StringSizingParams,
  StringSizingResult,
  FinancialParams,
  AnnualCashFlow,
  FinancialAnalysis,
  SystemConfig,
  CalculationResult,
  MonthlyTemperature,
  WeatherData,
  DeepReadonly,
  ValidationError,
  ValidationResult,
  AtmosphericConditions,
  SolarValidationError,
  EconomicsInput,
  PaybackResult,
  NetMeteringResult,
  EconomicsResult,
  MonthlyIrradiance,
  WeatherDataWithIrradiance,
  FetchWeatherOptions,
};

export {
  getSunPosition,
  getIrradiance,
  estimatePeakSunHours,
  getOptimalTilt,
  calculateDailySolar,
  saveSolarData,
  loadSolarData,
} from "./solar.js";

export {
  calculateMonthlyYield,
  calculateAnnualYield,
  calculateStringSizing,
} from "./yield.js";

export {
  calculatePayback,
  calculateLCOE,
  calculateNetMeteringSavings,
  analyzeEconomics,
} from "./economics.js";

export {
  fetchWeatherData,
} from "./weather.js";
