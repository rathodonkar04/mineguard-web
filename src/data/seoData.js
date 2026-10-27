/**
 * MineGuard SEO & Metadata Registry
 * Provides canonical URLs, unique titles, descriptions, breadcrumb paths, and JSON-LD schema per view.
 */

export const BASE_URL = 'https://mineguard-monitoring.gov.in';

export const ROUTE_METADATA = {
  dashboard: {
    id: 'dashboard',
    path: '/',
    hash: '',
    title: 'MineGuard — Real-Time Mine Subsidence Monitoring Console | Panel 4 Operations',
    heading: 'Real-Time Mine Subsidence Monitoring Console',
    subheading: 'Live geotechnical inclinometer telemetry, spatial contour grid & early warning SCADA',
    description: 'Monitor real-time surface tilt, vertical subsidence displacement, and strata vibrations across Moonidih Colliery Panel P-4 in Dhanbad, India.',
    canonical: `${BASE_URL}/`,
    breadcrumbs: [
      { label: 'Home', path: '#/' },
      { label: 'Operations Console', path: '#/' }
    ]
  },
  nodes: {
    id: 'nodes',
    path: '/nodes',
    hash: 'nodes',
    title: 'Sensor Node Telemetry & Geotechnical Health | MineGuard',
    heading: 'Sensor Node Telemetry & Geotechnical Health',
    subheading: 'Multi-axis inclinometers, battery voltage, signal attenuation (RSSI) & hardware diagnostics',
    description: 'Inspect individual IoT sensor node metrics, 3D tilt vectors, and ESP-NOW mesh packet statistics across all active transect zones.',
    canonical: `${BASE_URL}/#/nodes`,
    breadcrumbs: [
      { label: 'Home', path: '#/' },
      { label: 'Sensor Array', path: '#/nodes' }
    ]
  },
  alerts: {
    id: 'alerts',
    path: '/alerts',
    hash: 'alerts',
    title: 'Geotechnical Alert Register & Hazard Mitigation | MineGuard',
    heading: 'Geotechnical Alert Register & Hazard Mitigation',
    subheading: 'Real-time strata anomaly alarms, threshold exceedances & operator acknowledgment register',
    description: 'View active geotechnical alarm sirens, critical deformation triggers, and emergency subsidence mitigation advisories complying with DGMS standards.',
    canonical: `${BASE_URL}/#/alerts`,
    breadcrumbs: [
      { label: 'Home', path: '#/' },
      { label: 'Alert Register', path: '#/alerts' }
    ]
  },
  forecast: {
    id: 'forecast',
    path: '/forecast',
    hash: 'forecast',
    title: 'Knothe Geotechnical Subsidence Prediction & Simulation | MineGuard',
    heading: 'Geotechnical Subsidence Prediction Engine',
    subheading: 'Knothe time-function forward forecasting, 24h & 7d horizons, angle of draw & parameter simulation',
    description: 'Forward-looking analytical subsidence forecasting using Knothe time-function and influence integration with parameter sensitivity envelopes for Moonidih Colliery Panel P-4.',
    canonical: `${BASE_URL}/#/forecast`,
    breadcrumbs: [
      { label: 'Home', path: '#/' },
      { label: 'Subsidence Forecast', path: '#/forecast' }
    ]
  },
  history: {
    id: 'history',
    path: '/history',
    hash: 'history',
    title: 'Historical Subsidence Progression & Inclinometer Analytics | MineGuard',
    heading: 'Historical Subsidence Progression & Inclinometer Analytics',
    subheading: 'Multi-day time-series telemetry, 1-minute aggregation rollups & longwall extraction trends',
    description: 'Analyze longitudinal subsidence profiles, surface slope inflection curves, and persistent PostgreSQL telemetry history over 1h, 6h, 24h, and 7d horizons.',
    canonical: `${BASE_URL}/#/history`,
    breadcrumbs: [
      { label: 'Home', path: '#/' },
      { label: 'Historical Analytics', path: '#/history' }
    ]
  },
  network: {
    id: 'network',
    path: '/network',
    hash: 'network',
    title: 'ESP-NOW Mesh Network Topology & Gateway Diagnostics | MineGuard',
    heading: 'ESP-NOW Mesh Network Topology & Gateway Diagnostics',
    subheading: '2.4 GHz RF link quality, self-healing multi-hop routes & packet delivery reliability',
    description: 'Diagnose wireless ESP-NOW subsurface mesh network topology, hop counts, RSSI link states, and gateway bridge latency in real time.',
    canonical: `${BASE_URL}/#/network`,
    breadcrumbs: [
      { label: 'Home', path: '#/' },
      { label: 'Mesh Topology', path: '#/network' }
    ]
  },
  reports: {
    id: 'reports',
    path: '/reports',
    hash: 'reports',
    title: 'AI Geotechnical Risk Assessment & Strata Hazard Reports | MineGuard',
    heading: 'AI Geotechnical Risk Assessment & Strata Hazard Reports',
    subheading: '16-feature statistical anomaly engine, confidence intervals & automated geotechnical audit',
    description: 'Automated machine-learning hazard assessment evaluating angular velocity, curvature changes, and strata vibration signatures to forecast impending caving.',
    canonical: `${BASE_URL}/#/reports`,
    breadcrumbs: [
      { label: 'Home', path: '#/' },
      { label: 'AI Risk Reports', path: '#/reports' }
    ]
  },
  settings: {
    id: 'settings',
    path: '/settings',
    hash: 'settings',
    title: 'System Configuration, Calibration & Custom Domain | MineGuard',
    heading: 'System Configuration, Calibration & Custom Domain',
    subheading: 'DGMS geotechnical thresholds, custom domain routing, SSL status & server endpoints',
    description: 'Configure warning/critical tilt thresholds, custom domain bindings, backend telemetry ingestion endpoints, and DGMS compliance parameters.',
    canonical: `${BASE_URL}/#/settings`,
    breadcrumbs: [
      { label: 'Home', path: '#/' },
      { label: 'System Settings', path: '#/settings' }
    ]
  },
  notfound: {
    id: 'notfound',
    path: '/404',
    hash: '404',
    title: '404 — Geotechnical Telemetry Not Found | MineGuard',
    heading: '404 — Geotechnical Telemetry Not Found',
    subheading: 'The requested surface monitoring transect or telemetry route could not be located',
    description: 'The requested MineGuard page or sensor endpoint does not exist. Return to the primary operations console or active alert register.',
    canonical: `${BASE_URL}/#/404`,
    breadcrumbs: [
      { label: 'Home', path: '#/' },
      { label: '404 Not Found', path: '#/404' }
    ]
  }
};

/**
 * Generate BreadcrumbList JSON-LD Schema
 */
export function generateBreadcrumbSchema(breadcrumbs) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: breadcrumbs.map((crumb, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: crumb.label,
      item: crumb.path.startsWith('#')
        ? `${BASE_URL}/${crumb.path}`
        : `${BASE_URL}${crumb.path}`
    }))
  };
}
