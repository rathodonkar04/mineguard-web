/**
 * MineGuard Geotechnical Subsidence Prediction Service
 * Smart India Hackathon 2026 (Problem Statement 26025)
 * 
 * ============================================================================
 * GEOTECHNICAL MODEL SPECIFICATION: KNOTHE TIME-FUNCTION & INFLUENCE FUNCTION
 * ============================================================================
 * This service implements forward-looking surface subsidence, tilt, curvature,
 * and horizontal strain forecasts for underground longwall and bord-and-pillar
 * extraction panels based on established classical geotechnical literature:
 * 
 * 1. Knothe, S. (1957). "The rate of advance and the time factor of subsidence."
 *    Archives of Mining Sciences, 2(1), 73-86.
 * 2. Peng, S. S. (1992). "Surface Subsidence Engineering." SME, Littleton, CO.
 * 3. Karmis, M., et al. (1987). "Development of Subsidence Prediction Models
 *    for U.S. Coalfields."
 * 4. DGMS (India) Circulars & Standard Formulae for Extraction Panels
 *    (Raniganj & Jharia Coalfield longwall & depillaring benchmarks).
 * 
 * STATUTORY DISCLAIMER:
 * Calculations produced by this service are engineering estimates intended for
 * decision-support and proactive risk mitigation. Operational mine safety
 * determinations must be corroborated by certified statutory surveyor inspections.
 * ============================================================================
 */

// Mathematical Constants & Approximations
const DEG_TO_RAD = Math.PI / 180.0;
const RAD_TO_DEG = 180.0 / Math.PI;

/**
 * High-accuracy Error Function erf(x) approximation
 * Abramowitz and Stegun Formula 7.1.26 (Maximum error < 1.5e-7)
 * @param {number} x
 * @returns {number} erf(x)
 */
function erf(x) {
  if (x === 0) return 0;
  const sign = x < 0 ? -1 : 1;
  const absX = Math.abs(x);

  // Constants
  const p = 0.3275911;
  const a1 = 0.254829592;
  const a2 = -0.284496736;
  const a3 = 1.421413741;
  const a4 = -1.453152027;
  const a5 = 1.061405429;

  const t = 1.0 / (1.0 + p * absX);
  const poly = ((((a5 * t + a4) * t + a3) * t + a2) * t + a1) * t;
  const y = 1.0 - poly * Math.exp(-absX * absX);

  return sign * y;
}

/**
 * Standard Moonidih Colliery Panel P-4 Nominal Geotechnical Baseline
 * Provenance: Central Mining Planning and Design Institute (CMPDI) / DGMS Benchmarks
 */
const DEFAULT_MINE_PARAMETERS = {
  mineName: 'Moonidih Colliery',
  panelId: 'Panel P-4',
  seamName: 'XVI Seam',
  miningDepth: 240.0,            // H in meters (surface to seam roof)
  seamThickness: 2.50,           // m in meters (extracted height)
  seamDip: 0.0,                  // alpha in degrees (horizontal seam)
  subsidenceFactor: 0.75,        // a (dimensionless, caving method, 0.70-0.85)
  faceAdvanceRate: 3.20,         // v in meters/day (longwall shearer speed)
  knotheCoefficient: 0.035,      // c in day^-1 (rock mass response parameter)
  angleInfluence: 65.0,          // beta in degrees (main influence angle)
  panelWidth: 180.0,             // W in meters (face length)
  panelLength: 420.0,            // L in meters (panel run)
  dataQualityStatus: 'PROVISIONAL_CALIBRATED'
};

/**
 * Parameter Validation Ranges
 */
const VALIDATION_CONSTRAINTS = {
  miningDepth: { min: 30.0, max: 1500.0, unit: 'm', label: 'Mining Depth (H)' },
  seamThickness: { min: 0.5, max: 15.0, unit: 'm', label: 'Extracted Seam Thickness (m)' },
  seamDip: { min: 0.0, max: 60.0, unit: 'deg', label: 'Seam Dip Angle (alpha)' },
  subsidenceFactor: { min: 0.05, max: 0.95, unit: 'ratio', label: 'Subsidence Factor (a)' },
  faceAdvanceRate: { min: 0.1, max: 30.0, unit: 'm/day', label: 'Face Advance Rate (v)' },
  knotheCoefficient: { min: 0.002, max: 0.50, unit: 'day^-1', label: 'Knothe Time Coefficient (c)' },
  angleInfluence: { min: 40.0, max: 85.0, unit: 'deg', label: 'Angle of Main Influence (beta)' },
  panelWidth: { min: 20.0, max: 1000.0, unit: 'm', label: 'Panel Extraction Width (W)' },
  panelLength: { min: 50.0, max: 3000.0, unit: 'm', label: 'Panel Length (L)' }
};

/**
 * Validate input geotechnical parameters
 * @param {Object} params 
 * @returns {{ valid: boolean, errors: string[], sanitized: Object }}
 */
function validateGeotechnicalParameters(params = {}) {
  const sanitized = { ...DEFAULT_MINE_PARAMETERS, ...params };
  const errors = [];

  for (const [key, rules] of Object.entries(VALIDATION_CONSTRAINTS)) {
    const val = Number(sanitized[key]);
    if (isNaN(val)) {
      errors.push(`Parameter "${key}" must be a valid numeric value.`);
    } else if (val < rules.min || val > rules.max) {
      errors.push(`${rules.label} (${val} ${rules.unit}) is out of plausible geotechnical bounds [${rules.min}, ${rules.max} ${rules.unit}].`);
    } else {
      sanitized[key] = val;
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    sanitized
  };
}

/**
 * Calculate fundamental geotechnical subsidence properties
 * @param {Object} params Validated geotechnical parameters
 */
function calculatePanelSubsidenceProperties(params) {
  const H = params.miningDepth;
  const m = params.seamThickness;
  const a = params.subsidenceFactor;
  const alphaRad = params.seamDip * DEG_TO_RAD;
  const betaRad = params.angleInfluence * DEG_TO_RAD;
  const W = params.panelWidth;

  // 1. Angle of draw gamma (degrees)
  const angleOfDraw = Math.max(5.0, 90.0 - params.angleInfluence);

  // 2. Radius of main influence R (meters)
  // R = H / tan(beta)
  const radiusOfInfluence = H / Math.tan(betaRad);

  // 3. Critical extraction width W_c (meters)
  // W_c = 2 * R
  const criticalWidth = 2.0 * radiusOfInfluence;

  // 4. Subcritical reduction factor n
  // If panel width W < W_c, maximum subsidence is reduced
  const subcriticalFactor = W >= criticalWidth ? 1.0 : Math.min(1.0, Math.pow(W / criticalWidth, 0.9));

  // 5. Final theoretical maximum subsidence S_max (meters and millimeters)
  // S_max = m * a * cos(alpha) * n
  const sMaxMeters = m * a * Math.cos(alphaRad) * subcriticalFactor;
  const sMaxMm = sMaxMeters * 1000.0;

  // 6. Maximum theoretical tilt T_max (mm/m and degrees)
  // Occurs at the inflection point x = 0 (over panel ribside)
  // T_max = S_max / R
  const maxTiltMmPerM = sMaxMm / radiusOfInfluence;
  const maxTiltDeg = Math.atan(maxTiltMmPerM / 1000.0) * RAD_TO_DEG;

  // 7. Maximum theoretical curvature K_max (10^-3 m^-1)
  // K_max = sqrt(2*pi / e) * (S_max / R^2)
  const maxCurvature = Math.sqrt((2.0 * Math.PI) / Math.E) * (sMaxMeters / Math.pow(radiusOfInfluence, 2));

  // 8. Maximum theoretical horizontal displacement U_max (mm)
  // Avershin coefficient B ~ 0.35 * R
  const horizontalMovementFactor = 0.35 * radiusOfInfluence;
  const maxHorizontalDisplacementMm = 0.35 * sMaxMm;

  return {
    radiusOfInfluenceMeters: Number(radiusOfInfluence.toFixed(2)),
    criticalWidthMeters: Number(criticalWidth.toFixed(2)),
    subcriticalFactor: Number(subcriticalFactor.toFixed(3)),
    isSupercritical: W >= criticalWidth,
    sMaxMm: Number(sMaxMm.toFixed(1)),
    sMaxMeters: Number(sMaxMeters.toFixed(3)),
    angleOfDrawDeg: Number(angleOfDraw.toFixed(1)),
    maxTiltMmPerM: Number(maxTiltMmPerM.toFixed(2)),
    maxTiltDeg: Number(maxTiltDeg.toFixed(3)),
    maxCurvaturePerKm: Number((maxCurvature * 1000.0).toFixed(3)),
    maxHorizontalDisplacementMm: Number(maxHorizontalDisplacementMm.toFixed(1)),
    horizontalMovementFactor: Number(horizontalMovementFactor.toFixed(2))
  };
}

/**
 * Knothe Time Function: Calculate subsidence progression over time
 * Formula: S(t) = S_final * [1 - exp(-c * t)]
 * Rate: dS/dt = c * [S_final - S(t)]
 * 
 * @param {number} tDays Elapsed extraction time in days
 * @param {number} sFinalMm Asymptotic final subsidence in mm
 * @param {number} knotheC Time coefficient in day^-1
 * @returns {{ subsidenceMm: number, subsidenceRateMmPerDay: number }}
 */
function calculateKnotheSubsidence(tDays, sFinalMm, knotheC) {
  if (tDays <= 0) {
    return { subsidenceMm: 0.0, subsidenceRateMmPerDay: Number((knotheC * sFinalMm).toFixed(2)) };
  }
  const expTerm = Math.exp(-knotheC * tDays);
  const subsidenceMm = sFinalMm * (1.0 - expTerm);
  const subsidenceRate = knotheC * (sFinalMm - subsidenceMm);

  return {
    subsidenceMm: Number(subsidenceMm.toFixed(2)),
    subsidenceRateMmPerDay: Number(subsidenceRate.toFixed(2))
  };
}

/**
 * Calculate spatial distribution profile across transect distance x from panel ribside
 * Gaussian / Knothe influence function method
 * S(x, t) = (S(t) / 2) * [1 - erf(sqrt(pi) * x / R)]
 * 
 * @param {number} xMeters Distance from inflection point / ribside boundary (m)
 *                         x < 0 is over the goaf/extraction void
 *                         x = 0 is over the panel boundary (inflection point)
 *                         x > 0 is over the solid coal pillar / unmined zone
 * @param {number} currentSubsidenceMm Center subsidence at current time S(t)
 * @param {number} radiusOfInfluence R in meters
 * @returns {{ subsidenceMm: number, tiltDeg: number, tiltMmPerM: number, curvature: number, strainMmPerM: number }}
 */
function calculateSpatialProfileAtPoint(xMeters, currentSubsidenceMm, radiusOfInfluence) {
  if (currentSubsidenceMm <= 0 || radiusOfInfluence <= 0) {
    return { subsidenceMm: 0, tiltDeg: 0, tiltMmPerM: 0, curvature: 0, strainMmPerM: 0 };
  }

  const R = radiusOfInfluence;
  const x = xMeters;
  const sqrtPi = Math.sqrt(Math.PI);
  const z = (sqrtPi * x) / R;

  // 1. Point Subsidence S(x)
  const erfVal = erf(z);
  const sX = (currentSubsidenceMm / 2.0) * (1.0 - erfVal);

  // 2. Point Slope / Tilt T(x) = |dS/dx| = (S / R) * exp(-pi * (x/R)^2)
  const gaussian = Math.exp(-Math.PI * Math.pow(x / R, 2));
  const tiltMmPerM = (currentSubsidenceMm / R) * gaussian;
  const tiltDeg = Math.atan(tiltMmPerM / 1000.0) * RAD_TO_DEG;

  // 3. Point Curvature K(x) = d2S/dx2 = -(2 * pi * x / R^2) * (S / R) * exp(-pi * (x/R)^2)
  // Positive K = convex (hogging/tension, cracking danger)
  // Negative K = concave (sagging/compression)
  const curvaturePerKm = -(2.0 * Math.PI * x / Math.pow(R, 2)) * tiltMmPerM;

  // 4. Point Horizontal Strain epsilon(x) = -B * K(x)
  // B ~ 0.35 * R
  const strainMmPerM = -0.35 * R * (curvaturePerKm / 1000.0);

  return {
    subsidenceMm: Number(sX.toFixed(2)),
    tiltDeg: Number(tiltDeg.toFixed(3)),
    tiltMmPerM: Number(tiltMmPerM.toFixed(2)),
    curvaturePerKm: Number(curvaturePerKm.toFixed(4)),
    strainMmPerM: Number(strainMmPerM.toFixed(3))
  };
}

/**
 * Generate 24-Hour and 7-Day Forward Geotechnical Subsidence Forecasts
 * with Defensible Parameter Sensitivity Envelopes (Upper / Lower Bounds)
 * 
 * @param {Object} inputParams Mine extraction parameters
 * @param {Object} currentObservations Measured sensor telemetry { nodeId, currentTiltDeg, currentDispMm, elapsedDays }
 */
function generateForwardForecast(inputParams = {}, currentObservations = {}) {
  const validation = validateGeotechnicalParameters(inputParams);
  if (!validation.valid) {
    return {
      success: false,
      errors: validation.errors
    };
  }

  const params = validation.sanitized;
  const props = calculatePanelSubsidenceProperties(params);

  // Determine current baseline state
  // If elapsed time not provided, infer from current observed displacement or default to 15 days active extraction
  const observedDispMm = typeof currentObservations.currentDispMm === 'number' && currentObservations.currentDispMm > 0
    ? currentObservations.currentDispMm
    : 2.16; // Default demo baseline for N3 Gateway

  const observedTiltDeg = typeof currentObservations.currentTiltDeg === 'number' && currentObservations.currentTiltDeg > 0
    ? currentObservations.currentTiltDeg
    : 2.41;

  // Back-calculate effective elapsed days t_eff from observed displacement
  // S(t) = S_max * [1 - exp(-c * t)] => t = -ln(1 - S/S_max) / c
  let effectiveElapsedDays = typeof currentObservations.elapsedDays === 'number' && currentObservations.elapsedDays > 0
    ? currentObservations.elapsedDays
    : 14.0;

  if (observedDispMm > 0 && observedDispMm < props.sMaxMm * 0.95) {
    const ratio = Math.min(0.95, observedDispMm / props.sMaxMm);
    const calculatedDays = -Math.log(1.0 - ratio) / params.knotheCoefficient;
    if (!isNaN(calculatedDays) && calculatedDays > 0) {
      effectiveElapsedDays = Number(calculatedDays.toFixed(1));
    }
  }

  // Model Uncertainty Sensitivity Bounds (DGMS rock mass variability)
  // Upper bound (P90): Faster convergence c_upper = 1.30 * c, higher subsidence a_upper = min(0.92, 1.1 * a)
  // Lower bound (P10): Slower convergence c_lower = 0.70 * c, lower subsidence a_lower = max(0.50, 0.9 * a)
  const cNominal = params.knotheCoefficient;
  const cUpper = cNominal * 1.30;
  const cLower = cNominal * 0.70;

  const sMaxNominal = props.sMaxMm;
  const sMaxUpper = Math.min(params.seamThickness * 1000.0, sMaxNominal * 1.10);
  const sMaxLower = Math.max(sMaxNominal * 0.50, sMaxNominal * 0.90);

  // Time Horizons
  const HORIZONS = [
    { label: 'Current State', daysAhead: 0.0, timestampHours: 0 },
    { label: '+24 Hours', daysAhead: 1.0, timestampHours: 24 },
    { label: '+48 Hours', daysAhead: 2.0, timestampHours: 48 },
    { label: '+72 Hours', daysAhead: 3.0, timestampHours: 72 },
    { label: '+5 Days', daysAhead: 5.0, timestampHours: 120 },
    { label: '+7 Days', daysAhead: 7.0, timestampHours: 168 },
    { label: '+14 Days', daysAhead: 14.0, timestampHours: 336 },
    { label: '+30 Days (Asymptotic)', daysAhead: 30.0, timestampHours: 720 }
  ];

  const forecastPoints = HORIZONS.map(h => {
    const t = effectiveElapsedDays + h.daysAhead;

    // Nominal
    const nom = calculateKnotheSubsidence(t, sMaxNominal, cNominal);
    // Upper bound (P90)
    const upper = calculateKnotheSubsidence(t, sMaxUpper, cUpper);
    // Lower bound (P10)
    const lower = calculateKnotheSubsidence(t, sMaxLower, cLower);

    // Derived Surface Tilt at panel inflection point
    const tiltMmPerM = (nom.subsidenceMm / props.radiusOfInfluenceMeters);
    const tiltDeg = Math.atan(tiltMmPerM / 1000.0) * RAD_TO_DEG;

    const tiltUpperMmPerM = (upper.subsidenceMm / props.radiusOfInfluenceMeters);
    const tiltUpperDeg = Math.atan(tiltUpperMmPerM / 1000.0) * RAD_TO_DEG;

    const tiltLowerMmPerM = (lower.subsidenceMm / props.radiusOfInfluenceMeters);
    const tiltLowerDeg = Math.atan(tiltLowerMmPerM / 1000.0) * RAD_TO_DEG;

    // Indian DGMS Hazard Evaluation for Tilt & Subsidence
    let dgmsHazardLevel = 'SAFE';
    if (tiltDeg >= 2.0 || nom.subsidenceMm >= 1000.0) {
      dgmsHazardLevel = 'CRITICAL';
    } else if (tiltDeg >= 1.0 || nom.subsidenceMm >= 500.0) {
      dgmsHazardLevel = 'WARNING';
    }

    return {
      label: h.label,
      hoursAhead: h.timestampHours,
      daysAhead: h.daysAhead,
      elapsedTotalDays: Number(t.toFixed(1)),
      subsidenceExpectedMm: nom.subsidenceMm,
      subsidenceRateMmPerDay: nom.subsidenceRateMmPerDay,
      subsidenceP90Mm: upper.subsidenceMm,
      subsidenceP10Mm: lower.subsidenceMm,
      tiltExpectedDeg: Number(tiltDeg.toFixed(3)),
      tiltP90Deg: Number(tiltUpperDeg.toFixed(3)),
      tiltP10Deg: Number(tiltLowerDeg.toFixed(3)),
      dgmsHazardLevel
    };
  });

  // Extract key 24-hour and 7-day milestone records
  const horizon24h = forecastPoints.find(p => p.hoursAhead === 24);
  const horizon7d = forecastPoints.find(p => p.hoursAhead === 168);

  // Generate 2D spatial profile along transect [-150m (goaf), +150m (solid pillar)]
  const transectSamples = [];
  for (let x = -150; x <= 150; x += 15) {
    const currentProfile = calculateSpatialProfileAtPoint(x, forecastPoints[0].subsidenceExpectedMm, props.radiusOfInfluenceMeters);
    const forward24hProfile = calculateSpatialProfileAtPoint(x, horizon24h.subsidenceExpectedMm, props.radiusOfInfluenceMeters);
    const forward7dProfile = calculateSpatialProfileAtPoint(x, horizon7d.subsidenceExpectedMm, props.radiusOfInfluenceMeters);

    transectSamples.push({
      distanceMeters: x,
      zone: x < -30 ? 'GOAF (CAVED)' : x <= 30 ? 'RIBSIDE (MAX STRAIN)' : 'SOLID COAL PILLAR',
      current: currentProfile,
      forecast24h: forward24hProfile,
      forecast7d: forward7dProfile
    });
  }

  return {
    success: true,
    metadata: {
      modelVersion: 'KNOTHE-DGMS-V1.2',
      generatedAt: new Date().toISOString(),
      governingMethod: 'Knothe Time-Function & Gaussian Influence Integration',
      targetPanel: params.panelId,
      colliery: params.mineName,
      dataQualityStatus: params.dataQualityStatus || 'PROVISIONAL_CALIBRATED',
      effectiveElapsedDays: Number(effectiveElapsedDays.toFixed(1)),
      statutoryReference: 'DGMS Circular No. 2 of 2001 (Subsidence Control in Underground Coal Mines)'
    },
    inputParameters: params,
    panelProperties: props,
    milestones: {
      current: forecastPoints[0],
      forecast24Hours: horizon24h,
      forecast7Days: horizon7d
    },
    timeSeriesCurve: forecastPoints,
    spatialTransect: transectSamples
  };
}

module.exports = {
  DEFAULT_MINE_PARAMETERS,
  VALIDATION_CONSTRAINTS,
  erf,
  validateGeotechnicalParameters,
  calculatePanelSubsidenceProperties,
  calculateKnotheSubsidence,
  calculateSpatialProfileAtPoint,
  generateForwardForecast
};
