import { describe, it, expect, beforeEach } from "bun:test";
import {
  LocationCache,
  locationCacheKey,
  defaultLocationCache,
} from "../src/location-cache.js";
import { fetchWeatherData } from "../src/weather.js";
import type { Location } from "../src/types.js";
import type { WeatherDataWithIrradiance } from "../src/weather.js";

function makeMockWeather(location: Location): WeatherDataWithIrradiance {
  return {
    location,
    monthlyTemperatures: Array.from({ length: 12 }, (_, i) => ({
      month: i + 1,
      averageHigh: 20 + i,
      averageLow: 10 + i,
    })),
    monthlyIrradiance: Array.from({ length: 12 }, (_, i) => ({
      month: i + 1,
      ghi: 3 + i * 0.5,
      dni: 2 + i * 0.3,
      dhi: 1 + i * 0.2,
    })),
    averageAnnualTemp: 15,
    source: "mock",
    fetchedAt: new Date(),
  };
}

function createMockFetch() {
  let callCount = 0;
  const days: string[] = [];
  const highs: number[] = [];
  const lows: number[] = [];
  const radiation: number[] = [];
  const daysInMonth = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  for (let m = 0; m < 12; m++) {
    for (let d = 1; d <= daysInMonth[m]; d++) {
      days.push(`2020-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`);
      highs.push(20 + m);
      lows.push(10 + m);
      radiation.push(8 + m);
    }
  }
  const fn = async (_url: string | URL | Request): Promise<Response> => {
    callCount++;
    return new Response(JSON.stringify({
      latitude: 40.71,
      longitude: -74.01,
      elevation: 10,
      daily: { time: days, temperature_2m_max: highs, temperature_2m_min: lows, shortwave_radiation_sum: radiation },
    }), { status: 200, headers: { "Content-Type": "application/json" } });
  };
  return { fn: fn as typeof fetch, getCallCount: () => callCount };
}

describe("locationCacheKey", () => {
  it("rounds coordinates to 2 decimal places", () => {
    const key = locationCacheKey({ latitude: 40.7128, longitude: -74.006 });
    expect(key).toBe("40.71,-74.01");
  });

  it("produces same key for nearby locations within grid", () => {
    const a = locationCacheKey({ latitude: 40.711, longitude: -74.009 });
    const b = locationCacheKey({ latitude: 40.714, longitude: -74.005 });
    expect(a).toBe(b);
  });

  it("produces different keys for distant locations", () => {
    const a = locationCacheKey({ latitude: 40.71, longitude: -74.01 });
    const b = locationCacheKey({ latitude: 34.05, longitude: -118.24 });
    expect(a).not.toBe(b);
  });
});

describe("LocationCache", () => {
  let cache: LocationCache;
  const nyc: Location = { latitude: 40.7128, longitude: -74.006, elevation: 10 };
  const la: Location = { latitude: 34.0522, longitude: -118.2437, elevation: 71 };

  beforeEach(() => {
    cache = new LocationCache({ maxEntries: 3, ttlMs: 5000 });
  });

  it("returns undefined on cache miss", () => {
    expect(cache.get(nyc)).toBeUndefined();
    expect(cache.stats.misses).toBe(1);
    expect(cache.stats.hits).toBe(0);
  });

  it("stores and retrieves data correctly", () => {
    const mockData = makeMockWeather(nyc);
    cache.set(nyc, mockData);
    const result = cache.get(nyc);
    expect(result).toBeDefined();
    expect(result!.location.latitude).toBe(nyc.latitude);
    expect(result!.monthlyTemperatures).toHaveLength(12);
    expect(cache.stats.hits).toBe(1);
    expect(cache.size).toBe(1);
  });

  it("has() returns true for cached, false for missing", () => {
    expect(cache.has(nyc)).toBe(false);
    cache.set(nyc, makeMockWeather(nyc));
    expect(cache.has(nyc)).toBe(true);
    expect(cache.has(la)).toBe(false);
  });

  it("evicts LRU entries when maxEntries is reached", () => {
    const loc1: Location = { latitude: 10, longitude: 20 };
    const loc2: Location = { latitude: 30, longitude: 40 };
    const loc3: Location = { latitude: 50, longitude: 60 };
    const loc4: Location = { latitude: 70, longitude: 80 };

    cache.set(loc1, makeMockWeather(loc1));
    cache.set(loc2, makeMockWeather(loc2));
    cache.set(loc3, makeMockWeather(loc3));
    expect(cache.size).toBe(3);

    // Adding a 4th should evict loc1 (LRU)
    cache.set(loc4, makeMockWeather(loc4));
    expect(cache.size).toBe(3);
    expect(cache.has(loc1)).toBe(false);
    expect(cache.has(loc4)).toBe(true);
    expect(cache.stats.evictions).toBe(1);
  });

  it("accessing an entry refreshes its LRU position", () => {
    const loc1: Location = { latitude: 10, longitude: 20 };
    const loc2: Location = { latitude: 30, longitude: 40 };
    const loc3: Location = { latitude: 50, longitude: 60 };
    const loc4: Location = { latitude: 70, longitude: 80 };

    cache.set(loc1, makeMockWeather(loc1));
    cache.set(loc2, makeMockWeather(loc2));
    cache.set(loc3, makeMockWeather(loc3));

    // Access loc1 to refresh it
    cache.get(loc1);

    // Adding loc4 should now evict loc2 (oldest untouched)
    cache.set(loc4, makeMockWeather(loc4));
    expect(cache.has(loc1)).toBe(true);
    expect(cache.has(loc2)).toBe(false);
  });

  it("expires entries after TTL", async () => {
    const shortCache = new LocationCache({ ttlMs: 50 });
    shortCache.set(nyc, makeMockWeather(nyc));
    expect(shortCache.get(nyc)).toBeDefined();

    await new Promise((r) => setTimeout(r, 80));
    expect(shortCache.get(nyc)).toBeUndefined();
    expect(shortCache.stats.misses).toBe(1);
  });

  it("delete removes a specific entry", () => {
    cache.set(nyc, makeMockWeather(nyc));
    expect(cache.has(nyc)).toBe(true);
    cache.delete(nyc);
    expect(cache.has(nyc)).toBe(false);
    expect(cache.size).toBe(0);
  });

  it("clear removes all entries", () => {
    cache.set(nyc, makeMockWeather(nyc));
    cache.set(la, makeMockWeather(la));
    expect(cache.size).toBe(2);
    cache.clear();
    expect(cache.size).toBe(0);
  });

  it("resetStats zeroes counters", () => {
    cache.set(nyc, makeMockWeather(nyc));
    cache.get(nyc);
    cache.get(la);
    expect(cache.stats.hits).toBe(1);
    expect(cache.stats.misses).toBe(1);
    cache.resetStats();
    expect(cache.stats.hits).toBe(0);
    expect(cache.stats.misses).toBe(0);
  });
});

describe("fetchWeatherData with caching", () => {
  const nyc: Location = { latitude: 40.7128, longitude: -74.006, elevation: 10 };

  it("caches results and avoids duplicate API calls", async () => {
    const mock = createMockFetch();
    const cache = new LocationCache();

    const first = await fetchWeatherData(nyc, {
      fetchFn: mock.fn,
      cache: true,
      cacheInstance: cache,
    });
    expect(mock.getCallCount()).toBe(1);
    expect(first.monthlyTemperatures).toHaveLength(12);

    const second = await fetchWeatherData(nyc, {
      fetchFn: mock.fn,
      cache: true,
      cacheInstance: cache,
    });
    // Should NOT have made a second API call
    expect(mock.getCallCount()).toBe(1);
    expect(second.averageAnnualTemp).toBe(first.averageAnnualTemp);
    expect(cache.stats.hits).toBe(1);
  });

  it("bypassCache forces a fresh fetch", async () => {
    const mock = createMockFetch();
    const cache = new LocationCache();

    await fetchWeatherData(nyc, { fetchFn: mock.fn, cache: true, cacheInstance: cache });
    expect(mock.getCallCount()).toBe(1);

    await fetchWeatherData(nyc, {
      fetchFn: mock.fn,
      cache: true,
      cacheInstance: cache,
      bypassCache: true,
    });
    // Should have made a second API call
    expect(mock.getCallCount()).toBe(2);
  });

  it("does not cache when cache option is false", async () => {
    const mock = createMockFetch();
    const cache = new LocationCache();

    await fetchWeatherData(nyc, { fetchFn: mock.fn, cache: false, cacheInstance: cache });
    await fetchWeatherData(nyc, { fetchFn: mock.fn, cache: false, cacheInstance: cache });
    // Both calls should hit the API
    expect(mock.getCallCount()).toBe(2);
    expect(cache.size).toBe(0);
  });

  it("nearby locations resolve to same cache entry", async () => {
    const mock = createMockFetch();
    const cache = new LocationCache();
    const nycSlightlyOff: Location = { latitude: 40.7131, longitude: -74.0058, elevation: 10 };

    await fetchWeatherData(nyc, { fetchFn: mock.fn, cache: true, cacheInstance: cache });
    await fetchWeatherData(nycSlightlyOff, { fetchFn: mock.fn, cache: true, cacheInstance: cache });
    // Same grid cell — only 1 API call
    expect(mock.getCallCount()).toBe(1);
    expect(cache.stats.hits).toBe(1);
  });
});

describe("defaultLocationCache", () => {
  it("is a shared LocationCache instance", () => {
    expect(defaultLocationCache).toBeInstanceOf(LocationCache);
    expect(typeof defaultLocationCache.get).toBe("function");
    expect(typeof defaultLocationCache.set).toBe("function");
  });
});
