import { describe, it, expect } from "bun:test";
import {
  getSunPosition,
  calculateMonthlyYield,
  calculateAnnualYield,
  calculateStringSizing,
  calculatePayback,
  fetchWeatherData,
  createLocationPicker,
  type Location,
  type PanelConfig,
  type DeratingFactors,
  type StringSizingParams,
  type EconomicsInput,
  type MonthlyYield,
  type AnnualYield,
  type StringSizingResult,
  type PaybackResult,
  type WeatherDataWithIrradiance,
  type FetchWeatherOptions,
} from "../src/index";

describe("solar-calc", () => {
  const sampleLocation: Location = {
    latitude: 40.7128,
    longitude: -74.0060,
    elevation: 10,
  };

  const samplePanel: PanelConfig = {
    tilt: 30,
    azimuth: 180,
    ratedPower: 300,
    temperatureCoefficient: -0.4,
    panelArea: 1.6,
  };

  const sampleDerating: DeratingFactors = {
    soiling: 0.95,
    shading: 0.98,
    wiringLosses: 0.98,
    mismatch: 0.98,
    inverterEfficiency: 0.96,
    availability: 0.99,
    age: 1,
  };

  it("calculates sun position for a known location and date", () => {
    const date = new Date("2024-06-21T12:00:00Z");
    const position = getSunPosition(sampleLocation, date);

    expect(position).toBeDefined();
    expect(position.altitude).toBeGreaterThan(0);
    expect(position.altitude).toBeLessThan(90);
    expect(position.azimuth).toBeGreaterThanOrEqual(0);
    expect(position.azimuth).toBeLessThan(360);
    expect(position.zenith).toBeCloseTo(90 - position.altitude, 5);
  });

  it("calculates monthly yield with realistic derating factors", () => {
    const weatherData = {
      location: sampleLocation,
      monthlyTemperatures: [
        { month: 1, averageHigh: 0, averageLow: -5 },
        { month: 2, averageHigh: 1, averageLow: -4 },
        { month: 3, averageHigh: 5, averageLow: 0 },
        { month: 4, averageHigh: 10, averageLow: 5 },
        { month: 5, averageHigh: 15, averageLow: 10 },
        { month: 6, averageHigh: 20, averageLow: 15 },
        { month: 7, averageHigh: 25, averageLow: 20 },
        { month: 8, averageHigh: 24, averageLow: 19 },
        { month: 9, averageHigh: 20, averageLow: 15 },
        { month: 10, averageHigh: 14, averageLow: 9 },
        { month: 11, averageHigh: 8, averageLow: 3 },
        { month: 12, averageHigh: 2, averageLow: -2 },
      ],
      averageAnnualTemp: 10,
    };

    const monthly = calculateMonthlyYield(
      sampleLocation,
      samplePanel,
      sampleDerating,
      weatherData
    );

    expect(monthly).toHaveLength(12);
    monthly.forEach((monthYield, index) => {
      expect(monthYield.month).toBe(index + 1);
      expect(monthYield.energy).toBeGreaterThan(0);
      expect(monthYield.peakSunHours).toBeGreaterThan(0);
      expect(monthYield.averageEfficiency).toBeGreaterThan(0);
    });

    const juneYield = monthly.find((m) => m.month === 6);
    const decemberYield = monthly.find((m) => m.month === 12);
    expect(juneYield!.energy).toBeGreaterThan(decemberYield!.energy);
  });

  it("calculates annual yield from monthly results", () => {
    const monthlyYields: MonthlyYield[] = [
      { month: 1, energy: 50, peakSunHours: 3, averageEfficiency: 0.15 },
      { month: 2, energy: 60, peakSunHours: 3.5, averageEfficiency: 0.16 },
      { month: 3, energy: 80, peakSunHours: 4, averageEfficiency: 0.17 },
      { month: 4, energy: 100, peakSunHours: 4.5, averageEfficiency: 0.18 },
      { month: 5, energy: 120, peakSunHours: 5, averageEfficiency: 0.19 },
      { month: 6, energy: 130, peakSunHours: 5.5, averageEfficiency: 0.2 },
      { month: 7, energy: 140, peakSunHours: 5.8, averageEfficiency: 0.21 },
      { month: 8, energy: 130, peakSunHours: 5.5, averageEfficiency: 0.2 },
      { month: 9, energy: 110, peakSunHours: 4.8, averageEfficiency: 0.19 },
      { month: 10, energy: 90, peakSunHours: 4.2, averageEfficiency: 0.18 },
      { month: 11, energy: 70, peakSunHours: 3.8, averageEfficiency: 0.17 },
      { month: 12, energy: 55, peakSunHours: 3.2, averageEfficiency: 0.16 },
    ];

    const annual = calculateAnnualYield(monthlyYields);

    expect(annual.totalEnergy).toBeGreaterThan(0);
    expect(annual.capacityFactor).toBeGreaterThan(0);
    expect(annual.capacityFactor).toBeLessThan(1);
    expect(annual.monthlyBreakdown).toHaveLength(12);
  });

  it("calculates string sizing for valid inverter configuration", () => {
    const params: StringSizingParams = {
      panelVoc: 45,
      panelIsc: 10,
      panelVmp: 38,
      panelImp: 9.5,
      inverterMpptMin: 200,
      inverterMpptMax: 600,
      inverterMaxCurrent: 15,
      maxStringVoltage: 550,
      safetyFactor: 1.1,
    };

    const sizing = calculateStringSizing(params);

    expect(sizing.minPanelsPerString).toBeGreaterThan(0);
    expect(sizing.maxPanelsPerString).toBeGreaterThanOrEqual(
      sizing.minPanelsPerString
    );
    expect(sizing.recommendedStrings).toBeGreaterThanOrEqual(1);
    expect(sizing.maxStringsPerInverter).toBeGreaterThan(0);
    expect(sizing.maxPower).toBeGreaterThan(0);
    expect(typeof sizing.isWithinLimits).toBe("boolean");
  });

  it("calculates payback period for typical residential system", () => {
    const financialInput: EconomicsInput = {
      annualEnergy: 5000,
      financial: {
        systemCost: 15000,
        electricityRate: 0.15,
        netMeteringRate: 0.08,
        discountRate: 0.05,
        taxCredit: 0.3,
        insuranceCost: 100,
        maintenanceCost: 100,
        degradationRate: 0.005,
        annualEscalation: 0.02,
      },
      selfConsumption: 0.7,
      degradationRate: 0.005,
      annualEscalation: 0.02,
    };

    const payback = calculatePayback(financialInput);

    expect(payback.simple).toBeGreaterThan(0);
    expect(payback.discounted).toBeGreaterThanOrEqual(payback.simple);
    expect(payback.breakEvenYear).toBeGreaterThan(0);
  });

  it("exports fetchWeatherData and weather types", () => {
    expect(typeof fetchWeatherData).toBe("function");
  });

  it("exports createLocationPicker", () => {
    expect(typeof createLocationPicker).toBe("function");
  });
});
