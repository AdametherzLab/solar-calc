import type {
  Location,
  PanelConfig,
  DeratingFactors,
  MonthlyYield,
  AnnualYield,
  StringSizingParams,
  StringSizingResult,
  MonthlyTemperature,
  WeatherData,
} from "./types.js";

/**
 * Calculates the solar declination angle for a given day of year.
 * @param dayOfYear - Day number (1-365)
 * @returns Declination in degrees
 */
function calculateDeclination(dayOfYear: number): number {
  const radians = (2 * Math.PI * (dayOfYear - 1)) / 365;
  return (
    23.45 *
    (Math.PI / 180) *
    Math.sin((2 * Math.PI * (284 + dayOfYear)) / 365)
  );
}

/**
 * Calculates the hour angle for a given solar time.
 * @param solarTime - Solar time in hours (0-24)
 * @returns Hour angle in degrees
 */
function calculateHourAngle(solarTime: number): number {
  return 15 * (solarTime - 12);
}

/**
 * Calculates the sun's altitude angle.
 * @param latitude - Observer latitude in degrees
 * @param declination - Solar declination in degrees
 * @param hourAngle - Hour angle in degrees
 * @returns Altitude in degrees
 */
function calculateAltitude(
  latitude: number,
  declination: number,
  hourAngle: number
): number {
  const latRad = (latitude * Math.PI) / 180;
  const decRad = (declination * Math.PI) / 180;
  const haRad = (hourAngle * Math.PI) / 180;

  const sinAlt =
    Math.sin(latRad) * Math.sin(decRad) +
    Math.cos(latRad) * Math.cos(decRad) * Math.cos(haRad);
  return (Math.asin(sinAlt) * 180) / Math.PI;
}

/**
 * Calculates the sun's azimuth angle.
 * @param latitude - Observer latitude in degrees
 * @param declination - Solar declination in degrees
 * @param hourAngle - Hour angle in degrees
 * @param altitude - Sun altitude in degrees
 * @returns Azimuth in degrees (0-360, north=0)
 */
function calculateAzimuth(
  latitude: number,
  declination: number,
  hourAngle: number,
  altitude: number
): number {
  const latRad = (latitude * Math.PI) / 180;
  const decRad = (declination * Math.PI) / 180;
  const altRad = (altitude * Math.PI) / 180;

  const cosAz =
    (Math.sin(decRad) - Math.sin(latRad) * Math.sin(altRad)) /
    (Math.cos(latRad) * Math.cos(altRad));
  const azimuthRad = Math.acos(Math.max(-1, Math.min(1, cosAz)));

  let azimuth = (azimuthRad * 180) / Math.PI;
  if (hourAngle > 0) {
    azimuth = 360 - azimuth;
  }
  return azimuth;
}

/**
 * Calculates the angle of incidence on a tilted surface.
 * @param tilt - Surface tilt from horizontal in degrees
 * @param surfaceAzimuth - Surface azimuth from north in degrees
 * @param sunAltitude - Sun altitude in degrees
 * @param sunAzimuth - Sun azimuth from north in degrees
 * @returns Angle of incidence in degrees
 */
function calculateIncidenceAngle(
  tilt: number,
  surfaceAzimuth: number,
  sunAltitude: number,
  sunAzimuth: number
): number {
  const tiltRad = (tilt * Math.PI) / 180;
  const surfAzRad = (surfaceAzimuth * Math.PI) / 180;
  const altRad = (sunAltitude * Math.PI) / 180;
  const sunAzRad = (sunAzimuth * Math.PI) / 180;

  const cosTheta =
    Math.sin(altRad) * Math.cos(tiltRad) +
    Math.cos(altRad) * Math.sin(tiltRad) *
    Math.cos(sunAzRad - surfAzRad);

  const thetaRad = Math.acos(Math.max(-1, Math.min(1, cosTheta)));
  return (thetaRad * 180) / Math.PI;
}

/**
 * Estimates clear-sky irradiance using the Hottel model.
 * @param altitude - Sun altitude in degrees
 * @param elevation - Site elevation in meters
 * @returns Direct normal irradiance (W/m²)
 */
function estimateClearSkyIrradiance(
  altitude: number,
  elevation: number = 0
): number {
  if (altitude <= 0) return 0;

  const a = 0.4237 - 0.00821 * Math.pow(6 - elevation / 1000, 2);
  const b = 0.5055 + 0.00595 * Math.pow(6.5 - elevation / 1000, 2);
  const c = 0.2711 + 0.01858 * Math.pow(2.5 - elevation / 1000, 2);

  const airMass = 1 / (Math.sin((altitude * Math.PI) / 180) + 0.50572 *
    Math.pow(altitude + 6.07995, -1.6364));

  const tau = a + b * Math.exp(-c * airMass);
  return 1367 * tau;
}

/**
 * Calculates irradiance on a tilted surface.
 * @param dni - Direct normal irradiance (W/m²)
 * @param dhi - Diffuse horizontal irradiance (W/m²)
 * @param tilt - Surface tilt in degrees
 * @param incidenceAngle - Angle of incidence in degrees
 * @returns Global tilted irradiance (W/m²)
 */
function calculateTiltedIrradiance(
  dni: number,
  dhi: number,
  tilt: number,
  incidenceAngle: number
): number {
  const tiltRad = (tilt * Math.PI) / 180;
  const incRad = (incidenceAngle * Math.PI) / 180;

  const beamComponent = dni * Math.max(0, Math.cos(incRad));
  const diffuseComponent = dhi * ((1 + Math.cos(tiltRad)) / 2);
  const groundReflectance = 0.2; // Typical albedo
  const groundComponent = (dni * Math.sin((incidenceAngle * Math.PI) / 180) + dhi) *
    groundReflectance * ((1 - Math.cos(tiltRad)) / 2);

  return beamComponent + diffuseComponent + groundComponent;
}

/**
 * Calculates temperature derating factor for panels.
 * @param cellTemperature - Panel cell temperature in °C
 * @param temperatureCoefficient - Panel temperature coefficient (%/°C)
 * @param referenceTemperature - Reference temperature (typically 25°C)
 * @returns Derating factor (0-1)
 */
function calculateTemperatureDerating(
  cellTemperature: number,
  temperatureCoefficient: number = -0.004,
  referenceTemperature: number = 25
): number {
  return 1 + (temperatureCoefficient * (cellTemperature - referenceTemperature));
}

/**
 * Estimates panel cell temperature from ambient temperature.
 * @param ambientTemp - Ambient temperature in °C
 * @param irradiance - Incident irradiance (W/m²)
 * @param noct - Nominal operating cell temperature (typically 45°C)
 * @returns Estimated cell temperature in °C
 */
function estimateCellTemperature(
  ambientTemp: number,
  irradiance: number,
  noct: number = 45
): number {
  return ambientTemp + (irradiance / 800) * (noct - 20);
}

/**
 * Calculates monthly energy yield for a solar panel system.
 * @param location - Geographic location
 * @param panel - Panel configuration
 * @param derating - System derating factors
 * @param weather - Weather data including monthly temperatures
 * @returns Array of monthly yield results
 * @throws {RangeError} If latitude, longitude, or tilt are out of bounds
 * @example
 * const monthly = calculateMonthlyYield(location, panel, derating, weather);
 * console.log(monthly[0].energy); // January yield in kWh
 */
export function calculateMonthlyYield(
  location: Location,
  panel: PanelConfig,
  derating: DeratingFactors,
  weather: WeatherData
): readonly MonthlyYield[] {
  if (location.latitude < -90 || location.latitude > 90) {
    throw new RangeError("Latitude must be between -90 and 90 degrees");
  }
  if (location.longitude < -180 || location.longitude > 180) {
    throw new RangeError("Longitude must be between -180 and 180 degrees");
  }
  if (panel.tilt < 0 || panel.tilt > 90) {
    throw new RangeError("Panel tilt must be between 0 and 90 degrees");
  }

  const monthlyResults: MonthlyYield[] = [];
  const daysInMonth = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

  for (let month = 1; month <= 12; month++) {
    const dayOfYear = Math.floor(
      (month - 1) * 30.4 + 15
    ); // Representative day of year
    const declination = calculateDeclination(dayOfYear);
    const monthlyTemp = weather.monthlyTemperatures.find(
      (t) => t.month === month
    ) ?? { month, averageHigh: 20, averageLow: 10 };

    let totalEnergyWh = 0;
    let totalIrradiance = 0;
    let hourCount = 0;

    // Calculate hourly from sunrise to sunset
    for (let hour = 5; hour <= 19; hour += 0.5) {
      const solarTime = hour;
      const hourAngle = calculateHourAngle(solarTime);
      const altitude = calculateAltitude(
        location.latitude,
        declination,
        hourAngle
      );

      if (altitude <= 0) continue;

      const azimuth = calculateAzimuth(
        location.latitude,
        declination,
        hourAngle,
        altitude
      );

      const incidenceAngle = calculateIncidenceAngle(
        panel.tilt,
        panel.azimuth,
        altitude,
        azimuth
      );

      const dni = estimateClearSkyIrradiance(altitude, location.elevation);
      const dhi = dni * 0.1; // Simple diffuse model
      const gti = calculateTiltedIrradiance(dni, dhi, panel.tilt, incidenceAngle);

      const cellTemp = estimateCellTemperature(
        (monthlyTemp.averageHigh + monthlyTemp.averageLow) / 2,
        gti
      );

      const tempDerating = calculateTemperatureDerating(
        cellTemp,
        panel.temperatureCoefficient
      );

      const systemEfficiency = Math.max(0, Math.min(1,
        tempDerating *
        derating.soiling *
        derating.shading *
        derating.wiringLosses *
        derating.mismatch *
        derating.age *
        derating.availability *
        derating.inverterEfficiency
      ));

      const hourlyEnergyWh = gti * (panel.panelArea ?? 1.6) *
        systemEfficiency * 0.5; // 0.5 hour time step

      totalEnergyWh += hourlyEnergyWh;
      totalIrradiance += gti;
      hourCount++;
    }

    const peakSunHours = totalIrradiance > 0 ? totalIrradiance / 1000 : 0;
    const energyKwh = totalEnergyWh / 1000;
    const averageEfficiency = hourCount > 0 ?
      (totalEnergyWh / (totalIrradiance * (panel.panelArea ?? 1.6) * 0.5)) : 0;

    monthlyResults.push({
      month,
      energy: Math.max(0, energyKwh),
      peakSunHours: Math.max(0, peakSunHours),
      averageEfficiency: Math.max(0, Math.min(1, averageEfficiency)),
    });
  }

  return monthlyResults;
}

/**
 * Calculates annual energy yield from monthly results.
 * @param monthlyYields - Array of monthly yield data
 * @returns Annual yield summary
 * @example
 * const monthly = calculateMonthlyYield(...);
 * const annual = calculateAnnualYield(monthly);
 * console.log(annual.totalEnergy); // Total annual kWh
 */
export function calculateAnnualYield(
  monthlyYields: readonly MonthlyYield[]
): AnnualYield {
  const totalEnergy = monthlyYields.reduce(
    (sum, month) => sum + month.energy,
    0
  );

  const ratedPower = 1000; // Assume 1 kW for capacity factor calculation
  const capacityFactor = totalEnergy / (ratedPower * 24 * 365);

  return {
    totalEnergy,
    capacityFactor: Math.max(0, Math.min(1, capacityFactor)),
    monthlyBreakdown: monthlyYields,
  };
}

/**
 * Calculates optimal string sizing for solar panels and inverter.
 * @param params - Panel electrical parameters and inverter limits
 * @returns String sizing recommendations and safety checks
 * @throws {RangeError} If any electrical parameter is non-positive
 * @example
 * const sizing = calculateStringSizing({
 *   panelVoc: 45,
 *   panelIsc: 10,
 *   panelVmp: 38,
 *   panelImp: 9.5,
 *   inverterMpptMin: 150,
 *   inverterMpptMax: 500,
 *   inverterMaxCurrent: 20
 * });
 */
export function calculateStringSizing(
  params: StringSizingParams
): StringSizingResult {
  if (params.panelVoc <= 0) throw new RangeError("Panel Voc must be positive");
  if (params.panelIsc <= 0) throw new RangeError("Panel Isc must be positive");
  if (params.panelVmp <= 0) throw new RangeError("Panel Vmp must be positive");
  if (params.panelImp <= 0) throw new RangeError("Panel Imp must be positive");
  if (params.inverterMpptMin <= 0) {
    throw new RangeError("Inverter MPPT minimum must be positive");
  }
  if (params.inverterMpptMax <= params.inverterMpptMin) {
    throw new RangeError("Inverter MPPT maximum must be greater than minimum");
  }
  if (params.inverterMaxCurrent <= 0) {
    throw new RangeError("Inverter max current must be positive");
  }

  const safetyFactor = params.safetyFactor ?? 1.1;
  const maxSystemVoltage = params.maxStringVoltage ?? 1000;

  // Cold temperature voltage increase (assume -10°C, 0.33%/°C coefficient)
  const coldTempIncrease = 1 + (35 * 0.0033); // From 25°C to -10°C
  const coldTempVoltage = params.panelVoc * coldTempIncrease;

  // Maximum panels per string based on voltage limits
  const maxByMppt = Math.floor(params.inverterMpptMax / coldTempVoltage);
  const maxBySystem = Math.floor(maxSystemVoltage / coldTempVoltage);
  const maxPanelsPerString = Math.min(maxByMppt, maxBySystem);

  // Minimum panels per string based on MPPT minimum
  const minPanelsPerString = Math.ceil(
    params.inverterMpptMin / params.panelVmp
  );

  // Maximum strings per inverter based on current
  const maxStringsByCurrent = Math.floor(
    params.inverterMaxCurrent / params.panelIsc
  );

  // Recommended strings (aim for 80-90% of inverter capacity)
  const targetPower = params.inverterMaxCurrent * params.inverterMpptMax * 0.85;
  const panelPower = params.panelVmp * params.panelImp;
  const recommendedStrings = Math.max(1,
    Math.min(
      maxStringsByCurrent,
      Math.floor(targetPower / (panelPower * maxPanelsPerString))
    )
  );

  const maxPower = panelPower * maxPanelsPerString * recommendedStrings;
  const isWithinLimits = minPanelsPerString <= maxPanelsPerString &&
    recommendedStrings <= maxStringsByCurrent;

  return {
    maxPanelsPerString,
    minPanelsPerString,
    maxStringsPerInverter: maxStringsByCurrent,
    recommendedStrings,
    maxPower,
    isWithinLimits,
    coldTempVoltage: isWithinLimits ? coldTempVoltage : undefined,
  };
}