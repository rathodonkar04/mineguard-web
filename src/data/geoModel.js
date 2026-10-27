/**
 * MineGuard Geospatial Data Model
 * Smart India Hackathon 2026 (Problem Statement 26025)
 * 
 * Geographic reference benchmark:
 * Moonidih Colliery, Dhanbad, Jharkhand, India (~23.74° N, 86.35° E)
 * 
 * IMPORTANT COMPLIANCE NOTE:
 * All coordinates provided herein are provisional demonstration coordinates
 * for prototype visualization. They must be validated against official DGMS
 * mine lease plans and surveyed colliery boundary records before operational deployment.
 */

export const MINE_GIS_METADATA = {
  collieryName: "Moonidih Colliery",
  panelId: "Panel P-4",
  seam: "Seam XVI-T",
  miningMethod: "Mechanized Longwall with Powered Roof Supports (Goaf Caving)",
  extractionDepthMeters: 180,
  panelLengthMeters: 620,
  faceWidthMeters: 155,
  centerCoordinates: [23.7428, 86.3542], // [Latitude, Longitude]
  defaultZoom: 16,
  isProvisional: true,
  statutoryStandard: "DGMS Circular No. 3 (1998) Subsidence Monitoring Grid",
  disclaimer: "PROVISIONAL DEMONSTRATION COORDINATES — SUBJECT TO SURVEY VALIDATION"
};

/**
 * Provisional Sensor Node GPS Coordinates across extraction transect
 */
export const SENSOR_COORDINATES = {
  N1: {
    nodeId: "N1",
    canonicalId: "NODE_01",
    name: "Sensor Node 1 (Reference)",
    zone: "Zone A — North Stable Ground",
    role: "Baseline Reference Inclinometer",
    lat: 23.7460,
    lng: 86.3512,
    elevationMeters: 182.4
  },
  N2: {
    nodeId: "N2",
    canonicalId: "NODE_02",
    name: "Sensor Node 2 (Inflexion)",
    zone: "Zone B — Inflexion Area",
    role: "Tensile Strain Inclinometer & Mesh Relay",
    lat: 23.7440,
    lng: 86.3532,
    elevationMeters: 181.8
  },
  N3: {
    nodeId: "N3",
    canonicalId: "NODE_03",
    name: "Sensor Node 3 (Active Gateway)",
    zone: "Zone C — Active Caving Trough",
    role: "Maximum Subsidence Center & Root Mesh Gateway",
    lat: 23.7420,
    lng: 86.3552,
    elevationMeters: 180.2
  },
  N4: {
    nodeId: "N4",
    canonicalId: "NODE_04",
    name: "Sensor Node 4 (Flank Guard)",
    zone: "Zone D — South Flank & Railway Pillar",
    role: "Perimeter Protection Monitor",
    lat: 23.7402,
    lng: 86.3575,
    elevationMeters: 181.5
  }
};

/**
 * GeoJSON FeatureCollection defining:
 * 1. Panel P-4 extraction boundary polygon
 * 2. Active Longwall Goaf (caved goaf zone)
 * 3. Protected Surface Assets (Railway siding line, Village boundary, Substation)
 */
export const MINE_PANEL_GEOJSON = {
  type: "FeatureCollection",
  features: [
    // 1. Longwall Panel P-4 Boundary
    {
      type: "Feature",
      id: "panel-p4-boundary",
      properties: {
        layerType: "panel_boundary",
        name: "Longwall Panel P-4 Extraction Area",
        colliery: "Moonidih Colliery",
        depth: "180 m",
        panelLength: "620 m",
        faceWidth: "155 m",
        status: "Active Extraction",
        color: "#3F4A42",
        fillColor: "#3F4A42",
        fillOpacity: 0.08,
        weight: 2,
        dashArray: "6, 4"
      },
      geometry: {
        type: "Polygon",
        coordinates: [
          [
            [86.3498, 23.7472],
            [86.3575, 23.7472],
            [86.3588, 23.7388],
            [86.3510, 23.7388],
            [86.3498, 23.7472]
          ]
        ]
      }
    },

    // 2. Caved Goaf Zone (Active Subsidence Trough)
    {
      type: "Feature",
      id: "goaf-zone-active",
      properties: {
        layerType: "goaf_zone",
        name: "Active Goaf (Caved Strata Zone)",
        description: "Area of extracted coal seam where roof has caved in",
        hazardRating: "High Strata Movement",
        color: "#A84444",
        fillColor: "#A84444",
        fillOpacity: 0.18,
        weight: 1.5,
        dashArray: "4, 4"
      },
      geometry: {
        type: "Polygon",
        coordinates: [
          [
            [86.3530, 23.7445],
            [86.3570, 23.7445],
            [86.3568, 23.7405],
            [86.3528, 23.7405],
            [86.3530, 23.7445]
          ]
        ]
      }
    },

    // 3. Surface Infrastructure Asset: Railway Mineral Siding Line
    {
      type: "Feature",
      id: "asset-railway-siding",
      properties: {
        layerType: "surface_asset",
        assetCategory: "Transport Infrastructure",
        name: "BCCL Moonidih Railway Siding",
        statutoryLimit: "Max Tilt: 1.00° / Max Strain: 3.0 mm/m",
        color: "#333333",
        weight: 3.5,
        dashArray: "8, 4"
      },
      geometry: {
        type: "LineString",
        coordinates: [
          [86.3485, 23.7392],
          [86.3530, 23.7390],
          [86.3595, 23.7386],
          [86.3630, 23.7382]
        ]
      }
    },

    // 4. Surface Infrastructure Asset: Village Habitational Boundary
    {
      type: "Feature",
      id: "asset-village-boundary",
      properties: {
        layerType: "surface_asset",
        assetCategory: "Community Settlement",
        name: "Moonidih Basti Residential Area",
        statutoryDirective: "DGMS Buffer Pillar (Angle of Draw 65°)",
        color: "#A87925",
        fillColor: "#A87925",
        fillOpacity: 0.12,
        weight: 1.5,
        dashArray: "3, 3"
      },
      geometry: {
        type: "Polygon",
        coordinates: [
          [
            [86.3485, 23.7485],
            [86.3540, 23.7485],
            [86.3540, 23.7460],
            [86.3485, 23.7460],
            [86.3485, 23.7485]
          ]
        ]
      }
    },

    // 5. Surface Infrastructure Asset: High Voltage Electrical Substation
    {
      type: "Feature",
      id: "asset-substation",
      properties: {
        layerType: "surface_asset",
        assetCategory: "Power Infrastructure",
        name: "33kV Colliery Distribution Substation",
        color: "#4A5568",
        fillColor: "#4A5568",
        fillOpacity: 0.25,
        weight: 1.5
      },
      geometry: {
        type: "Polygon",
        coordinates: [
          [
            [86.3502, 23.7435],
            [86.3515, 23.7435],
            [86.3515, 23.7425],
            [86.3502, 23.7425],
            [86.3502, 23.7435]
          ]
        ]
      }
    }
  ]
};

/**
 * Validate user-uploaded GeoJSON object
 */
export function validateGeoJSON(data) {
  if (!data || typeof data !== 'object') {
    return { valid: false, error: "Invalid GeoJSON: input must be a JSON object." };
  }
  if (data.type === 'FeatureCollection') {
    if (!Array.isArray(data.features)) {
      return { valid: false, error: "Invalid FeatureCollection: 'features' must be an array." };
    }
    for (let i = 0; i < data.features.length; i++) {
      const f = data.features[i];
      if (!f || f.type !== 'Feature' || !f.geometry || !f.geometry.type || !f.geometry.coordinates) {
        return { valid: false, error: `Feature at index ${i} is missing valid geometry or coordinates.` };
      }
    }
    return { valid: true, count: data.features.length };
  } else if (data.type === 'Feature') {
    if (!data.geometry || !data.geometry.type || !data.geometry.coordinates) {
      return { valid: false, error: "Invalid Feature: missing geometry or coordinates." };
    }
    return { valid: true, count: 1 };
  }
  return { valid: false, error: "Unrecognized GeoJSON type. Expected 'FeatureCollection' or 'Feature'." };
}

/**
 * Permitted Basemap Tile Providers
 */
export const BASEMAP_PROVIDERS = {
  osm: {
    id: "osm",
    name: "OpenStreetMap Standard",
    url: "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a> contributors',
    maxZoom: 19
  },
  esriSatellite: {
    id: "esriSatellite",
    name: "Esri World Imagery (Satellite)",
    url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
    attribution: 'Tiles &copy; Esri &mdash; Source: Esri, i-cubed, USDA, USGS, AEX, GeoEye, Getmapping, Aerogrid, IGN, IGP, UPR-EGP, and the GIS User Community',
    maxZoom: 18
  },
  cartoPositron: {
    id: "cartoPositron",
    name: "CartoDB Positron (High Contrast)",
    url: "https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png",
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
    maxZoom: 19
  }
};
