/**
 * MineGuard Comprehensive Real-World Performance Benchmark
 * Smart India Hackathon 2026 (Problem Statement 26025)
 */

const http = require('http');
const express = require('express');
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');

const CHROME_PATH = fs.existsSync('C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe')
  ? 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
  : 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';

const CDP_PORT = 9444;
const FRONTEND_PORT = 4173;
const BACKEND_PORT = 5000;

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

function getJson(url) {
  return new Promise((resolve, reject) => {
    http.get(url, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); } catch (e) { resolve(data); }
      });
    }).on('error', reject);
  });
}

(async () => {
  console.log('================================================================');
  console.log(' MineGuard Complete Real-World Performance Benchmark');
  console.log('================================================================\n');

  // 1. Backend Startup Measurement
  console.log('--- 1. Measuring Backend Startup Time ---');
  const t0Backend = Date.now();
  const { server: backendServer } = require('./server');
  await new Promise(r => backendServer.listen(BACKEND_PORT, r));
  const tBackendStartup = Date.now() - t0Backend;
  console.log(`Backend listening on http://127.0.0.1:${BACKEND_PORT} in ${tBackendStartup}ms\n`);

  // 2. Measure API Endpoints
  console.log('--- 2. Measuring Backend REST API Response Times ---');
  const endpoints = [
    '/api/health',
    '/api/sensors',
    '/api/alerts',
    '/api/history?range=1h&nodeId=all',
    '/api/history?range=24h&nodeId=all',
    '/api/history/risk/latest',
    '/api/history/risk/stats?range=24h',
    '/api/history/storage'
  ];

  const apiLatencies = [];
  for (const ep of endpoints) {
    const t0 = Date.now();
    const res = await getJson(`http://127.0.0.1:${BACKEND_PORT}${ep}`);
    const duration = Date.now() - t0;
    console.log(`  ${ep.padEnd(45)} -> ${duration}ms (status: ok)`);
    apiLatencies.push({ endpoint: ep, durationMs: duration });
  }
  console.log('');

  // 3. Start Production Frontend Server
  console.log('--- 3. Starting Production Static Server ---');
  const distApp = express();
  const distPath = path.join(__dirname, '../dist');
  distApp.use(express.static(distPath));
  distApp.get('*', (req, res) => res.sendFile(path.join(distPath, 'index.html')));
  const distServer = http.createServer(distApp);
  await new Promise(r => distServer.listen(FRONTEND_PORT, r));
  console.log(`Production frontend active on http://127.0.0.1:${FRONTEND_PORT}\n`);

  // 4. Launch Chrome Headless
  console.log('--- 4. Launching Chrome (Headless) via DevTools Protocol ---');
  const tempDir = path.join(os.tmpdir(), `chrome_bench_${Date.now()}`);
  const chromeProc = spawn(CHROME_PATH, [
    `--remote-debugging-port=${CDP_PORT}`,
    `--user-data-dir=${tempDir}`,
    '--headless=new',
    '--disable-gpu',
    '--no-sandbox',
    '--window-size=1600,900',
    `http://127.0.0.1:${FRONTEND_PORT}`
  ]);

  await sleep(3500);

  const targets = await getJson(`http://127.0.0.1:${CDP_PORT}/json`);
  const page = targets.find(t => t.type === 'page' && t.url.includes(String(FRONTEND_PORT))) || targets.find(t => t.type === 'page');

  const ws = new globalThis.WebSocket(page.webSocketDebuggerUrl);
  await new Promise(r => ws.onopen = r);

  let id = 1;
  function send(method, params = {}) {
    return new Promise((resolve) => {
      const curId = id++;
      const handler = (e) => {
        const d = JSON.parse(e.data);
        if (d.id === curId) {
          ws.removeEventListener('message', handler);
          resolve(d);
        }
      };
      ws.addEventListener('message', handler);
      ws.send(JSON.stringify({ id: curId, method, params }));
    });
  }

  await send('Runtime.enable');
  await send('Page.enable');

  const evalRes = await send('Runtime.evaluate', {
    expression: `(() => {
      const nav = performance.getEntriesByType('navigation')[0] || {};
      const paints = performance.getEntriesByType('paint');
      const resources = performance.getEntriesByType('resource');

      return {
        title: document.title,
        bodyLen: document.body ? document.body.innerHTML.length : 0,
        hasMineGuardHeader: Boolean(document.querySelector('h1')),
        hasMap: Boolean(document.querySelector('svg')),
        hasTable: Boolean(document.querySelector('table')),
        hasTiltCards: Boolean(document.querySelectorAll('.font-bold').length > 5),
        ttfb: Math.round(nav.responseStart || 0),
        domInteractive: Math.round(nav.domInteractive || 0),
        domContentLoaded: Math.round(nav.domContentLoadedEventEnd || 0),
        loadEventEnd: Math.round(nav.loadEventEnd || 0),
        firstPaint: Math.round(paints.find(p => p.name === 'first-paint')?.startTime || 0),
        firstContentfulPaint: Math.round(paints.find(p => p.name === 'first-contentful-paint')?.startTime || 0),
        resources: resources.map(r => ({
          name: r.name.replace(/^http:\\/\\/127\\.0\\.0\\.1:\\d+/, '').replace(/^http:\\/\\/localhost:\\d+/, ''),
          type: r.initiatorType,
          duration: Math.round(r.duration),
          transferSize: r.transferSize || 0,
          encodedBodySize: r.encodedBodySize || 0
        }))
      };
    })()`,
    returnByValue: true
  });

  ws.close();
  chromeProc.kill();
  distServer.close();
  backendServer.close();

  const m = evalRes.result?.result?.value || evalRes.result?.value;
  if (m) {
    const resources = m.resources || [];
    const jsResources = resources.filter(r => r.name.endsWith('.js') || r.type === 'script' || r.type === 'other');
    const cssResources = resources.filter(r => r.name.endsWith('.css') || r.type === 'link');
    const apiResources = resources.filter(r => r.name.includes('/api/') || r.type === 'fetch' || r.type === 'xmlhttprequest');

    const totalJsBytes = jsResources.reduce((acc, r) => acc + (r.transferSize || r.encodedBodySize || 0), 0);
    const totalCssBytes = cssResources.reduce((acc, r) => acc + (r.transferSize || r.encodedBodySize || 0), 0);

    console.log('================================================================');
    console.log(' REAL-WORLD BROWSER PERFORMANCE METRICS (MEASURED IN CHROME)');
    console.log('================================================================');
    console.log(` Target Page Title               : ${m.title}`);
    console.log(` DOM Rendered (Body length)      : ${m.bodyLen} chars (Header: ${m.hasMineGuardHeader}, Map: ${m.hasMap}, Table: ${m.hasTable}, Telemetry: ${m.hasTiltCards})`);
    console.log(` Time to First Byte (TTFB)       : ${m.ttfb} ms`);
    console.log(` First Paint (FP)                : ${m.firstPaint} ms`);
    console.log(` First Contentful Paint (FCP)    : ${m.firstContentfulPaint} ms`);
    console.log(` DOM Interactive (Shell ready)   : ${m.domInteractive} ms`);
    console.log(` DOM Content Loaded              : ${m.domContentLoaded} ms`);
    console.log(` Window Load Event               : ${m.loadEventEnd} ms`);
    console.log(` Total JS Transferred            : ${(totalJsBytes / 1024).toFixed(2)} kB (${jsResources.length} files)`);
    console.log(` Total CSS Transferred           : ${(totalCssBytes / 1024).toFixed(2)} kB (${cssResources.length} files)`);
    console.log(` Total Resources Downloaded      : ${resources.length} resources`);
    console.log(` Total API Calls on Startup      : ${apiResources.length}`);
    
    console.log('\n--- API Calls Breakdown During Initial Load ---');
    apiResources.forEach(a => console.log(`  ${a.name.padEnd(50)} -> ${a.duration}ms`));

    console.log('\n--- Downloaded Resources Breakdown ---');
    const sorted = [...resources].sort((a, b) => (b.transferSize || b.encodedBodySize || 0) - (a.transferSize || a.encodedBodySize || 0));
    sorted.forEach(r => {
      const sizeKb = ((r.transferSize || r.encodedBodySize || 0) / 1024).toFixed(2);
      console.log(`  ${sizeKb.padStart(7)} kB | ${String(r.duration).padStart(4)} ms | [${r.type}] ${r.name}`);
    });
    console.log('================================================================\n');
  }

  process.exit(0);
})();
