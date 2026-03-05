import * as path from "path";
import * as fs from "fs";
import * as os from "os";

/** Solar geometry calculation results. */
export interface SunPosition {
  readonly altitude: number; // degrees above horizon (-90 to 90)
  readonly azimuth: number; // degrees from true north (0-360)
  readonly hourAngle: number; // degrees
  readonly declination: number; // degrees
  readonly zenith: number; // degrees (90 - altitude)
}

/** Irradiance components in W/m². */
export interface Irradiance {
  readonly directNormal: number; // DNI
  readonly diffuseHorizontal: number; // DHI
  readonly globalHorizontal: number; // GHI
  readonly globalTilted?: number; // GTI (plane of array)
}

/** Location coordinates. */
export interface Location {
  readonly latitude: number; // degrees, -90 to 90
  readonly longitude: number; // degrees, -180 to 180
  readonly elevation?: number; // meters, optional
}

/** Panel orientation and characteristics. */
export interface PanelConfig {
  readonly tilt: number; // degrees from horizontal (0-90)
  readonly azimuth: number; // degrees from true north (0-360)
  readonly ratedPower: number; // Watts (W)
  readonly temperatureCoefficient?: number; // % per °C, typically -0.3 to -0.5
  readonly panelArea?: number; // square meters (m²), optional
}

/** Validation error for solar calculations. */
export class SolarValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SolarValidationError";
  }
}

/** Julian day calculation result. */
interface JulianDay {
  readonly day: number;
  readonly fraction: number;
}

/** Solar position algorithm parameters. */
interface SpaParameters {
  readonly julianDay: number;
  readonly julianCentury: number;
  readonly julianMillennium: number;
  readonly meanLongitude: number;
  readonly meanAnomaly: number;
  readonly eccentricity: number;
  readonly equationOfCenter: number;
  readonly trueLongitude: number;
  readonly trueAnomaly: number;
  readonly radiusVector: number;
  readonly apparentLongitude: number;
  readonly meanObliquity: number;
  readonly correctedObliquity: number;
  readonly rightAscension: number;
  readonly declination: number;
  readonly equationOfTime: number;
}

/** Atmospheric conditions for irradiance calculations. */
export interface AtmosphericConditions {
  readonly pressure: number; // millibars (hPa)
  readonly temperature: number; // °C
  readonly relativeHumidity: number; // 0-1 fraction
  readonly ozone: number; // cm-atm
  readonly aerosolOpticalDepth: number; // at 550 nm
  readonly precipitableWater: number; // cm
}

/** Perez model coefficients for diffuse irradiance. */
interface PerezCoefficients {
  readonly f11: number;
  readonly f12: number;
  readonly f13: number;
  readonly f21: number;
  readonly f22: number;
  readonly f23: number;
}

/** Clear sky model parameters. */
interface ClearSkyModel {
  readonly extraterrestrialIrradiance: number;
  readonly opticalDepth: number;
  readonly diffuseFactor: number;
}

/** Solar constant in W/m². */
const SOLAR_CONSTANT = 1367;

/** Earth's orbital eccentricity correction factor. */
const ECCENTRICITY_CORRECTION = 0.0167;

/** Standard atmospheric pressure at sea level in hPa. */
const STANDARD_PRESSURE = 1013.25;

/** Average Earth radius in kilometers. */
const EARTH_RADIUS_KM = 6371;

/** Astronomical unit in kilometers. */
const ASTRONOMICAL_UNIT_KM = 149597870.7;

/** Degrees to radians conversion factor. */
const DEG_TO_RAD = Math.PI / 180;

/** Radians to degrees conversion factor. */
const RAD_TO_DEG = 180 / Math.PI;

/** Seconds in a day. */
const SECONDS_PER_DAY = 86400;

/** Julian date for J2000.0 epoch. */
const J2000 = 2451545.0;

/** Obliquity of the ecliptic at J2000 in degrees. */
const OBLIQUITY_J2000 = 23.4392911;

/** Default atmospheric conditions (mid-latitude, clear sky). */
const DEFAULT_ATMOSPHERIC_CONDITIONS: AtmosphericConditions = {
  pressure: STANDARD_PRESSURE,
  temperature: 15,
  relativeHumidity: 0.5,
  ozone: 0.3,
  aerosolOpticalDepth: 0.1,
  precipitableWater: 1.5,
};

/** Perez model coefficients for different sky conditions. */
const PEREZ_COEFFICIENTS: readonly PerezCoefficients[] = [
  { f11: -0.008, f12: 0.588, f13: -0.062, f21: -0.060, f22: 0.072, f23: -0.022 },
  { f11: 0.130, f12: 0.683, f13: -0.151, f21: -0.019, f22: 0.066, f23: -0.029 },
  { f11: 0.330, f12: 0.487, f13: -0.221, f21: 0.055, f22: -0.064, f23: -0.026 },
  { f11: 0.568, f12: 0.187, f13: -0.295, f21: 0.109, f22: -0.152, f23: -0.014 },
  { f11: 0.873, f12: -0.392, f13: -0.362, f21: 0.226, f22: -0.462, f23: 0.001 },
  { f11: 1.132, f12: -1.237, f13: -0.412, f21: 0.288, f22: -0.823, f23: 0.056 },
  { f11: 1.060, f12: -1.600, f13: -0.359, f21: 0.264, f22: -1.127, f23: 0.131 },
  { f11: 0.678, f12: -0.327, f13: -0.250, f21: 0.156, f22: -1.377, f23: 0.251 },
];

/**
 * Calculate Julian day for a given date.
 * @param date - JavaScript Date object
 * @returns Julian day with fractional day
 * @throws {SolarValidationError} If date is invalid
 */
function calculateJulianDay(date: Date): JulianDay {
  const time = date.getTime();
  if (Number.isNaN(time)) {
    throw new SolarValidationError("Invalid date provided");
  }

  const year = date.getUTCFullYear();
  const month = date.getUTCMonth() + 1;
  const day = date.getUTCDate();
  const hour = date.getUTCHours();
  const minute = date.getUTCMinutes();
  const second = date.getUTCSeconds();
  const millisecond = date.getUTCMilliseconds();

  // Algorithm from Meeus, Astronomical Algorithms
  const a = Math.floor((14 - month) / 12);
  const y = year + 4800 - a;
  const m = month + 12 * a - 3;

  let julianDay = day + Math.floor((153 * m + 2) / 5) + 365 * y +
    Math.floor(y / 4) - Math.floor(y / 100) + Math.floor(y / 400) - 32045;

  const dayFraction = (hour - 12) / 24 + minute / 1440 + second / 86400 +
    millisecond / 86400000;

  return { day: julianDay, fraction: dayFraction };
}

/**
 * Calculate solar position using NREL SPA algorithm approximation.
 * @param location - Geographic coordinates
 * @param date - Date and time for calculation
 * @returns Sun position with altitude, azimuth, hour angle, declination, and zenith
 * @throws {SolarValidationError} If location is invalid or date is out of range
 * @example
 * const position = getSunPosition(
 *   { latitude: 40.7128, longitude: -74.0060 },
 *   new Date("2024-06-21T12:00:00Z")
 * );
 */
export function getSunPosition(location: Location, date: Date): SunPosition {
  // Validate location
  if (location.latitude < -90 || location.latitude > 90) {
    throw new SolarValidationError("Latitude must be between -90 and 90 degrees");
  }
  if (location.longitude < -180 || location.longitude > 180) {
    throw new SolarValidationError("Longitude must be between -180 and 180 degrees");
  }

  const julian = calculateJulianDay(date);
  const julianDay = julian.day + julian.fraction;

  // Calculate Julian centuries from J2000
  const t = (julianDay - J2000) / 36525;

  // Mean longitude, corrected for aberration
  const l0 = (280.46646 + 36000.76983 * t + 0.0003032 * t * t) % 360;
  const l0Rad = l0 * DEG_TO_RAD;

  // Mean anomaly
  const m = 357.52911 + 35999.05029 * t - 0.0001537 * t * t;
  const mRad = m * DEG_TO_RAD;

  // Equation of center
  const c = (1.914602 - 0.004817 * t - 0.000014 * t * t) * Math.sin(mRad) +
    (0.019993 - 0.000101 * t) * Math.sin(2 * mRad) +
    0.000289 * Math.sin(3 * mRad);

  // True longitude
  const trueLongitude = l0 + c;

  // Apparent longitude (corrected for nutation and aberration)
  const omega = 125.04 - 1934.136 * t;
  const apparentLongitude = trueLongitude - 0.00569 - 0.00478 * Math.sin(omega * DEG_TO_RAD);

  // Mean obliquity
  const meanObliquity = OBLIQUITY_J2000 - 0.013004 * t;

  // Corrected obliquity
  const correctedObliquity = meanObliquity + 0.00256 * Math.cos(omega * DEG_TO_RAD);

  // Right ascension
  const apparentLongitudeRad = apparentLongitude * DEG_TO_RAD;
  const correctedObliquityRad = correctedObliquity * DEG_TO_RAD;
  const rightAscension = Math.atan2(
    Math.cos(correctedObliquityRad) * Math.sin(apparentLongitudeRad),
    Math.cos(apparentLongitudeRad)
  ) * RAD_TO_DEG;

  // Declination
  const declination = Math.asin(
    Math.sin(correctedObliquityRad) * Math.sin(apparentLongitudeRad)
  ) * RAD_TO_DEG;

  // Equation of time
  const eccentricity = 0.016708634 - 0.000042037 * t - 0.0000001267 * t * t;
  const y = Math.tan(correctedObliquityRad / 2) ** 2;
  const equationOfTime = y * Math.sin(2 * l0Rad) -
    2 * eccentricity * Math.sin(mRad) +
    4 * eccentricity * y * Math.sin(mRad) * Math.cos(2 * l0Rad) -
    0.5 * y * y * Math.sin(4 * l0Rad) -
    1.25 * eccentricity * eccentricity * Math.sin(2 * mRad);
  const equationOfTimeMinutes = equationOfTime * RAD_TO_DEG * 4;

  // Solar time
  const timeOffset = equationOfTimeMinutes + 4 * location.longitude;
  const solarTime = date.getUTCHours() * 60 + date.getUTCMinutes() +
    date.getUTCSeconds() / 60 + timeOffset;
  const hourAngle = (solarTime / 4 - 180) % 360;

  // Convert to radians for trigonometric calculations
  const latRad = location.latitude * DEG_TO_RAD;
  const decRad = declination * DEG_TO_RAD;
  const haRad = hourAngle * DEG_TO_RAD;

  // Solar altitude
  const sinAltitude = Math.sin(latRad) * Math.sin(decRad) +
    Math.cos(latRad) * Math.cos(decRad) * Math.cos(haRad);
  const altitude = Math.asin(Math.max(-1, Math.min(1, sinAltitude))) * RAD_TO_DEG;

  // Solar azimuth
  const cosAzimuth = (Math.sin(decRad) - Math.sin(latRad) * Math.sin(altitude * DEG_TO_RAD)) /
    (Math.cos(latRad) * Math.cos(altitude * DEG_TO_RAD));
  const azimuth = Math.acos(Math.max(-1, Math.min(1, cosAzimuth))) * RAD_TO_DEG;
  const finalAzimuth = hourAngle > 0 ? 360 - azimuth : azimuth;

  // Solar zenith
  const zenith = 90 - altitude;

  return {
    altitude: Number(altitude.toFixed(4)),
    azimuth: Number(finalAzimuth.toFixed(4)),
    hourAngle: Number(hourAngle.toFixed(4)),
    declination: Number(declination.toFixed(4)),
    zenith: Number(zenith.toFixed(4)),
  };
}

/**
 * Calculate extraterrestrial irradiance for a given day of year.
 * @param dayOfYear - Day of year (1-366)
 * @returns Extraterrestrial irradiance in W/m²
 */
function calculateExtraterrestrialIrradiance(dayOfYear: number): number {
  const dayAngle = 2 * Math.PI * (dayOfYear - 1) / 365;
  const correction = 1.00011 + 0.034221 * Math.cos(dayAngle) +
    0.00128 * Math.sin(dayAngle) + 0.000719 * Math.cos(2 * dayAngle) +
    0.000077 * Math.sin(2 * dayAngle);
  return SOLAR_CONSTANT * correction;
}

/**
 * Calculate clear sky optical depth based on atmospheric conditions.
 * @param conditions - Atmospheric conditions
 * @returns Optical depth at 550 nm
 */
function calculateOpticalDepth(conditions: AtmosphericConditions): number {
  const baseDepth = 0.156;
  const pressureFactor = conditions.pressure / STANDARD_PRESSURE;
  const aerosolFactor = conditions.aerosolOpticalDepth / 0.1;
  const waterFactor = conditions.precipitableWater / 1.5;
  
  return baseDepth * pressureFactor * (0.7 + 0.3 * aerosolFactor) *
    (0.9 + 0.1 * waterFactor);
}

/**
 * Calculate irradiance components using Perez model.
 * @param sunPosition - Solar position
 * @param location - Geographic coordinates
 * @param date - Date and time
 * @param atmospheric - Atmospheric conditions (optional)
 * @param panelConfig - Panel configuration for tilted irradiance (optional)
 * @returns Irradiance components in W/m²
 * @throws {SolarValidationError} If solar altitude is below horizon
 * @example
 * const irradiance = getIrradiance(
 *   sunPosition,
 *   location,
 *   date,
 *   { pressure: 1013, temperature: 20, relativeHumidity: 0.6 },
 *   { tilt: 30, azimuth: 180, ratedPower: 300 }
 * );
 */
export function getIrradiance(
  sunPosition: SunPosition,
  location: Location,
  date: Date,
  atmospheric: AtmosphericConditions = DEFAULT_ATMOSPHERIC_CONDITIONS,
  panelConfig?: PanelConfig
): Irradiance {
  if (sunPosition.altitude <= 0) {
    return {
      directNormal: 0,
      diffuseHorizontal: 0,
      globalHorizontal: 0,
      globalTilted: 0,
    };
  }

  const dayOfYear = Math.floor((date.getTime() - new Date(date.getFullYear(), 0, 0).getTime()) /
    1000 / 60 / 60 / 24);
  
  const extraterrestrial = calculateExtraterrestrialIrradiance(dayOfYear);
  const opticalDepth = calculateOpticalDepth(atmospheric);
  
  // Air mass
  const airMass = 1 / (Math.cos(sunPosition.zenith * DEG_TO_RAD) +
    0.50572 * (96.07995 - sunPosition.zenith) ** -1.6364);
  
  // Direct normal irradiance
  const directNormal = extraterrestrial * Math.exp(-opticalDepth * airMass);
  
  // Diffuse horizontal irradiance (Perez model)
  const clearnessIndex = Math.min(1, directNormal / extraterrestrial);
  const brightness = atmospheric.aerosolOpticalDepth / clearnessIndex;
  
  let skyCondition = Math.floor(brightness * 8);
  skyCondition = Math.max(0, Math.min(7, skyCondition));
  const coeff = PEREZ_COEFFICIENTS[skyCondition];
  
  const zenithRad = sunPosition.zenith * DEG_TO_RAD;
  const diffuseHorizontal = extraterrestrial * coeff.f11 *
    Math.exp(-coeff.f12 * airMass) * (1 + coeff.f13 * Math.sin(zenithRad));
  
  // Global horizontal irradiance
  const globalHorizontal = directNormal * Math.cos(zenithRad) + diffuseHorizontal;
  
  let globalTilted: number | undefined;
  if (panelConfig) {
    // Calculate plane of array irradiance
    const panelTiltRad = panelConfig.tilt * DEG_TO_RAD;
    const panelAzimuthRad = panelConfig.azimuth * DEG_TO_RAD;
    const sunAzimuthRad = sunPosition.azimuth * DEG_TO_RAD;
    
    const incidenceAngle = Math.acos(
      Math.cos(zenithRad) * Math.cos(panelTiltRad) +
      Math.sin(zenithRad) * Math.sin(panelTiltRad) *
      Math.cos(sunAzimuthRad - panelAzimuthRad)
    );
    
    const beamComponent = directNormal * Math.max(0, Math.cos(incidenceAngle));
    const diffuseComponent = diffuseHorizontal * (1 + Math.cos(panelTiltRad)) / 2;
    const groundReflected = globalHorizontal * 0.2 * (1 - Math.cos(panelTiltRad)) / 2;
    
    globalTilted = beamComponent + diffuseComponent + groundReflected;
  }
  
  return {
    directNormal: Number(Math.max(0, directNormal).toFixed(1)),
    diffuseHorizontal: Number(Math.max(0, diffuseHorizontal).toFixed(1)),
    globalHorizontal: Number(Math.max(0, globalHorizontal).toFixed(1)),
    globalTilted: globalTilted ? Number(Math.max(0, globalTilted).toFixed(1)) : undefined,
  };
}

/**
 * Estimate peak sun hours for a location and date.
 * @param location - Geographic coordinates
 * @param date - Date (time component ignored)
 * @param atmospheric - Atmospheric conditions (optional)
 * @returns Peak sun hours (equivalent hours at 1000 W/m²)
 * @example
 * const hours = estimatePeakSunHours(
 *   { latitude: 40.7128, longitude: -74.0060 },
 *   new Date("2024-06-21")
 * );
 */
export function estimatePeakSunHours(
  location: Location,
  date: Date,
  atmospheric: AtmosphericConditions = DEFAULT_ATMOSPHERIC_CONDITIONS
): number {
  const year = date.getFullYear();
  const month = date.getMonth();
  const day = date.getDate();
  
  let totalIrradiance = 0;
  const samplesPerHour = 4;
  
  for (let hour = 0; hour < 24; hour++) {
    for (let minute = 0; minute < 60; minute += 60 / samplesPerHour) {
      const sampleDate = new Date(Date.UTC(year, month, day, hour, minute));
      const sunPosition = getSunPosition(location, sampleDate);
      const irradiance = getIrradiance(sunPosition, location, sampleDate, atmospheric);
      
      totalIrradiance += irradiance.globalHorizontal;
    }
  }
  
  const peakSunHours = totalIrradiance / (1000 * 24 * samplesPerHour);
  return Number(peakSunHours.toFixed(2));
}

/**
 * Find optimal tilt angle for maximum annual energy yield.
 * @param location - Geographic coordinates
 * @param azimuth - Panel azimuth in degrees (0-360)
 * @param step - Tilt angle step size in degrees (default: 1)
 * @returns Optimal tilt angle in degrees
 * @example
 * const optimalTilt = getOptimalTilt(
 *   { latitude: 40.7128, longitude: -74.0060 },
 *   180 // south-facing in northern hemisphere
 * );
 */
export function getOptimalTilt(
  location: Location,
  azimuth: number,
  step: number = 1
): number {
  if (azimuth < 0 || azimuth > 360) {
    throw new SolarValidationError("Azimuth must be between 0 and 360 degrees");
  }
  if (step <= 0 || step > 10) {
    throw new SolarValidationError("Step size must be between 0.1 and 10 degrees");
  }
  
  let maxYield = -Infinity;
  let optimalTilt = 0;
  
  // Sample tilt angles from 0 to 90 degrees
  for (let tilt = 0; tilt <= 90; tilt += step) {
    let annualYield = 0;
    
    // Sample 12 representative days (15th of each month)
    for (let month = 0; month < 12; month++) {
      const sampleDate = new Date(Date.UTC(2024, month, 15, 12, 0));
      const sunPosition = getSunPosition(location, sampleDate);
      
      const panelConfig: PanelConfig = {
        tilt,
        azimuth,
        ratedPower: 1, // Arbitrary, we're comparing ratios
      };
      
      const irradiance = getIrradiance(
        sunPosition,
        location,
        sampleDate,
        DEFAULT_ATMOSPHERIC_CONDITIONS,
        panelConfig
      );
      
      if (irradiance.globalTilted) {
        annualYield += irradiance.globalTilted;
      }
    }
    
    if (annualYield > maxYield) {
      maxYield = annualYield;
      optimalTilt = tilt;
    }
  }
  
  // Refine search around optimal tilt with smaller steps
  const refineStep = step / 10;
  const start = Math.max(0, optimalTilt - step);
  const end = Math.min(90, optimalTilt + step);
  
  for (let tilt = start; tilt <= end; tilt += refineStep) {
    let annualYield = 0;
    
    for (let month = 0; month < 12; month++) {
      const sampleDate = new Date(Date.UTC(2024, month, 15, 12, 0));
      const sunPosition = getSunPosition(location, sampleDate);
      
      const panelConfig: PanelConfig = {
        tilt,
        azimuth,
        ratedPower: 1,
      };
      
      const irradiance = getIrradiance(
        sunPosition,
        location,
        sampleDate,
        DEFAULT_ATMOSPHERIC_CONDITIONS,
        panelConfig
      );
      
      if (irradiance.globalTilted) {
        annualYield += irradiance.globalTilted;
      }
    }
    
    if (annualYield > maxYield) {
      maxYield = annualYield;
      optimalTilt = tilt;
    }
  }
  
  return Number(optimalTilt.toFixed(1));
}

/**
 * Calculate solar geometry and irradiance for a full day.
 * @param location - Geographic coordinates
 * @param date - Date (time component ignored)
 * @param atmospheric - Atmospheric conditions (optional)
 * @returns Array of hourly sun positions and irradiance values
 */
export function calculateDailySolar(
  location: Location,
  date: Date,
  atmospheric: AtmosphericConditions = DEFAULT_ATMOSPHERIC_CONDITIONS
): Array<{ hour: number; position: SunPosition; irradiance: Irradiance }> {
  const year = date.getFullYear();
  const month = date.getMonth();
  const day = date.getDate();
  
  const results: Array<{ hour: number; position: SunPosition; irradiance: Irradiance }> = [];
  
  for (let hour = 0; hour < 24; hour++) {
    const sampleDate = new Date(Date.UTC(year, month, day, hour, 30, 0));
    const position = getSunPosition(location, sampleDate);
    const irradiance = getIrradiance(position, location, sampleDate, atmospheric);
    
    results.push({
      hour,
      position,
      irradiance,
    });
  }
  
  return results;
}

/**
 * Save solar calculation results to a JSON file.
 * @param data - Calculation results to save
 * @param filename - Output filename (without path)
 * @returns Full path to saved file
 * @throws {SolarValidationError} If filename contains path separators
 */
export function saveSolarData(
  data: unknown,
  filename: string
): string {
  if (filename.includes(path.sep) || filename.includes("/") || filename.includes("\\")) {
    throw new SolarValidationError("Filename must not contain path separators");
  }
  
  const dataDir = path.join(os.homedir(), ".solar-calc");
  
  try {
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }
    
    const filePath = path.join(dataDir, filename);
    const jsonData = JSON.stringify(data, null, 2);
    fs.writeFileSync(filePath, jsonData, "utf8");
    
    return filePath;
  } catch (error) {
    throw new SolarValidationError(`Failed to save solar data: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * Load solar calculation results from a JSON file.
 * @param filename - Input filename (without path)
 * @returns Parsed calculation results
 * @throws {SolarValidationError} If file doesn't exist or contains invalid JSON
 */
export function loadSolarData<T = unknown>(filename: string): T {
  if (filename.includes(path.sep) || filename.includes("/") || filename.includes("\\")) {
    throw new SolarValidationError("Filename must not contain path separators");
  }
  
  const filePath = path.join(os.homedir(), ".solar-calc", filename);
  
  try {
    if (!fs.existsSync(filePath)) {
      throw new SolarValidationError(`Solar data file not found: ${filePath}`);
    }
    
    const jsonData = fs.readFileSync(filePath, "utf8");
    return JSON.parse(jsonData) as T;
  } catch (error) {
    if (error instanceof SolarValidationError) {
      throw error;
    }
    throw new SolarValidationError(`Failed to load solar data: ${error instanceof Error ? error.message : String(error)}`);
  }
}