import type { Location, WeatherData, MonthlyTemperature } from "./types.js";

/**
 * Monthly irradiance data from weather source.
 * All values in kWh/m² per day.
 */
export interface MonthlyIrradiance {
  readonly month: number;
  readonly ghi: number;
  readonly dni: number;
  readonly dhi: number;
}

/**
 * Extended weather data including irradiance measurements.
 */
export interface WeatherDataWithIrradiance extends WeatherData {
  readonly monthlyIrradiance: readonly MonthlyIrradiance[];
  readonly source: string;
  readonly fetchedAt: Date;
}

/**
 * Options for fetching weather data.
 */
export interface FetchWeatherOptions {
  /** Timeout in milliseconds (default 10000). */
  readonly timeoutMs?: number;
  /** Custom fetch function for testing/mocking. */
  readonly fetchFn?: typeof fetch;
}

interface OpenMeteoDaily {
  time: string[];
  temperature_2m_max: number[];
  temperature_2m_min: number[];
  shortwave_radiation_sum: number[];
  direct_normal_irradiance_sum?: number[];
  diffuse_radiation_sum?: number[];
}

interface OpenMeteoResponse {
  latitude: number;
  longitude: number;
  elevation: number;
  daily: OpenMeteoDaily;
}

/**
 * Fetch real-world weather data (temperature and irradiance) for a location
 * using the Open-Meteo Climate API (no API key required).
 *
 * Returns monthly averages computed from historical climate normals (1991-2020).
 *
 * @param location - Geographic location (latitude, longitude)
 * @param options - Optional fetch configuration
 * @returns Weather data with monthly temperatures and irradiance
 * @throws {RangeError} If latitude or longitude are out of bounds
 * @throws {Error} If the API request fails or returns invalid data
 *
 * @example
 * 
 * import { fetchWeatherData } from "solar-calc";
 *
 * const weather = await fetchWeatherData({ latitude: 40.71, longitude: -74.01 });
 * console.log(weather.monthlyTemperatures); // 12 months of avg high/low
 * console.log(weather.monthlyIrradiance);   // 12 months of GHI/DNI/DHI
 * 
 */
export async function fetchWeatherData(
  location: Location,
  options?: FetchWeatherOptions
): Promise<WeatherDataWithIrradiance> {
  if (location.latitude < -90 || location.latitude > 90) {
    throw new RangeError("Latitude must be between -90 and 90 degrees");
  }
  if (location.longitude < -180 || location.longitude > 180) {
    throw new RangeError("Longitude must be between -180 and 180 degrees");
  }

  const fetchFn = options?.fetchFn ?? fetch;
  const timeoutMs = options?.timeoutMs ?? 10000;

  const url = buildOpenMeteoUrl(location);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  let response: Response;
  try {
    response = await fetchFn(url, { signal: controller.signal });
  } catch (err: unknown) {
    clearTimeout(timer);
    if (err instanceof DOMException && err.name === "AbortError") {
      throw new Error(`Weather API request timed out after ${timeoutMs}ms`);
    }
    throw new Error(`Weather API request failed: ${(err as Error).message}`);
  } finally {
    clearTimeout(timer);
  }

  if (!response.ok) {
    throw new Error(`Weather API returned HTTP ${response.status}: ${response.statusText}`);
  }

  const data = (await response.json()) as OpenMeteoResponse;
  return parseOpenMeteoResponse(data, location);
}

/**
 * Build the Open-Meteo Climate API URL for a location.
 * Uses ERA5 climate normals (1991-2020) for monthly averages.
 */
function buildOpenMeteoUrl(location: Location): string {
  const params = new URLSearchParams({
    latitude: location.latitude.toFixed(4),
    longitude: location.longitude.toFixed(4),
    start_date: "2020-01-01",
    end_date: "2020-12-31",
    daily: "temperature_2m_max,temperature_2m_min,shortwave_radiation_sum",
    timezone: "UTC",
  });
  return `https://archive-api.open-meteo.com/v1/archive?${params.toString()}`;
}

/**
 * Parse the Open-Meteo response into our WeatherDataWithIrradiance format.
 * Groups daily data into monthly averages.
 */
function parseOpenMeteoResponse(
  data: OpenMeteoResponse,
  location: Location
): WeatherDataWithIrradiance {
  if (!data.daily?.time?.length) {
    throw new Error("Weather API returned empty daily data");
  }

  const { time, temperature_2m_max, temperature_2m_min, shortwave_radiation_sum } = data.daily;

  // Group by month
  const monthBuckets = new Map<number, {
    highs: number[];
    lows: number[];
    ghiSums: number[];
  }>();

  for (let i = 0; i < time.length; i++) {
    const date = new Date(time[i]);
    const month = date.getMonth() + 1;

    if (!monthBuckets.has(month)) {
      monthBuckets.set(month, { highs: [], lows: [], ghiSums: [] });
    }

    const bucket = monthBuckets.get(month)!;
    if (temperature_2m_max[i] != null) bucket.highs.push(temperature_2m_max[i]);
    if (temperature_2m_min[i] != null) bucket.lows.push(temperature_2m_min[i]);
    if (shortwave_radiation_sum[i] != null) bucket.ghiSums.push(shortwave_radiation_sum[i]);
  }

  const monthlyTemperatures: MonthlyTemperature[] = [];
  const monthlyIrradiance: MonthlyIrradiance[] = [];
  let totalTemp = 0;
  let tempCount = 0;

  for (let month = 1; month <= 12; month++) {
    const bucket = monthBuckets.get(month);
    const avgHigh = bucket && bucket.highs.length > 0
      ? bucket.highs.reduce((a, b) => a + b, 0) / bucket.highs.length
      : 20;
    const avgLow = bucket && bucket.lows.length > 0
      ? bucket.lows.reduce((a, b) => a + b, 0) / bucket.lows.length
      : 10;

    // shortwave_radiation_sum is in MJ/m² per day from Open-Meteo
    // Convert: 1 MJ/m² = 0.2778 kWh/m²
    const ghiMJ = bucket && bucket.ghiSums.length > 0
      ? bucket.ghiSums.reduce((a, b) => a + b, 0) / bucket.ghiSums.length
      : 0;
    const ghiKwh = ghiMJ * 0.2778;

    // Estimate DNI and DHI from GHI using the Erbs correlation
    const kt = ghiKwh > 0 ? Math.min(1, ghiKwh / 10.0) : 0.3; // clearness index approximation
    const diffuseFraction = kt <= 0.22
      ? 1.0 - 0.09 * kt
      : kt <= 0.8
        ? 0.9511 - 0.1604 * kt + 4.388 * kt * kt - 16.638 * kt * kt * kt + 12.336 * kt * kt * kt * kt
        : 0.165;
    const dhiKwh = ghiKwh * diffuseFraction;
    const dniKwh = Math.max(0, ghiKwh - dhiKwh);

    monthlyTemperatures.push({ month, averageHigh: round2(avgHigh), averageLow: round2(avgLow) });
    monthlyIrradiance.push({ month, ghi: round2(ghiKwh), dni: round2(dniKwh), dhi: round2(dhiKwh) });

    totalTemp += (avgHigh + avgLow) / 2;
    tempCount++;
  }

  return {
    location: {
      latitude: data.latitude ?? location.latitude,
      longitude: data.longitude ?? location.longitude,
      elevation: data.elevation ?? location.elevation,
    },
    monthlyTemperatures,
    monthlyIrradiance,
    averageAnnualTemp: round2(totalTemp / Math.max(1, tempCount)),
    source: "open-meteo",
    fetchedAt: new Date(),
  };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
