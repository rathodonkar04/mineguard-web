/**
 * MineGuard Multi-Mine Organizational Hierarchy Service
 * Smart India Hackathon 2026 (Problem Statement 26025)
 * 
 * Provides:
 * - 4-Tier Organizational Structure: Coalfield / Subsidiary -> Mine / Colliery -> Extraction Panel -> Gateway -> Nodes
 * - Geotechnical seam profiles, extraction methods, and depth benchmarks per panel
 * - Multi-tenant isolation and panel-scoped query filters
 * - Dynamic sensor node mapping per panel
 */

const COALFIELDS = [
  {
    id: 'BCCL',
    name: 'Bharat Coking Coal Limited',
    headquarters: 'Koyla Bhawan, Dhanbad, Jharkhand',
    region: 'Jharia Coalfield',
    statutoryZone: 'DGMS Eastern Zone (Dhanbad)',
    mines: [
      {
        id: 'MOONIDIH',
        name: 'Moonidih Colliery',
        area: 'Moonidih Project Area',
        state: 'Jharkhand',
        coordinates: [23.7428, 86.3542],
        elevationMeters: 182.0,
        establishedYear: 1974,
        strataType: 'Barakar Formation (Sandstone & Carbonaceous Shale Overburden)',
        panels: [
          {
            id: 'P-4',
            name: 'Panel P-4 (Longwall)',
            seam: 'Seam XVI-T',
            miningMethod: 'Mechanized Longwall with Powered Roof Supports (Goaf Caving)',
            depthMeters: 280,
            seamThicknessMeters: 2.4,
            faceWidthMeters: 155,
            panelLengthMeters: 620,
            advanceRateMetersPerDay: 3.5,
            angleDrawDeg: 25.0,
            subsidenceFactor: 0.72,
            knotheTimeFactor: 0.035,
            status: 'Active Extraction',
            gatewayId: 'N3',
            sensorNodeIds: ['NODE_01', 'NODE_02', 'NODE_03', 'NODE_04']
          },
          {
            id: 'P-5',
            name: 'Panel P-5 (Tailgate Development)',
            seam: 'Seam XVI-B',
            miningMethod: 'Continuous Miner with Cable Bolting',
            depthMeters: 310,
            seamThicknessMeters: 2.8,
            faceWidthMeters: 140,
            panelLengthMeters: 580,
            advanceRateMetersPerDay: 2.8,
            angleDrawDeg: 26.5,
            subsidenceFactor: 0.70,
            knotheTimeFactor: 0.030,
            status: 'Development',
            gatewayId: 'N5',
            sensorNodeIds: ['NODE_05', 'NODE_06']
          }
        ]
      },
      {
        id: 'JHARIA',
        name: 'Jharia Colliery',
        area: 'Lodna Area (Fire & Subsidence Zone)',
        state: 'Jharkhand',
        coordinates: [23.7500, 86.4150],
        elevationMeters: 175.0,
        establishedYear: 1920,
        strataType: 'Raniganj / Barakar Measures with Subsurface Thermal Zones',
        panels: [
          {
            id: 'J-2',
            name: 'Panel J-2 (Fire Overburden)',
            seam: 'Seam X',
            miningMethod: 'Bord & Pillar Depillaring with Hydraulic Sand Stowing',
            depthMeters: 160,
            seamThicknessMeters: 4.2,
            faceWidthMeters: 120,
            panelLengthMeters: 450,
            advanceRateMetersPerDay: 1.8,
            angleDrawDeg: 32.0,
            subsidenceFactor: 0.60,
            knotheTimeFactor: 0.045,
            status: 'Thermal Monitoring & Extraction',
            gatewayId: 'J1',
            sensorNodeIds: ['NODE_J1', 'NODE_J2', 'NODE_J3']
          }
        ]
      }
    ]
  },
  {
    id: 'ECL',
    name: 'Eastern Coalfields Limited',
    headquarters: 'Sanctoria, Dishergarh, West Bengal',
    region: 'Raniganj Coalfield',
    statutoryZone: 'DGMS South-Eastern Zone (Sitarampur)',
    mines: [
      {
        id: 'RANIGANJ',
        name: 'Raniganj Colliery',
        area: 'Sripur Area',
        state: 'West Bengal',
        coordinates: [23.6200, 87.1300],
        elevationMeters: 110.0,
        establishedYear: 1850,
        strataType: 'Dishergarh Sandstone Measures',
        panels: [
          {
            id: 'R-1',
            name: 'Panel R-1 (Continuous Miner)',
            seam: 'Dishergarh Seam',
            miningMethod: 'Mechanized Bord & Pillar with Continuous Miner',
            depthMeters: 220,
            seamThicknessMeters: 3.6,
            faceWidthMeters: 130,
            panelLengthMeters: 500,
            advanceRateMetersPerDay: 4.0,
            angleDrawDeg: 28.0,
            subsidenceFactor: 0.68,
            knotheTimeFactor: 0.038,
            status: 'Active Extraction',
            gatewayId: 'R1',
            sensorNodeIds: ['NODE_R1', 'NODE_R2']
          }
        ]
      }
    ]
  },
  {
    id: 'CCL',
    name: 'Central Coalfields Limited',
    headquarters: 'Darbhanga House, Ranchi, Jharkhand',
    region: 'North Karanpura Coalfield',
    statutoryZone: 'DGMS Central Zone (Ranchi)',
    mines: [
      {
        id: 'PIPARWAR',
        name: 'Piparwar Colliery',
        area: 'Piparwar Area',
        state: 'Jharkhand',
        coordinates: [23.8300, 85.0500],
        elevationMeters: 420.0,
        establishedYear: 1990,
        strataType: 'Massive Sandstone Bench Strata',
        panels: [
          {
            id: 'PW-1',
            name: 'Panel PW-1 (Overburden Transect)',
            seam: 'Dakra Seam',
            miningMethod: 'Highwall & Continuous Extraction',
            depthMeters: 195,
            seamThicknessMeters: 5.0,
            faceWidthMeters: 160,
            panelLengthMeters: 650,
            advanceRateMetersPerDay: 5.0,
            angleDrawDeg: 24.0,
            subsidenceFactor: 0.65,
            knotheTimeFactor: 0.040,
            status: 'Active Extraction',
            gatewayId: 'PW1',
            sensorNodeIds: ['NODE_PW1', 'NODE_PW2']
          }
        ]
      }
    ]
  }
];

// Flat lookup index
const MINES_MAP = new Map();
const PANELS_MAP = new Map();

COALFIELDS.forEach(cf => {
  cf.mines.forEach(mine => {
    MINES_MAP.set(mine.id.toUpperCase(), { ...mine, coalfieldId: cf.id, coalfieldName: cf.name });
    mine.panels.forEach(panel => {
      const panelKey = `${mine.id.toUpperCase()}_${panel.id.toUpperCase()}`;
      PANELS_MAP.set(panelKey, {
        ...panel,
        mineId: mine.id,
        mineName: mine.name,
        coalfieldId: cf.id,
        coalfieldName: cf.name
      });
    });
  });
});

/**
 * Returns the entire 4-tier organizational hierarchy
 */
function getFullHierarchy() {
  return JSON.parse(JSON.stringify(COALFIELDS));
}

/**
 * Returns a summary list of all registered mines
 */
function getAllMines() {
  const result = [];
  for (const [id, mine] of MINES_MAP.entries()) {
    result.push({
      id: mine.id,
      name: mine.name,
      coalfieldId: mine.coalfieldId,
      coalfieldName: mine.coalfieldName,
      area: mine.area,
      state: mine.state,
      coordinates: mine.coordinates,
      panelCount: mine.panels.length,
      activePanels: mine.panels.filter(p => p.status.includes('Active')).length,
      totalSensors: mine.panels.reduce((sum, p) => sum + p.sensorNodeIds.length, 0),
      strataType: mine.strataType
    });
  }
  return result;
}

/**
 * Get mine details by Mine ID (e.g. 'MOONIDIH', 'JHARIA')
 */
function getMineById(rawMineId) {
  if (!rawMineId || typeof rawMineId !== 'string') return null;
  const mine = MINES_MAP.get(rawMineId.trim().toUpperCase());
  return mine ? JSON.parse(JSON.stringify(mine)) : null;
}

/**
 * Get specific extraction panel by Mine ID and Panel ID (e.g. 'MOONIDIH', 'P-4')
 */
function getPanelById(rawMineId, rawPanelId) {
  if (!rawMineId || !rawPanelId) return null;
  const key = `${rawMineId.trim().toUpperCase()}_${rawPanelId.trim().toUpperCase()}`;
  const panel = PANELS_MAP.get(key);
  return panel ? JSON.parse(JSON.stringify(panel)) : null;
}

/**
 * Returns geotechnical parameters for Knothe subsidence modeling for the specified panel
 */
function getGeotechnicalParametersForPanel(rawMineId, rawPanelId) {
  const panel = getPanelById(rawMineId, rawPanelId);
  if (!panel) {
    // Default fallback to benchmark Moonidih Panel P-4
    return {
      mineId: 'MOONIDIH',
      panelId: 'P-4',
      miningDepthMeters: 280,
      seamThicknessMeters: 2.4,
      advanceRateMetersPerDay: 3.5,
      angleDrawDeg: 25.0,
      subsidenceFactor: 0.72,
      knotheTimeFactor: 0.035
    };
  }

  return {
    mineId: panel.mineId,
    panelId: panel.id,
    miningDepthMeters: panel.depthMeters,
    seamThicknessMeters: panel.seamThicknessMeters,
    advanceRateMetersPerDay: panel.advanceRateMetersPerDay,
    angleDrawDeg: panel.angleDrawDeg,
    subsidenceFactor: panel.subsidenceFactor,
    knotheTimeFactor: panel.knotheTimeFactor,
    seam: panel.seam,
    miningMethod: panel.miningMethod
  };
}

module.exports = {
  COALFIELDS,
  getFullHierarchy,
  getAllMines,
  getMineById,
  getPanelById,
  getGeotechnicalParametersForPanel
};
