/**
 * Test Suite: Role-Based Access Control, Stakeholder Profiles & Audit Logging
 * Smart India Hackathon 2026 (Problem Statement 26025)
 */

const http = require('http');
const express = require('express');
const cors = require('cors');

const authRoutes = require('./routes/auth');
const reportsRoutes = require('./routes/reports');
const telemetryRoutes = require('./routes/telemetry');
const forecastRoutes = require('./routes/forecast');
const authService = require('./services/authService');
const auditService = require('./services/auditService');

const PORT = 5020;
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

async function request(path, options = {}) {
  const url = `http://127.0.0.1:${PORT}${path}`;
  const res = await fetch(url, options);
  const isJson = (res.headers.get('content-type') || '').includes('application/json');
  const body = isJson ? await res.json() : await res.text();
  return { status: res.status, headers: res.headers, body };
}

async function runRoleAccessTests() {
  console.log('================================================================');
  console.log(' Starting Role-Based Access & Audit Logging Test Suite...');
  console.log('================================================================\n');

  // Launch isolated test server
  const app = express();
  app.use(cors());
  app.use(express.json());

  app.use('/api/auth', authRoutes);
  app.use('/api', authRoutes);
  app.use('/api/reports', reportsRoutes);
  app.use('/api', reportsRoutes);
  app.use('/api', telemetryRoutes);
  app.use('/api', forecastRoutes);

  const server = http.createServer(app);

  await new Promise((resolve) => {
    server.listen(PORT, '127.0.0.1', () => {
      console.log(`Role Access Test Server listening on http://127.0.0.1:${PORT}\n`);
      resolve();
    });
  });

  try {
    // --------------------------------------------------------------------------
    // 1. Stakeholder User Registration & JWT Issuance
    // --------------------------------------------------------------------------
    console.log('--- Suite 1: Stakeholder Role Registration & Token Issuance ---');
    const ts = Date.now();

    // Admin
    const adminReg = await request('/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: `admin_${ts}`,
        email: `admin_${ts}@moonidih.cil.in`,
        password: 'AdminPassword123!',
        full_name: 'Chief Mining Engineer & Admin',
        role: 'admin'
      })
    });
    assert(adminReg.status === 201, 'Admin user registered (201 Created)');
    assert(adminReg.body.user.role === 'admin', 'Admin user has role "admin"');
    const adminToken = adminReg.body.token;
    assert(typeof adminToken === 'string' && adminToken.length > 20, 'Admin issued signed JWT token');

    // Operator
    const opReg = await request('/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: `op_${ts}`,
        email: `op_${ts}@moonidih.cil.in`,
        password: 'OperatorPass123!',
        full_name: 'Shift Safety Operator',
        role: 'operator'
      })
    });
    assert(opReg.status === 201, 'Operator user registered (201 Created)');
    assert(opReg.body.user.role === 'operator', 'Operator user has role "operator"');
    const opToken = opReg.body.token;

    // Planner
    const plannerReg = await request('/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: `planner_${ts}`,
        email: `planner_${ts}@moonidih.cil.in`,
        password: 'PlannerPass123!',
        full_name: 'Senior Geotechnical Modeler',
        role: 'planner'
      })
    });
    assert(plannerReg.status === 201, 'Planner user registered (201 Created)');
    assert(plannerReg.body.user.role === 'planner', 'Planner user has role "planner"');
    const plannerToken = plannerReg.body.token;

    // Auditor / Regulator
    const auditorReg = await request('/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: `auditor_${ts}`,
        email: `auditor_${ts}@dgms.gov.in`,
        password: 'AuditorPass123!',
        full_name: 'DGMS Regional Inspector',
        role: 'auditor'
      })
    });
    assert(auditorReg.status === 201, 'DGMS Auditor user registered (201 Created)');
    assert(auditorReg.body.user.role === 'auditor', 'Auditor user has role "auditor"');
    const auditorToken = auditorReg.body.token;

    // --------------------------------------------------------------------------
    // 2. User Management RBAC Gateways
    // --------------------------------------------------------------------------
    console.log('\n--- Suite 2: Administrator User Management RBAC ---');
    // Admin listing users
    const adminListUsers = await request('/api/auth/users', {
      headers: { 'Authorization': `Bearer ${adminToken}` }
    });
    assert(adminListUsers.status === 200, 'Admin can list registered users (200 OK)');
    assert(Array.isArray(adminListUsers.body.users), 'Admin receives users array');
    assert(adminListUsers.body.users.length >= 4, 'Users array contains all 4 stakeholder profiles');

    // Operator trying to list users (Forbidden)
    const opListUsers = await request('/api/auth/users', {
      headers: { 'Authorization': `Bearer ${opToken}` }
    });
    assert(opListUsers.status === 403, 'Operator is forbidden from listing users (403 Forbidden)');
    assert(opListUsers.body.success === false, 'Operator denied with success === false');

    // Unauthenticated request to list users (Unauthorized)
    const noAuthUsers = await request('/api/auth/users');
    assert(noAuthUsers.status === 401, 'Unauthenticated user rejected from user management (401 Unauthorized)');

    // Admin updates operator role to planner
    const targetUserId = opReg.body.user.id;
    const roleUpdateRes = await request(`/api/auth/users/${targetUserId}/role`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${adminToken}`
      },
      body: JSON.stringify({ role: 'planner' })
    });
    assert(roleUpdateRes.status === 200, 'Admin can update user role (200 OK)');
    assert(roleUpdateRes.body.user.role === 'planner', 'Target user role updated to "planner"');

    // Operator trying to update roles (Forbidden)
    const opUpdateRole = await request(`/api/auth/users/${targetUserId}/role`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${opToken}`
      },
      body: JSON.stringify({ role: 'admin' })
    });
    assert(opUpdateRole.status === 403, 'Operator cannot elevate roles (403 Forbidden)');

    // --------------------------------------------------------------------------
    // 3. Dispatch Configuration Administrative Protection
    // --------------------------------------------------------------------------
    console.log('\n--- Suite 3: Dispatch Configuration RBAC ---');
    // Operator trying to change alert dispatch config (Forbidden)
    const opConfigRes = await request('/api/alerts/dispatch-config', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${opToken}`
      },
      body: JSON.stringify({ cooldownSeconds: 10 })
    });
    assert(opConfigRes.status === 403, 'Non-admin rejected from updating dispatch config (403 Forbidden)');

    // Admin updating alert dispatch config (Permitted)
    const adminConfigRes = await request('/api/alerts/dispatch-config', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${adminToken}`
      },
      body: JSON.stringify({ cooldownSeconds: 240 })
    });
    assert(adminConfigRes.status === 200, 'Admin can update dispatch config (200 OK)');
    assert(adminConfigRes.body.config.cooldownSeconds === 240, 'Cooldown updated to 240s');

    // --------------------------------------------------------------------------
    // 4. Immutable Audit Logs & Auditor Permissions
    // --------------------------------------------------------------------------
    console.log('\n--- Suite 4: Audit Trail Retrieval & Permissions ---');
    // Auditor querying audit logs (Permitted)
    const auditorLogsRes = await request('/api/reports/audit/logs', {
      headers: { 'Authorization': `Bearer ${auditorToken}` }
    });
    assert(auditorLogsRes.status === 200, 'DGMS Auditor can access immutable audit logs (200 OK)');
    assert(Array.isArray(auditorLogsRes.body.logs), 'Auditor receives audit logs array');
    assert(auditorLogsRes.body.logs.length > 0, 'Audit logs contains recorded system events');

    // Operator trying to access audit logs (Forbidden)
    const opAuditRes = await request('/api/reports/audit/logs', {
      headers: { 'Authorization': `Bearer ${opToken}` }
    });
    assert(opAuditRes.status === 403, 'Operator forbidden from raw audit trail access (403 Forbidden)');

    // --------------------------------------------------------------------------
    // 5. Statutory Compliance Report Export (CSV & JSON)
    // --------------------------------------------------------------------------
    console.log('\n--- Suite 5: Statutory Compliance Report Exports ---');
    // CSV Export of Alerts
    const csvAlertsRes = await request('/api/reports/export?type=alerts&format=csv', {
      headers: { 'Authorization': `Bearer ${auditorToken}` }
    });
    assert(csvAlertsRes.status === 200, 'Export alerts report as CSV returns 200 OK');
    assert(
      (csvAlertsRes.headers.get('content-type') || '').includes('text/csv'),
      'Content-Type header is text/csv'
    );
    assert(
      (csvAlertsRes.headers.get('content-disposition') || '').includes('attachment'),
      'Content-Disposition is attachment download'
    );
    assert(
      csvAlertsRes.body.includes('DGMS Circular No. 3 of 1998'),
      'CSV contains DGMS statutory compliance header'
    );
    assert(
      csvAlertsRes.body.includes('Alert ID,Node ID,Severity'),
      'CSV contains formatted column headers'
    );

    // JSON Export of Geotechnical Forecast
    const jsonForecastRes = await request('/api/reports/export?type=forecast&format=json', {
      headers: { 'Authorization': `Bearer ${plannerToken}` }
    });
    assert(jsonForecastRes.status === 200, 'Export forecast report as JSON returns 200 OK');
    assert(jsonForecastRes.body.success === true, 'JSON export indicates success === true');
    assert(jsonForecastRes.body.reportType === 'forecast', 'Report type is forecast');
    assert(jsonForecastRes.body.colliery.includes('Moonidih'), 'Specifies Moonidih extraction panel');

    // CSV Export of Audit Trail
    const csvAuditRes = await request('/api/reports/export?type=audit&format=csv', {
      headers: { 'Authorization': `Bearer ${adminToken}` }
    });
    assert(csvAuditRes.status === 200, 'Export audit trail as CSV returns 200 OK');
    assert(csvAuditRes.body.includes('Audit Log ID,Timestamp'), 'CSV audit contains log headers');
    assert(csvAuditRes.body.includes('USER_REGISTER'), 'CSV audit includes USER_REGISTER events');

    // --------------------------------------------------------------------------
    // 6. Action Audit Verification
    // --------------------------------------------------------------------------
    console.log('\n--- Suite 6: Automatic Action Audit Verification ---');
    const finalLogs = await auditService.getLogs({ limit: 50 });
    const actions = finalLogs.logs.map(l => l.action);
    assert(actions.includes('USER_REGISTER'), 'Audit logged USER_REGISTER');
    assert(actions.includes('ROLE_UPDATE'), 'Audit logged ROLE_UPDATE');
    assert(actions.includes('DISPATCH_CONFIG_UPDATE'), 'Audit logged DISPATCH_CONFIG_UPDATE');
    assert(actions.includes('REPORT_EXPORT'), 'Audit logged REPORT_EXPORT');

  } finally {
    server.close();
  }

  console.log('\n================================================================');
  console.log(` ROLE ACCESS & AUDIT TEST SUMMARY: ${passed} Passed, ${failed} Failed`);
  console.log('================================================================\n');

  if (failed > 0) process.exit(1);
  process.exit(0);
}

runRoleAccessTests().catch(err => {
  console.error('Fatal Role Access Test Error:', err);
  process.exit(1);
});
