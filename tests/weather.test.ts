import { describe, it, expect } from "bun:test";
import { fetchWeatherData } from "../src/weather.js";
import type { WeatherDataWithIrradiance, FetchWeatherOptions } from "../src/weather.js";
import type { Location } from "../src/types.js";

/** Create a mock fetch that returns realistic Open-Meteo data. */
function createMockFetch(overrides?: Partial<{ status: number; data: unknown }>) {
  const days: string[] = [];
  const highs: number[] = [];
  const lows: number[] = [];
  const radiation: number[] = [];

  // Generate 365 days of synthetic data for 2020
  const monthHighs = [3, 5, 10, 16, 22, 27, 30, 29, 24, 17, 10, 5];
  const monthLows = [-4, -2, 2, 7, 12, 17, 20, 19, 14, 8, 3, -1];
  const monthRadiation = [4, 6, 10, 14, 18, 20, 19, 16, 12, 8, 5, 3]; // MJ/m²/day

  const daysInMonth = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]; // 2020 is leap year
  for (let m = 0; m < 12; m++) {
    for (let d = 1; d <= daysInMonth[m]; d++) {
      const mm = String(m + 1).padStart(2, "0");
      const dd = String(d).padStart(2, "0");
      days.push(`2020-${mm}-${dd}`);
      highs.push(monthHighs[m] + (Math.random() - 0.5) * 2);
      lows.push(monthLows[m] + (Math.random() - 0.5) * 2);
      radiation.push(monthRadiation[m] + (Math.random() - 0.5) * 1);
    }
  }

  const responseData = overrides?.data ?? {
    latitude: 40.71,
    longitude: -74.01,
    elevation: 10,
    daily: {
      time: days,
      temperature_2m_max: highs,
      temperature_2m_min: lows,
      shortwave_radiation_sum: radiation,
    },
  };

  return async (_url: string | URL | Request, _init?: RequestInit): Promise<Response> => {
    const status = overrides?.status ?? 200;
    if (status !== 200) {
      return new Response(JSON.stringify({ error: "not found" }), {
        status,
        statusText: "Not Found",
      });
    }
    return new Response(JSON.stringify(responseData), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  };
}

describe("fetchWeatherData", () => {
  const nyc: Location = { latitude: 40.7128, longitude: -74.006, elevation: 10 };

  it("returns 12 months of temperature and irradiance data", async () => {
    const weather = await fetchWeatherData(nyc, { fetchFn: createMockFetch() as typeof fetch });

    expect(weather.monthlyTemperatures).toHaveLength(12);
    expect(weather.monthlyIrradiance).toHaveLength(12);
    expect(weather.source).toBe("open-meteo");
    expect(weather.fetchedAt).toBeInstanceOf(Date);
    expect(weather.averageAnnualTemp).toBeGreaterThan(-50);
    expect(weather.averageAnnualTemp).toBeLessThan(60);

    // Verify summer is warmer than winter (northern hemisphere)
    const jan = weather.monthlyTemperatures.find(t => t.month === 1)!;
    const jul = weather.monthlyTemperatures.find(t => t.month === 7)!;
    expect(jul.averageHigh).toBeGreaterThan(jan.averageHigh);

    // Verify summer has more irradiance than winter
    const janIrr = weather.monthlyIrradiance.find(i => i.month === 1)!;
    const julIrr = weather.monthlyIrradiance.find(i => i.month === 7)!;
    expect(julIrr.ghi).toBeGreaterThan(janIrr.ghi);

    // Verify GHI = DNI + DHI (approximately)
    for (const m of weather.monthlyIrradiance) {
      expect(m.ghi).toBeCloseTo(m.dni + m.dhi, 1);
      expect(m.ghi).toBeGreaterThanOrEqual(0);
      expect(m.dni).toBeGreaterThanOrEqual(0);
      expect(m.dhi).toBeGreaterThanOrEqual(0);
    }
  });

  it("throws RangeError for invalid coordinates", async () => {
    await expect(
      fetchWeatherData({ latitude: 91, longitude: 0 }, { fetchFn: createMockFetch() as typeof fetch })
    ).rejects.toThrow(RangeError);

    await expect(
      fetchWeatherData({ latitude: 0, longitude: 181 }, { fetchFn: createMockFetch() as typeof fetch })
    ).rejects.toThrow(RangeError);
  });

  it("throws on non-200 API responses", async () => {
    const mockFetch = createMockFetch({ status: 500 });
    await expect(
      fetchWeatherData(nyc, { fetchFn: mockFetch as typeof fetch })
    ).rejects.toThrow(/HTTP 500/);
  });

  it("throws on empty daily data", async () => {
    const mockFetch = createMockFetch({ data: { daily: { time: [] } } });
    await expect(
      fetchWeatherData(nyc, { fetchFn: mockFetch as typeof fetch })
    ).rejects.toThrow(/empty daily data/);
  });

  it("result is compatible with calculateMonthlyYield WeatherData", async () => {
    const weather = await fetchWeatherData(nyc, { fetchFn: createMockFetch() as typeof fetch });

    // WeatherData interface requires: location, monthlyTemperatures, averageAnnualTemp
    expect(weather.location).toBeDefined();
    expect(weather.location.latitude).toBeCloseTo(40.71, 0);
    expect(weather.monthlyTemperatures).toHaveLength(12);
    expect(typeof weather.averageAnnualTemp).toBe("number");

    // Each month has required fields
    for (const t of weather.monthlyTemperatures) {
      expect(t.month).toBeGreaterThanOrEqual(1);
      expect(t.month).toBeLessThanOrEqual(12);
      expect(typeof t.averageHigh).toBe("number");
      expect(typeof t.averageLow).toBe("number");
    }
  });
});
