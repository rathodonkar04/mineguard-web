/**
 * Test Suite: Geotechnical Subsidence Prediction Model
 * Smart India Hackathon 2026 (Problem Statement 26025)
 * 
 * Validates Knothe time-function calculations, Gaussian influence profiles,
 * analytical boundary limits, parameter validation, and forecast horizon envelopes.
 */

const {
  erf,
  validateGeotechnicalParameters,
  calculatePanelSubsidenceProperties,
  calculateKnotheSubsidence,
  calculateSpatialProfileAtPoint,
  generateForwardForecast,
  DEFAULT_MINE_PARAMETERS
} = require('./services/geotechnicalService');

let passed = 0;
let failed = 0;

function assert(condition, message) {
  if (condition) {
    console.log(` ✅ PASS: ${message}`);
    passed++;
  } else {
    console.error(` ❌ FAIL: ${message}`);
    failed++;
  }
}

function assertClose(actual, expected, tolerance, message) {
  const diff = Math.abs(actual - expected);
  if (diff <= tolerance) {
    console.log(` ✅ PASS: ${message} (Actual: ${actual}, Expected: ${expected} ± ${tolerance})`);
    passed++;
  } else {
    console.error(` ❌ FAIL: ${message} (Actual: ${actual}, Expected: ${expected}, Diff: ${diff} > ${tolerance})`);
    failed++;
  }
}

console.log('======================================================');
console.log(' Starting Knothe Geotechnical Model Test Suite...');
console.log('======================================================\n');

// -----------------------------------------------------------------------------
// 1. Error Function (erf) Numerical Approximations
// -----------------------------------------------------------------------------
console.log('--- Suite 1: Numerical erf(x) Approximation Tests ---');
assertClose(erf(0.0), 0.0, 1e-6, 'erf(0) must equal 0.0 exactly');
assertClose(erf(1.0), 0.84270079, 1e-4, 'erf(1.0) matches Abramowitz-Stegun reference 0.8427');
assertClose(erf(-1.0), -0.84270079, 1e-4, 'erf(-1.0) is symmetric: -erf(1.0)');
assertClose(erf(0.5), 0.52049988, 1e-4, 'erf(0.5) matches reference 0.5205');
assert(erf(4.0) > 0.99999, 'erf(4.0) approaches asymptotic limit of 1.0');
assert(erf(-4.0) < -0.99999, 'erf(-4.0) approaches asymptotic limit of -1.0');

// -----------------------------------------------------------------------------
// 2. Input Parameter Validation & Boundary Guarding
// -----------------------------------------------------------------------------
console.log('\n--- Suite 2: Parameter Validation & Edge Cases ---');
const defaultVal = validateGeotechnicalParameters({});
assert(defaultVal.valid === true, 'Default parameters validate with 0 errors');
assert(defaultVal.sanitized.miningDepth === 240.0, 'Default mining depth is 240.0m');

const negativeDepth = validateGeotechnicalParameters({ miningDepth: -50.0 });
assert(negativeDepth.valid === false, 'Rejects negative mining depth (-50m)');
assert(negativeDepth.errors.length > 0, 'Returns descriptive error message for invalid depth');

const extremeThickness = validateGeotechnicalParameters({ seamThickness: 25.0 });
assert(extremeThickness.valid === false, 'Rejects excessive seam thickness (25m > 15m max)');

const invalidSubsidenceFactor = validateGeotechnicalParameters({ subsidenceFactor: 1.5 });
assert(invalidSubsidenceFactor.valid === false, 'Rejects subsidence factor > 0.95 (conservation of volume)');

const nonNumericInput = validateGeotechnicalParameters({ knotheCoefficient: 'invalid-string' });
assert(nonNumericInput.valid === false, 'Rejects non-numeric parameter inputs');

// -----------------------------------------------------------------------------
// 3. Panel Property Derivations (R, Critical Width, S_max)
// -----------------------------------------------------------------------------
console.log('\n--- Suite 3: Geotechnical Geometry Derivations ---');
const props = calculatePanelSubsidenceProperties(DEFAULT_MINE_PARAMETERS);
// R = H / tan(beta) = 240 / tan(65 deg) = 240 / 2.1445 ~ 111.91m
assertClose(props.radiusOfInfluenceMeters, 111.91, 0.5, 'Radius of influence R ~ 111.91m for H=240m, beta=65°');
assertClose(props.angleOfDrawDeg, 25.0, 0.1, 'Angle of draw gamma = 90 - 65 = 25°');
assert(props.criticalWidthMeters > 200.0, 'Critical extraction width W_c ~ 223.8m');
assert(props.sMaxMm > 1000.0 && props.sMaxMm < 2000.0, 'S_max is in plausible range [1000mm, 2000mm]');
assert(props.maxTiltDeg > 0.2 && props.maxTiltDeg < 1.0, 'Max tilt is in plausible range [0.2°, 1.0°]');

// -----------------------------------------------------------------------------
// 4. Knothe Time Function Monotonicity & Asymptotics
// -----------------------------------------------------------------------------
console.log('\n--- Suite 4: Knothe Time Function Dynamics ---');
const sMax = 1500.0; // mm
const c = 0.035;    // day^-1

const t0 = calculateKnotheSubsidence(0, sMax, c);
assert(t0.subsidenceMm === 0.0, 'At t=0, subsidence S(0) = 0.0 mm');
assertClose(t0.subsidenceRateMmPerDay, c * sMax, 0.1, 'At t=0, rate is initial maximum dS/dt = c * S_max');

const t1 = calculateKnotheSubsidence(1, sMax, c);
const t7 = calculateKnotheSubsidence(7, sMax, c);
const t30 = calculateKnotheSubsidence(30, sMax, c);
const t100 = calculateKnotheSubsidence(100, sMax, c);
const t300 = calculateKnotheSubsidence(300, sMax, c);

assert(t1.subsidenceMm > t0.subsidenceMm, 'Subsidence strictly increases from day 0 to day 1');
assert(t7.subsidenceMm > t1.subsidenceMm, 'Subsidence strictly increases from day 1 to day 7');
assert(t30.subsidenceMm > t7.subsidenceMm, 'Subsidence strictly increases from day 7 to day 30');
assert(t100.subsidenceMm > t30.subsidenceMm, 'Subsidence strictly increases from day 30 to day 100');

assertClose(t300.subsidenceMm, sMax, 0.5, 'At t=300 days (~10*tau), subsidence converges to S_max');
assert(t7.subsidenceRateMmPerDay < t1.subsidenceRateMmPerDay, 'Subsidence rate strictly decelerates over time');

// -----------------------------------------------------------------------------
// 5. Spatial Influence Function Profile (Bals-Knothe Transect)
// -----------------------------------------------------------------------------
console.log('\n--- Suite 5: Spatial Influence Profile & 50% Ribside Rule ---');
const currentS = 1000.0; // mm
const R = 112.0;        // m

// At x = 0 (over the extraction panel edge / ribside boundary)
const pInflection = calculateSpatialProfileAtPoint(0, currentS, R);
assertClose(pInflection.subsidenceMm, 500.0, 0.1, '50% Rule: At x=0 (inflection point), S(0) = S_center / 2');
assert(pInflection.tiltMmPerM > 0, 'Surface tilt is positive over ribside');

// Compare tilt at x=0 with tilt at x=50m
const pFar = calculateSpatialProfileAtPoint(50, currentS, R);
assert(pInflection.tiltMmPerM > pFar.tiltMmPerM, 'Tilt is strictly maximized at inflection point x=0');

// Over goaf center (x = -150m < -R)
const pGoaf = calculateSpatialProfileAtPoint(-150, currentS, R);
assert(pGoaf.subsidenceMm > 950.0, 'Over goaf center (x=-150m), subsidence approaches full S(t)');

// Over solid unmined pillar (x = +150m > +R)
const pPillar = calculateSpatialProfileAtPoint(150, currentS, R);
assert(pPillar.subsidenceMm < 50.0, 'Beyond angle of draw (x=+150m), subsidence approaches 0 mm');

// -----------------------------------------------------------------------------
// 6. Forward Forecast Generation & Uncertainty Bounds
// -----------------------------------------------------------------------------
console.log('\n--- Suite 6: Forward Forecast Generation & Uncertainty Bounds ---');
const forecastResult = generateForwardForecast(DEFAULT_MINE_PARAMETERS, {
  nodeId: 'N3',
  currentDispMm: 2.16,
  currentTiltDeg: 2.41
});

assert(forecastResult.success === true, 'Forecast generated successfully');
assert(forecastResult.metadata.modelVersion === 'KNOTHE-DGMS-V1.2', 'Exposes model version metadata');
assert(Boolean(forecastResult.milestones.forecast24Hours), 'Produces +24 Hours milestone');
assert(Boolean(forecastResult.milestones.forecast7Days), 'Produces +7 Days milestone');

const m24 = forecastResult.milestones.forecast24Hours;
const m7d = forecastResult.milestones.forecast7Days;

assert(m7d.subsidenceExpectedMm >= m24.subsidenceExpectedMm, '7-Day subsidence is >= 24-Hour subsidence');

// Verify defensible parameter sensitivity envelopes (P10 <= Expected <= P90)
assert(m24.subsidenceP10Mm <= m24.subsidenceExpectedMm, '24h P10 lower bound <= expected subsidence');
assert(m24.subsidenceExpectedMm <= m24.subsidenceP90Mm, '24h expected subsidence <= P90 upper bound');

assert(m7d.subsidenceP10Mm <= m7d.subsidenceExpectedMm, '7d P10 lower bound <= expected subsidence');
assert(m7d.subsidenceExpectedMm <= m7d.subsidenceP90Mm, '7d expected subsidence <= P90 upper bound');

assert(Array.isArray(forecastResult.spatialTransect), 'Produces 2D spatial transect profile');
assert(forecastResult.spatialTransect.length > 10, 'Spatial transect has sufficient sampling points');

// -----------------------------------------------------------------------------
// SUMMARY
// -----------------------------------------------------------------------------
console.log('\n======================================================');
console.log(` GEOTECHNICAL MODEL TEST SUMMARY: ${passed} Passed, ${failed} Failed`);
console.log('======================================================\n');

if (failed > 0) {
  process.exit(1);
} else {
  process.exit(0);
}
