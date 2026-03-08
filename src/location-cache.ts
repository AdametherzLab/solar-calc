import type { Location } from "./types.js";
import type { WeatherDataWithIrradiance } from "./weather.js";

/**
 * Cache entry storing weather data with expiration metadata.
 * @public
 */
export interface CacheEntry {
  readonly data: WeatherDataWithIrradiance;
  readonly cachedAt: number;
  readonly expiresAt: number;
}

/**
 * Configuration options for the location data cache.
 * @public
 */
export interface LocationCacheOptions {
  /** Maximum number of entries to store (default 100). */
  readonly maxEntries?: number;
  /** Time-to-live in milliseconds (default 86400000 = 24 hours). */
  readonly ttlMs?: number;
}

/**
 * Cache statistics for monitoring.
 * @public
 */
export interface CacheStats {
  readonly hits: number;
  readonly misses: number;
  readonly size: number;
  readonly evictions: number;
}

const DEFAULT_MAX_ENTRIES = 100;
const DEFAULT_TTL_MS = 86_400_000; // 24 hours
const COORD_PRECISION = 2; // ~1.1km grid resolution

/**
 * Generate a deterministic cache key from a location.
 * Rounds coordinates to COORD_PRECISION decimal places so nearby
 * queries within ~1.1 km resolve to the same cache slot.
 * @param location - Geographic location
 * @returns Cache key string
 */
export function locationCacheKey(location: Location): string {
  const lat = location.latitude.toFixed(COORD_PRECISION);
  const lon = location.longitude.toFixed(COORD_PRECISION);
  return `${lat},${lon}`;
}

/**
 * LRU cache for location-based weather data.
 *
 * Stores fetched weather results keyed by rounded coordinates so that
 * repeated or nearby lookups avoid redundant API calls.
 *
 * @example
 * 
 * import { LocationCache } from "solar-calc";
 *
 * const cache = new LocationCache({ ttlMs: 3600000 }); // 1 hour TTL
 * cache.set(location, weatherData);
 * const cached = cache.get(location); // returns data or undefined
 * 
 * @public
 */
export class LocationCache {
  private readonly store = new Map<string, CacheEntry>();
  private readonly maxEntries: number;
  private readonly ttlMs: number;
  private _hits = 0;
  private _misses = 0;
  private _evictions = 0;

  constructor(options?: LocationCacheOptions) {
    this.maxEntries = options?.maxEntries ?? DEFAULT_MAX_ENTRIES;
    this.ttlMs = options?.ttlMs ?? DEFAULT_TTL_MS;
  }

  /**
   * Retrieve cached weather data for a location.
   * Returns undefined on miss or if the entry has expired.
   */
  get(location: Location): WeatherDataWithIrradiance | undefined {
    const key = locationCacheKey(location);
    const entry = this.store.get(key);

    if (!entry) {
      this._misses++;
      return undefined;
    }

    if (Date.now() > entry.expiresAt) {
      this.store.delete(key);
      this._misses++;
      return undefined;
    }

    // LRU: move to end
    this.store.delete(key);
    this.store.set(key, entry);
    this._hits++;
    return entry.data;
  }

  /**
   * Store weather data for a location in the cache.
   * Evicts the least-recently-used entry if the cache is full.
   */
  set(location: Location, data: WeatherDataWithIrradiance): void {
    const key = locationCacheKey(location);

    // Remove existing entry to refresh LRU order
    if (this.store.has(key)) {
      this.store.delete(key);
    }

    // Evict LRU if at capacity
    while (this.store.size >= this.maxEntries) {
      const oldestKey = this.store.keys().next().value;
      if (oldestKey !== undefined) {
        this.store.delete(oldestKey);
        this._evictions++;
      }
    }

    const now = Date.now();
    this.store.set(key, {
      data,
      cachedAt: now,
      expiresAt: now + this.ttlMs,
    });
  }

  /**
   * Check if a non-expired entry exists for a location.
   */
  has(location: Location): boolean {
    const key = locationCacheKey(location);
    const entry = this.store.get(key);
    if (!entry) return false;
    if (Date.now() > entry.expiresAt) {
      this.store.delete(key);
      return false;
    }
    return true;
  }

  /** Remove a specific location from the cache. */
  delete(location: Location): boolean {
    return this.store.delete(locationCacheKey(location));
  }

  /** Remove all entries from the cache. */
  clear(): void {
    this.store.clear();
  }

  /** Current number of entries in the cache. */
  get size(): number {
    return this.store.size;
  }

  /** Get cache performance statistics. */
  get stats(): CacheStats {
    return {
      hits: this._hits,
      misses: this._misses,
      size: this.store.size,
      evictions: this._evictions,
    };
  }

  /** Reset hit/miss/eviction counters. */
  resetStats(): void {
    this._hits = 0;
    this._misses = 0;
    this._evictions = 0;
  }
}

/** Default shared cache instance used by fetchWeatherData when caching is enabled. */
export const defaultLocationCache = new LocationCache();
