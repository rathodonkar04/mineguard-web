import React, { useEffect, useRef, useState, useCallback } from 'react';
import L from 'leaflet';
import { 
  MINE_GIS_METADATA, 
  SENSOR_COORDINATES, 
  MINE_PANEL_GEOJSON, 
  BASEMAP_PROVIDERS, 
  validateGeoJSON 
} from '../data/geoModel';

/**
 * Helper to get status color
 */
function getStatusColor(status) {
  const s = String(status || '').toLowerCase();
  if (s === 'critical') return '#A84444';
  if (s === 'warning') return '#A87925';
  return '#3F7655';
}

/**
 * Create custom industrial HTML DivIcon for a sensor node
 */
function createSensorDivIcon(node, isSelected) {
  const color = getStatusColor(node.status);
  const isCritical = String(node.status || '').toLowerCase() === 'critical';
  const tiltVal = typeof node.tilt === 'number' ? node.tilt.toFixed(2) : (node.tilt_angle ? Number(node.tilt_angle).toFixed(2) : '0.00');

  const html = `
    <div style="position: relative; display: flex; flex-direction: column; align-items: center; cursor: pointer;">
      ${isCritical ? `<div style="position: absolute; top: -6px; left: -6px; width: 44px; height: 44px; border-radius: 50%; background-color: rgba(168, 68, 68, 0.25); animation: ping 1.5s cubic-bezier(0, 0, 0.2, 1) infinite;"></div>` : ''}
      <div style="
        width: 32px;
        height: 32px;
        border-radius: 50%;
        background-color: #FFFFFF;
        border: ${isSelected ? '3px solid #222222' : `2.5px solid ${color}`};
        display: flex;
        align-items: center;
        justify-content: center;
        box-shadow: 0 2px 6px rgba(0,0,0,0.25);
        font-family: monospace;
        font-weight: bold;
        font-size: 11px;
        color: ${color};
        z-index: ${isSelected ? 100 : 10};
      ">
        ${node.id}
      </div>
      <div style="
        margin-top: 3px;
        background-color: rgba(255, 255, 255, 0.95);
        border: 1px solid #D8D8D5;
        padding: 1px 4px;
        font-size: 10px;
        font-family: monospace;
        font-weight: bold;
        color: #222222;
        border-radius: 2px;
        white-space: nowrap;
        box-shadow: 0 1px 3px rgba(0,0,0,0.1);
      ">
        ${tiltVal}°
      </div>
    </div>
  `;

  return L.divIcon({
    html,
    className: 'custom-sensor-icon',
    iconSize: [32, 54],
    iconAnchor: [16, 26],
    popupAnchor: [0, -28]
  });
}

/**
 * GisMineMap Component - Interactive Leaflet GIS Monitoring Map
 * Smart India Hackathon 2026 (Problem Statement 26025)
 */
export default function GisMineMap({ 
  nodes = [], 
  selectedNodeId = 'N3', 
  onSelectNode 
}) {
  const mapContainerRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const tileLayerRef = useRef(null);

  // Layer Groups
  const geoJsonLayerRef = useRef(null);
  const markersLayerRef = useRef(null);
  const meshLinksLayerRef = useRef(null);
  const deformationLayerRef = useRef(null);

  // Map state
  const [activeBasemap, setActiveBasemap] = useState('osm');
  const [showPanelBoundary, setShowPanelBoundary] = useState(true);
  const [showSurfaceAssets, setShowSurfaceAssets] = useState(true);
  const [showMeshLinks, setShowMeshLinks] = useState(true);
  const [showDeformationRisk, setShowDeformationRisk] = useState(true);
  const [activeGeoJson, setActiveGeoJson] = useState(MINE_PANEL_GEOJSON);

  // GeoJSON Import Modal State
  const [showImportModal, setShowImportModal] = useState(false);
  const [importInput, setImportInput] = useState('');
  const [importError, setImportError] = useState('');
  const [importSuccess, setImportSuccess] = useState('');

  // 1. Initialize Map Instance
  useEffect(() => {
    if (!mapContainerRef.current || mapInstanceRef.current) return;

    const map = L.map(mapContainerRef.current, {
      center: MINE_GIS_METADATA.centerCoordinates,
      zoom: MINE_GIS_METADATA.defaultZoom,
      zoomControl: false,
      attributionControl: false
    });

    // Custom attribution control (compact industrial style)
    L.control.attribution({
      position: 'bottomright',
      prefix: 'MineGuard GIS • DGMS Grid'
    }).addTo(map);

    // Zoom control in top-right
    L.control.zoom({ position: 'topright' }).addTo(map);

    // Initial base tile layer
    const provider = BASEMAP_PROVIDERS[activeBasemap] || BASEMAP_PROVIDERS.osm;
    tileLayerRef.current = L.tileLayer(provider.url, {
      attribution: provider.attribution,
      maxZoom: provider.maxZoom
    }).addTo(map);

    // Initialize layer groups
    geoJsonLayerRef.current = L.layerGroup().addTo(map);
    deformationLayerRef.current = L.layerGroup().addTo(map);
    meshLinksLayerRef.current = L.layerGroup().addTo(map);
    markersLayerRef.current = L.layerGroup().addTo(map);

    mapInstanceRef.current = map;

    // Invalidate size after layout stabilization
    const timer = setTimeout(() => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.invalidateSize();
      }
    }, 250);

    return () => {
      clearTimeout(timer);
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }
    };
  }, []);

  // 2. Switch Basemap Tiles
  useEffect(() => {
    if (!mapInstanceRef.current || !tileLayerRef.current) return;

    const provider = BASEMAP_PROVIDERS[activeBasemap] || BASEMAP_PROVIDERS.osm;
    mapInstanceRef.current.removeLayer(tileLayerRef.current);

    tileLayerRef.current = L.tileLayer(provider.url, {
      attribution: provider.attribution,
      maxZoom: provider.maxZoom
    }).addTo(mapInstanceRef.current);
  }, [activeBasemap]);

  // 3. Render GeoJSON Boundaries and Assets
  useEffect(() => {
    if (!mapInstanceRef.current || !geoJsonLayerRef.current) return;

    geoJsonLayerRef.current.clearLayers();

    if (!showPanelBoundary && !showSurfaceAssets) return;

    const filteredFeatures = (activeGeoJson.features || []).filter(f => {
      if (f.properties?.layerType === 'panel_boundary' || f.properties?.layerType === 'goaf_zone') {
        return showPanelBoundary;
      }
      if (f.properties?.layerType === 'surface_asset') {
        return showSurfaceAssets;
      }
      return true;
    });

    if (filteredFeatures.length === 0) return;

    const geoJsonData = {
      type: "FeatureCollection",
      features: filteredFeatures
    };

    L.geoJSON(geoJsonData, {
      style: (feature) => {
        const p = feature.properties || {};
        return {
          color: p.color || '#3F4A42',
          weight: p.weight || 2,
          opacity: 0.9,
          fillColor: p.fillColor || p.color || '#3F4A42',
          fillOpacity: p.fillOpacity || 0.1,
          dashArray: p.dashArray || null
        };
      },
      onEachFeature: (feature, layer) => {
        const p = feature.properties || {};
        const popupContent = `
          <div style="font-family: sans-serif; font-size: 11px; padding: 2px;">
            <strong style="color: #222222; font-size: 12px; display: block; margin-bottom: 2px;">
              ${p.name || 'Mine GIS Feature'}
            </strong>
            <span style="color: #666666; font-size: 10px; display: block; margin-bottom: 4px;">
              Category: ${p.layerType || 'Geotechnical Feature'}
            </span>
            ${p.depth ? `<div style="margin-top: 2px;"><strong>Extraction Depth:</strong> ${p.depth}</div>` : ''}
            ${p.statutoryLimit ? `<div style="margin-top: 2px; color: #A84444;"><strong>Statutory Limit:</strong> ${p.statutoryLimit}</div>` : ''}
            ${p.hazardRating ? `<div style="margin-top: 2px; color: #A87925;"><strong>Hazard Status:</strong> ${p.hazardRating}</div>` : ''}
            ${p.statutoryDirective ? `<div style="margin-top: 2px; color: #3F7655;"><strong>Safety Directive:</strong> ${p.statutoryDirective}</div>` : ''}
          </div>
        `;
        layer.bindPopup(popupContent);
      }
    }).addTo(geoJsonLayerRef.current);
  }, [activeGeoJson, showPanelBoundary, showSurfaceAssets]);

  // 4. Render Mesh Topology Links (ESP-NOW)
  useEffect(() => {
    if (!mapInstanceRef.current || !meshLinksLayerRef.current) return;

    meshLinksLayerRef.current.clearLayers();

    if (!showMeshLinks) return;

    const n1Coords = [SENSOR_COORDINATES.N1.lat, SENSOR_COORDINATES.N1.lng];
    const n2Coords = [SENSOR_COORDINATES.N2.lat, SENSOR_COORDINATES.N2.lng];
    const n3Coords = [SENSOR_COORDINATES.N3.lat, SENSOR_COORDINATES.N3.lng];
    const n4Coords = [SENSOR_COORDINATES.N4.lat, SENSOR_COORDINATES.N4.lng];

    // N1 -> N2 Hop
    const lineN1N2 = L.polyline([n1Coords, n2Coords], {
      color: '#3F4A42',
      weight: 2,
      dashArray: '4, 4',
      opacity: 0.8
    }).bindTooltip('ESP-NOW Hop 1: N1 ➔ N2 Relay', { permanent: false, direction: 'top' });

    // N2 -> N3 Hop
    const lineN2N3 = L.polyline([n2Coords, n3Coords], {
      color: '#3F4A42',
      weight: 2.5,
      opacity: 0.9
    }).bindTooltip('ESP-NOW Root Link: N2 ➔ N3 Gateway', { permanent: false, direction: 'top' });

    // N4 -> N3 Direct
    const lineN4N3 = L.polyline([n4Coords, n3Coords], {
      color: '#3F4A42',
      weight: 2,
      dashArray: '4, 4',
      opacity: 0.8
    }).bindTooltip('ESP-NOW Hop 1: N4 ➔ N3 Gateway', { permanent: false, direction: 'top' });

    meshLinksLayerRef.current.addLayer(lineN1N2);
    meshLinksLayerRef.current.addLayer(lineN2N3);
    meshLinksLayerRef.current.addLayer(lineN4N3);
  }, [showMeshLinks]);

  // 5. Render Deformation / Risk Gradient (Interpolated Visualization Layer)
  useEffect(() => {
    if (!mapInstanceRef.current || !deformationLayerRef.current) return;

    deformationLayerRef.current.clearLayers();

    if (!showDeformationRisk) return;

    // Draw estimated radial deformation gradient circles around each active node based on measured tilt
    nodes.forEach(node => {
      const geo = SENSOR_COORDINATES[node.id];
      if (!geo) return;

      const tilt = typeof node.tilt === 'number' ? node.tilt : (node.tilt_angle || 0.2);
      const isCrit = tilt >= 2.0;
      const isWarn = tilt >= 1.0 && tilt < 2.0;

      // Color and radius based on measured surface inclination
      const color = isCrit ? '#A84444' : isWarn ? '#A87925' : '#3F7655';
      const radiusMeters = isCrit ? 120 : isWarn ? 85 : 50;
      const opacity = isCrit ? 0.35 : isWarn ? 0.22 : 0.12;

      const circle = L.circle([geo.lat, geo.lng], {
        radius: radiusMeters,
        color: color,
        weight: 1,
        fillColor: color,
        fillOpacity: opacity,
        dashArray: '3, 3'
      });

      circle.bindTooltip(
        `<strong>Node ${node.id} Deformation Gradient</strong><br/>Measured Tilt: ${tilt.toFixed(2)}°<br/><span style="font-size:9.5px;color:#666;">Provisional Inverse Distance Interpolation</span>`,
        { direction: 'bottom' }
      );

      deformationLayerRef.current.addLayer(circle);
    });
  }, [nodes, showDeformationRisk]);

  // 6. Render Sensor Markers & Interactive Popups
  const markersMapRef = useRef({});

  // 6. Create / Update Markers & Interactive Popups (Depends only on nodes)
  useEffect(() => {
    if (!mapInstanceRef.current || !markersLayerRef.current) return;

    markersLayerRef.current.clearLayers();
    markersMapRef.current = {};

    nodes.forEach(node => {
      const geo = SENSOR_COORDINATES[node.id];
      if (!geo) return;

      const isSelected = selectedNodeId === node.id;
      const icon = createSensorDivIcon(node, isSelected);

      const marker = L.marker([geo.lat, geo.lng], {
        icon,
        title: `Node ${node.id} (${geo.zone})`,
        zIndexOffset: isSelected ? 1000 : 100
      });

      // Construct popup content
      const tiltVal = typeof node.tilt === 'number' ? node.tilt.toFixed(2) : (node.tilt_angle ? Number(node.tilt_angle).toFixed(2) : '0.00');
      const dispVal = typeof node.displacement === 'number' ? node.displacement.toFixed(2) : '0.40';
      const tempVal = typeof node.temperature === 'number' ? node.temperature.toFixed(1) : '26.5';
      const vibVal = typeof node.vibration === 'number' ? node.vibration.toFixed(2) : '0.02';
      const anomalyVal = node.anomalyScore || node.ai_anomaly_score || 15;
      const statusColor = getStatusColor(node.status);

      const popupHtml = document.createElement('div');
      popupHtml.style.fontFamily = 'Inter, sans-serif';
      popupHtml.style.fontSize = '11px';
      popupHtml.style.color = '#222222';
      popupHtml.style.minWidth = '220px';

      popupHtml.innerHTML = `
        <div style="border-bottom: 1px solid #D8D8D5; padding-bottom: 5px; margin-bottom: 6px; display: flex; justify-content: space-between; align-items: center;">
          <div>
            <strong style="font-size: 13px; color: #222222;">Node ${node.id}</strong>
            <span style="font-size: 10px; color: #666666; display: block;">${geo.canonicalId} • ${geo.zone}</span>
          </div>
          <span style="background-color: ${statusColor}; color: #FFFFFF; font-weight: bold; font-size: 9.5px; padding: 2px 6px; text-transform: uppercase;">
            ${node.status || 'Safe'}
          </span>
        </div>

        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 4px; font-size: 10.5px; margin-bottom: 6px;">
          <div><strong>Surface Tilt:</strong> <span style="font-family: monospace; color: ${statusColor}; font-weight: bold;">${tiltVal}°</span></div>
          <div><strong>Displacement:</strong> <span style="font-family: monospace;">${dispVal} mm</span></div>
          <div><strong>Dynamic Vib:</strong> <span style="font-family: monospace;">${vibVal} g</span></div>
          <div><strong>Temperature:</strong> <span style="font-family: monospace;">${tempVal} °C</span></div>
          <div><strong>Anomaly AI:</strong> <span style="font-family: monospace; font-weight: bold;">${anomalyVal}/100</span></div>
          <div><strong>Signal RF:</strong> <span style="font-family: monospace;">${node.signalDbm || -72} dBm</span></div>
        </div>

        <div style="background-color: #F7F7F5; border: 1px solid #D8D8D5; padding: 4px; font-size: 9.5px; color: #666666; margin-bottom: 8px;">
          <div>GPS: ${geo.lat.toFixed(4)}°N, ${geo.lng.toFixed(4)}°E (Provisional)</div>
          <div>Gateway: ${node.gateway_id || 'N3'} • Hops: ${node.hop_count ?? 1}</div>
        </div>

        <button 
          id="select-btn-${node.id}"
          class="focus-node-popup-btn"
          style="
            width: 100%;
            padding: 5px 8px;
            background-color: #3F4A42;
            color: #FFFFFF;
            border: none;
            font-size: 10.5px;
            font-weight: bold;
            cursor: pointer;
            letter-spacing: 0.5px;
          "
        >
          FOCUS SCHEMATIC & TELEMETRY
        </button>
      `;

      // Handle button click inside popup
      const selectBtn = popupHtml.querySelector(`#select-btn-${node.id}`);
      if (selectBtn) {
        selectBtn.onclick = (e) => {
          e.stopPropagation();
          if (onSelectNode) onSelectNode(node.id);
        };
      }

      marker.bindPopup(popupHtml);

      // Handle marker click
      marker.on('click', () => {
        if (onSelectNode) onSelectNode(node.id);
      });

      markersLayerRef.current.addLayer(marker);
      markersMapRef.current[node.id] = marker;
    });
  }, [nodes]);

  // 7. Update Marker Icons when selectedNodeId changes without re-rendering layers
  useEffect(() => {
    nodes.forEach(node => {
      const marker = markersMapRef.current[node.id];
      if (marker) {
        const isSelected = selectedNodeId === node.id;
        marker.setIcon(createSensorDivIcon(node, isSelected));
        marker.setZIndexOffset(isSelected ? 1000 : 100);
      }
    });
  }, [selectedNodeId, nodes]);

  // Recenter Map Helper
  const handleRecenter = () => {
    if (mapInstanceRef.current) {
      mapInstanceRef.current.setView(
        MINE_GIS_METADATA.centerCoordinates, 
        MINE_GIS_METADATA.defaultZoom,
        { animate: true }
      );
    }
  };

  // GeoJSON Import Confirmation
  const handleImportSubmit = (e) => {
    e.preventDefault();
    setImportError('');
    setImportSuccess('');

    try {
      const parsed = JSON.parse(importInput.trim());
      const validation = validateGeoJSON(parsed);

      if (!validation.valid) {
        setImportError(validation.error);
        return;
      }

      // Merge with base assets
      const importedFeatures = parsed.type === 'FeatureCollection' ? parsed.features : [parsed];
      setActiveGeoJson(prev => ({
        type: "FeatureCollection",
        features: [...prev.features, ...importedFeatures]
      }));

      setImportSuccess(`Successfully imported ${importedFeatures.length} GeoJSON feature(s).`);
      setTimeout(() => {
        setShowImportModal(false);
        setImportInput('');
        setImportSuccess('');
      }, 1200);
    } catch (_err) {
      setImportError('Failed to parse JSON string. Ensure valid GeoJSON format.');
    }
  };

  return (
    <div className="bg-[#FFFFFF] border border-[#D8D8D5] flex flex-col h-full select-none font-sans overflow-hidden">
      
      {/* 1. Map Toolbar & Layer Controls */}
      <div className="px-3 sm:px-4 py-2 border-b border-[#D8D8D5] bg-[#F7F7F5] flex flex-wrap items-center justify-between gap-2 text-xs">
        
        {/* Title & Coordinates Info */}
        <div className="flex items-center gap-2">
          <span className="w-2.5 h-2.5 bg-[#3F4A42]"></span>
          <div>
            <div className="font-bold text-[11px] sm:text-xs text-[#222222] uppercase tracking-wide">
              MOONIDIH COLLIERY GIS SURFACE MONITORING
            </div>
            <div className="text-[9.5px] sm:text-[10.5px] text-[#666666]">
              Panel P-4 Center: <span className="font-mono font-semibold">23.7428°N, 86.3542°E</span> • Reference Datum: WGS84
            </div>
          </div>
        </div>

        {/* Controls: Basemap + Layers + Recenter */}
        <div className="flex flex-wrap items-center gap-2 text-[10.5px]">
          
          {/* Basemap Switcher */}
          <div className="flex items-center gap-1 bg-[#FFFFFF] border border-[#D8D8D5] px-2 py-1">
            <span className="text-[#888888] font-semibold text-[10px]">BASEMAP:</span>
            <select
              value={activeBasemap}
              onChange={(e) => setActiveBasemap(e.target.value)}
              className="bg-transparent text-[#222222] font-semibold focus:outline-none cursor-pointer"
              aria-label="Select Basemap Provider"
            >
              <option value="osm">OpenStreetMap</option>
              <option value="esriSatellite">Esri Satellite (Imagery)</option>
              <option value="cartoPositron">CartoDB Positron</option>
            </select>
          </div>

          {/* Quick Action: Reset Center */}
          <button
            onClick={handleRecenter}
            className="px-2.5 py-1 bg-[#FFFFFF] hover:bg-[#EAEAE7] border border-[#D8D8D5] text-[#222222] font-semibold transition-colors"
            title="Recenter Map on Panel P-4"
          >
            ⌖ CENTER
          </button>

          {/* Import GeoJSON Button */}
          <button
            onClick={() => setShowImportModal(true)}
            className="px-2.5 py-1 bg-[#FFFFFF] hover:bg-[#EAEAE7] border border-[#D8D8D5] text-[#3F4A42] font-semibold transition-colors flex items-center gap-1"
          >
            <span>+ GEOJSON</span>
          </button>
        </div>
      </div>

      {/* 2. Layer Toggle Filter Bar */}
      <div className="px-3 sm:px-4 py-1.5 bg-[#FFFFFF] border-b border-[#D8D8D5] flex flex-wrap items-center justify-between gap-2 text-[10.5px] text-[#666666]">
        <div className="flex flex-wrap items-center gap-3 sm:gap-4">
          <span className="font-bold text-[#222222] text-[10px] uppercase tracking-wider">LAYERS:</span>
          
          <label className="flex items-center gap-1 cursor-pointer select-none">
            <input 
              type="checkbox" 
              checked={showPanelBoundary} 
              onChange={(e) => setShowPanelBoundary(e.target.checked)}
              className="rounded-none text-[#3F4A42] focus:ring-0" 
            />
            <span>Panel Boundary &amp; Goaf</span>
          </label>

          <label className="flex items-center gap-1 cursor-pointer select-none">
            <input 
              type="checkbox" 
              checked={showSurfaceAssets} 
              onChange={(e) => setShowSurfaceAssets(e.target.checked)}
              className="rounded-none text-[#3F4A42] focus:ring-0" 
            />
            <span>Surface Assets (Railway / Village)</span>
          </label>

          <label className="flex items-center gap-1 cursor-pointer select-none">
            <input 
              type="checkbox" 
              checked={showMeshLinks} 
              onChange={(e) => setShowMeshLinks(e.target.checked)}
              className="rounded-none text-[#3F4A42] focus:ring-0" 
            />
            <span>ESP-NOW Wireless Mesh</span>
          </label>

          <label className="flex items-center gap-1 cursor-pointer select-none">
            <input 
              type="checkbox" 
              checked={showDeformationRisk} 
              onChange={(e) => setShowDeformationRisk(e.target.checked)}
              className="rounded-none text-[#3F4A42] focus:ring-0" 
            />
            <span className="font-semibold text-[#A84444]">Deformation Risk Gradient</span>
          </label>
        </div>

        {/* Selected Sensor Indicator */}
        <div className="font-mono text-[10.5px]">
          Active Focus: <strong className="text-[#222222]">Node {selectedNodeId}</strong>
        </div>
      </div>

      {/* 3. Main Leaflet Map Canvas */}
      <div className="relative flex-1 min-h-[380px] w-full bg-[#EAEAE7]">
        <div 
          ref={mapContainerRef} 
          className="absolute inset-0 w-full h-full z-0" 
          role="region"
          aria-label="Interactive Geographic GIS Map of Moonidih Colliery Panel P-4"
        />

        {/* Disclaimer Floating Badge (Statutory Compliance Rule 12) */}
        <div className="absolute top-2 left-2 z-[400] bg-white/90 backdrop-blur-xs border border-[#D8D8D5] px-2.5 py-1 text-[9.5px] text-[#666666] shadow-xs max-w-xs pointer-events-none">
          <div className="font-bold text-[#A84444] uppercase tracking-wide">Provisional GIS Reference</div>
          <div>Coordinates &amp; gradient circles for demonstration • Subject to ground-truth mine survey verification.</div>
        </div>

        {/* Map Legend Overlay (Bottom Left) */}
        <div className="absolute bottom-2 left-2 z-[400] bg-white/95 border border-[#D8D8D5] p-2 text-[10px] text-[#222222] shadow-xs space-y-1 hidden sm:block pointer-events-auto">
          <div className="font-bold text-[10.5px] border-b border-[#D8D8D5] pb-0.5 text-[#3F4A42] uppercase">
            GIS Transect Legend
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-[#3F7655]"></span>
            <span>Normal (&lt; 1.00° Safe)</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-[#A87925]"></span>
            <span>Advisory Warning (1.00°–2.00°)</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-[#A84444]"></span>
            <span>Critical Deformation (&gt; 2.00°)</span>
          </div>
          <div className="flex items-center gap-1.5 pt-0.5 border-t border-[#EAEAE7]">
            <span className="w-3 h-0.5 bg-[#3F4A42] border-t border-dashed"></span>
            <span className="text-[#666666]">ESP-NOW Mesh Link</span>
          </div>
        </div>
      </div>

      {/* 4. GeoJSON Import Modal */}
      {showImportModal && (
        <div className="fixed inset-0 z-[1000] bg-black/40 flex items-center justify-center p-4">
          <div className="bg-[#FFFFFF] border border-[#D8D8D5] max-w-lg w-full p-4 sm:p-5 space-y-3 shadow-lg text-xs">
            <div className="flex items-center justify-between border-b border-[#D8D8D5] pb-2">
              <span className="font-bold text-xs uppercase tracking-wide text-[#222222]">
                Import Custom Mining Panel GeoJSON
              </span>
              <button 
                onClick={() => { setShowImportModal(false); setImportError(''); }}
                className="text-[#888888] hover:text-[#222222] font-mono text-sm"
              >
                ✕
              </button>
            </div>

            <p className="text-[11px] text-[#666666]">
              Paste an official FeatureCollection or Feature GeoJSON object defining extraction panel outlines, fault zones, or surface structures.
            </p>

            {importError && (
              <div className="p-2 bg-[#FDF2F2] border-l-3 border-[#A84444] text-[#A84444] text-[11px]">
                {importError}
              </div>
            )}

            {importSuccess && (
              <div className="p-2 bg-[#F0FDF4] border-l-3 border-[#3F7655] text-[#3F7655] text-[11px]">
                {importSuccess}
              </div>
            )}

            <form onSubmit={handleImportSubmit} className="space-y-3">
              <textarea
                rows={6}
                value={importInput}
                onChange={(e) => setImportInput(e.target.value)}
                placeholder='{"type": "FeatureCollection", "features": [{ "type": "Feature", "geometry": { "type": "Polygon", "coordinates": [...] }, "properties": { "name": "New Extraction Panel" } }]}'
                className="w-full p-2 border border-[#D8D8D5] font-mono text-[10.5px] bg-[#F7F7F5] focus:outline-none focus:border-[#3F4A42]"
                required
              />

              <div className="flex items-center justify-end gap-2 pt-1 border-t border-[#D8D8D5]">
                <button
                  type="button"
                  onClick={() => setShowImportModal(false)}
                  className="px-3 py-1.5 bg-[#FFFFFF] border border-[#D8D8D5] text-[#666666] font-semibold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 bg-[#3F4A42] hover:bg-[#323B35] text-[#FFFFFF] font-bold"
                >
                  VALIDATE &amp; RENDER GEOJSON
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}
