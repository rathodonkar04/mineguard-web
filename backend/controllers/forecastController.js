/**
 * MineGuard Geotechnical Forecast Controller
 * Smart India Hackathon 2026 (Problem Statement 26025)
 */

const {
  DEFAULT_MINE_PARAMETERS,
  VALIDATION_CONSTRAINTS,
  validateGeotechnicalParameters,
  calculatePanelSubsidenceProperties,
  generateForwardForecast
} = require('../services/geotechnicalService');
const { getSensorById, getAllSensors } = require('../services/sensorService');
const auditService = require('../services/auditService');

/**
 * GET /api/forecast/parameters
 * Retrieve baseline geotechnical parameters and input validation ranges
 */
function getParameters(req, res) {
  try {
    const properties = calculatePanelSubsidenceProperties(DEFAULT_MINE_PARAMETERS);
    return res.status(200).json({
      success: true,
      parameters: DEFAULT_MINE_PARAMETERS,
      constraints: VALIDATION_CONSTRAINTS,
      panelProperties: properties,
      retrievedAt: new Date().toISOString()
    });
  } catch (err) {
    console.error('[Forecast Controller Error - getParameters]', err);
    return res.status(500).json({
      success: false,
      error: 'Internal server error retrieving geotechnical parameters.'
    });
  }
}

/**
 * GET /api/forecast/subsidence
 * Generate forward subsidence forecasts for live monitored nodes
 * Query parameters:
 * - nodeId: (optional, defaults to 'N3' - active gateway)
 * - depth: (optional override for H)
 * - thickness: (optional override for m)
 * - knotheC: (optional override for c)
 */
function getSubsidenceForecast(req, res) {
  try {
    const { nodeId = 'N3', depth, thickness, knotheC } = req.query;

    const sensor = getSensorById(nodeId) || getSensorById('N3') || {
      nodeId: 'N3',
      tilt: 2.41,
      displacement: 2.16
    };

    // Allow optional query parameter overrides for quick testing
    const overrideParams = {};
    if (depth && !isNaN(Number(depth))) overrideParams.miningDepth = Number(depth);
    if (thickness && !isNaN(Number(thickness))) overrideParams.seamThickness = Number(thickness);
    if (knotheC && !isNaN(Number(knotheC))) overrideParams.knotheCoefficient = Number(knotheC);

    const mergedParams = { ...DEFAULT_MINE_PARAMETERS, ...overrideParams };

    const observations = {
      nodeId: sensor.nodeId || sensor.node_id || 'N3',
      currentTiltDeg: typeof sensor.tilt === 'number' ? sensor.tilt : 2.41,
      currentDispMm: typeof sensor.displacement === 'number' ? sensor.displacement : 2.16,
      sensorStatus: sensor.status || 'Normal',
      lastUpdate: sensor.timestamp || new Date().toISOString()
    };

    const forecast = generateForwardForecast(mergedParams, observations);

    if (!forecast.success) {
      return res.status(400).json({
        success: false,
        errors: forecast.errors
      });
    }

    return res.status(200).json({
      ...forecast,
      monitoredSensor: observations
    });
  } catch (err) {
    console.error('[Forecast Controller Error - getSubsidenceForecast]', err);
    return res.status(500).json({
      success: false,
      error: 'Internal server error computing subsidence forecast.'
    });
  }
}

/**
 * POST /api/forecast/calculate
 * Interactive simulation endpoint: calculate custom subsidence forecasts
 * Accepts user-supplied extraction panel parameters and observations
 */
function postCalculateForecast(req, res) {
  try {
    const body = req.body || {};
    const inputParams = body.parameters || body;
    const observations = body.observations || {
      nodeId: body.nodeId || 'N3',
      currentTiltDeg: body.currentTiltDeg || 2.41,
      currentDispMm: body.currentDispMm || 2.16
    };

    const forecast = generateForwardForecast(inputParams, observations);

    if (!forecast.success) {
      return res.status(400).json({
        success: false,
        errors: forecast.errors
      });
    }

    // Record audit event
    auditService.recordLog({
      user: req.user,
      action: 'FORECAST_SIMULATION',
      resource: 'KNOTHE_MODEL',
      details: {
        miningDepth: inputParams?.miningDepth,
        seamThickness: inputParams?.seamThickness,
        asymptoticMaxSubsidenceMm: forecast.panelProperties?.asymptoticMaxSubsidenceMm
      },
      ip: req.ip || req.headers['x-forwarded-for'] || '127.0.0.1'
    }).catch(() => {});

    return res.status(200).json(forecast);
  } catch (err) {
    console.error('[Forecast Controller Error - postCalculateForecast]', err);
    return res.status(500).json({
      success: false,
      error: 'Internal server error computing geotechnical forecast simulation.'
    });
  }
}

module.exports = {
  getParameters,
  getSubsidenceForecast,
  postCalculateForecast
};
