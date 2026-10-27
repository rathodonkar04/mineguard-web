/**
 * Mine & Multi-Tenant Hierarchy Controller
 * Smart India Hackathon 2026 (Problem Statement 26025)
 * 
 * Exposes REST endpoints for navigating colliery hierarchy, extraction panels,
 * and geotechnical parameters.
 */

const { 
  getFullHierarchy, 
  getAllMines, 
  getMineById, 
  getPanelById,
  getGeotechnicalParametersForPanel 
} = require('../services/mineHierarchyService');
const { getAllSensors } = require('../services/sensorService');

/**
 * GET /api/hierarchy
 * Returns the entire 4-tier organizational hierarchy
 */
function getHierarchy(req, res) {
  const hierarchy = getFullHierarchy();
  return res.status(200).json({
    success: true,
    count: hierarchy.length,
    hierarchy,
    timestamp: new Date().toISOString()
  });
}

/**
 * GET /api/mines
 * Returns summary list of all registered mines across all subsidiaries
 */
function getMines(req, res) {
  const mines = getAllMines();
  return res.status(200).json({
    success: true,
    count: mines.length,
    mines
  });
}

/**
 * GET /api/mines/:mineId
 * Returns specific mine details and its extraction panels
 */
function getMine(req, res) {
  const { mineId } = req.params;
  const mine = getMineById(mineId);

  if (!mine) {
    return res.status(404).json({
      success: false,
      error: `Mine "${mineId}" not found. Supported mines: MOONIDIH, JHARIA, RANIGANJ, PIPARWAR.`
    });
  }

  return res.status(200).json({
    success: true,
    mine
  });
}

/**
 * GET /api/mines/:mineId/panels/:panelId
 * Returns panel geotechnical configuration and Knothe parameters
 */
function getPanel(req, res) {
  const { mineId, panelId } = req.params;
  const panel = getPanelById(mineId, panelId);

  if (!panel) {
    return res.status(404).json({
      success: false,
      error: `Extraction panel "${panelId}" not found for mine "${mineId}".`
    });
  }

  const geotechnical = getGeotechnicalParametersForPanel(mineId, panelId);

  return res.status(200).json({
    success: true,
    panel,
    geotechnical
  });
}

/**
 * GET /api/mines/:mineId/panels/:panelId/sensors
 * Returns active telemetry sensors scoped to this panel
 */
function getPanelSensors(req, res) {
  const { mineId, panelId } = req.params;
  const panel = getPanelById(mineId, panelId);

  if (!panel) {
    return res.status(404).json({
      success: false,
      error: `Extraction panel "${panelId}" not found for mine "${mineId}".`
    });
  }

  // Filter runtime sensors mapped to this panel's node IDs
  const allSensors = getAllSensors();
  const targetNodeIds = new Set(panel.sensorNodeIds.map(id => id.toUpperCase()));

  const panelSensors = allSensors.filter(s => {
    const sId = (s.node_id || s.nodeId || '').toUpperCase();
    return targetNodeIds.has(sId) || targetNodeIds.has(`NODE_0${s.nodeId?.replace('N', '')}`);
  });

  return res.status(200).json({
    success: true,
    mineId: panel.mineId,
    panelId: panel.id,
    count: panelSensors.length,
    sensors: panelSensors
  });
}

module.exports = {
  getHierarchy,
  getMines,
  getMine,
  getPanel,
  getPanelSensors
};
