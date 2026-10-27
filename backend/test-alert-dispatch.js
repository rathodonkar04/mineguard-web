/**
 * Test Suite: Automated Alert Dispatch & Escalation Service
 * Smart India Hackathon 2026 (Problem Statement 26025)
 */

const {
  config,
  processAlertDispatch,
  escalateAlert,
  sendTestNotification,
  getDispatchHistory,
  getDispatchConfig,
  updateDispatchConfig,
  checkCooldown,
  formatSmsMessage,
  formatEmailHtml
} = require('./services/alertDispatchService');

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

async function runDispatchTests() {
  console.log('======================================================');
  console.log(' Starting Alert Dispatch & Escalation Test Suite...');
  console.log('======================================================\n');

  try {
    // -------------------------------------------------------------------------
    // 1. Template Formatting Tests
    // -------------------------------------------------------------------------
    console.log('--- Suite 1: Template Formatting ---');
    const sampleAlert = {
      id: 'ALT-CRIT-N3-TEST01',
      nodeId: 'N3',
      severity: 'Critical',
      title: 'Critical Inclinometer Tilt Exceeded',
      message: 'Surface inclination exceeded 2.0° statutory DGMS threshold.',
      value: 2.41,
      tilt_value: 2.41,
      ai_anomaly_score: 92,
      timestamp: new Date().toISOString()
    };

    const smsText = formatSmsMessage(sampleAlert, 'Level 1');
    assert(typeof smsText === 'string', 'SMS message formats as string');
    assert(smsText.includes('MINEGUARD CRITICAL'), 'SMS contains MINEGUARD CRITICAL header');
    assert(smsText.includes('Node N3'), 'SMS mentions sensor Node N3');
    assert(smsText.includes('2.41°'), 'SMS mentions measured tilt 2.41°');
    assert(smsText.length <= 180, `SMS length is compact (${smsText.length} chars)`);

    const emailHtml = formatEmailHtml(sampleAlert, 'Level 1');
    assert(typeof emailHtml === 'string', 'Email formats as HTML string');
    assert(emailHtml.includes('MINEGUARD SUBSIDENCE ALARM'), 'Email contains alarm header');
    assert(emailHtml.includes('Moonidih Colliery • Panel P-4'), 'Email specifies panel location');
    assert(emailHtml.includes('DGMS Guidelines'), 'Email references DGMS statutory guidelines');

    // -------------------------------------------------------------------------
    // 2. Safe Simulation Dispatch
    // -------------------------------------------------------------------------
    console.log('\n--- Suite 2: Safe Simulation Dispatch & Sandboxing ---');
    // Ensure simulation mode
    updateDispatchConfig({ mode: 'simulation', enabled: true, cooldownSeconds: 5 });

    const dispatchResult1 = await processAlertDispatch(sampleAlert);
    assert(dispatchResult1.dispatched === true, 'First alert dispatches successfully in simulation mode');
    assert(Array.isArray(dispatchResult1.dispatches), 'Returns array of channel dispatches (Email, SMS)');
    assert(dispatchResult1.dispatches.some(d => d.channel === 'EMAIL' && d.status === 'SIMULATED_SUCCESS'), 'Email recorded as SIMULATED_SUCCESS');
    assert(dispatchResult1.dispatches.some(d => d.channel === 'SMS' && d.status === 'SIMULATED_SUCCESS'), 'SMS recorded as SIMULATED_SUCCESS');

    // -------------------------------------------------------------------------
    // 3. Deduplication & Cooldown Policy
    // -------------------------------------------------------------------------
    console.log('\n--- Suite 3: Deduplication & Cooldown Policy ---');
    // Send immediate second alert for same node & severity
    const duplicateAlert = {
      id: 'ALT-CRIT-N3-TEST02',
      nodeId: 'N3',
      severity: 'Critical',
      value: 2.48,
      timestamp: new Date().toISOString()
    };

    const dispatchResult2 = await processAlertDispatch(duplicateAlert);
    assert(dispatchResult2.dispatched === false, 'Duplicate alert is suppressed by cooldown window');
    assert(dispatchResult2.reason === 'COOLDOWN_ACTIVE', 'Reason is COOLDOWN_ACTIVE');
    assert(dispatchResult2.cooldownRemainingSeconds > 0, 'Reports remaining cooldown seconds');

    // Send alert for a DIFFERENT node (Node N2) -> Must NOT be suppressed
    const diffNodeAlert = {
      id: 'ALT-CRIT-N2-TEST01',
      nodeId: 'N2',
      severity: 'Critical',
      value: 2.15,
      timestamp: new Date().toISOString()
    };
    const dispatchResult3 = await processAlertDispatch(diffNodeAlert);
    assert(dispatchResult3.dispatched === true, 'Alert for different node N2 dispatches independently');

    // -------------------------------------------------------------------------
    // 4. Escalation Policy (Unacknowledged Timeout)
    // -------------------------------------------------------------------------
    console.log('\n--- Suite 4: Escalation Policy ---');
    const unackAlert = {
      id: 'ALT-ESCALATE-01',
      nodeId: 'N3',
      severity: 'Critical',
      acknowledged: false,
      message: 'Unacknowledged critical tilt exceeding 10 minutes.'
    };

    const escResultL2 = await escalateAlert(unackAlert, 2);
    assert(escResultL2.escalated === true, 'Escalates unacknowledged alert to Level 2 (Mine Manager)');
    assert(escResultL2.role === 'Colliery Agent & Mine Manager', 'Level 2 role is Colliery Agent & Mine Manager');

    const escResultL3 = await escalateAlert(unackAlert, 3);
    assert(escResultL3.escalated === true, 'Escalates unacknowledged alert to Level 3 (DGMS Auditor)');

    // An acknowledged alert must NOT escalate
    const ackedAlert = {
      id: 'ALT-ACKED-01',
      nodeId: 'N3',
      severity: 'Critical',
      acknowledged: true
    };
    const escResultAcked = await escalateAlert(ackedAlert, 2);
    assert(escResultAcked.escalated === false, 'Acknowledged alert is rejected from escalation');
    assert(escResultAcked.reason === 'ALREADY_ACKNOWLEDGED', 'Reason is ALREADY_ACKNOWLEDGED');

    // -------------------------------------------------------------------------
    // 5. Test Notification Connectivity
    // -------------------------------------------------------------------------
    console.log('\n--- Suite 5: Test Notification Connectivity ---');
    const testEmailRes = await sendTestNotification('email', 'test_safety@cil.in');
    assert(testEmailRes.status === 'SIMULATED_SUCCESS', 'Test email reports SIMULATED_SUCCESS');
    assert(testEmailRes.recipient === 'test_safety@cil.in', 'Test email sent to designated recipient');

    const testSmsRes = await sendTestNotification('sms', '+919999999999');
    assert(testSmsRes.status === 'SIMULATED_SUCCESS', 'Test SMS reports SIMULATED_SUCCESS');

    // -------------------------------------------------------------------------
    // 6. Audit Logging & Query Filtering
    // -------------------------------------------------------------------------
    console.log('\n--- Suite 6: Dispatch History & Audit Logging ---');
    const logs = getDispatchHistory({ limit: 10 });
    assert(Array.isArray(logs), 'getDispatchHistory returns an array');
    assert(logs.length >= 4, 'Contains recorded dispatch attempts');

    const emailLogs = getDispatchHistory({ channel: 'EMAIL' });
    assert(emailLogs.every(l => l.channel === 'EMAIL'), 'Filters logs by channel EMAIL');

    const configRes = getDispatchConfig();
    assert(Boolean(configRes.recipients.level1), 'Exposes recipient directory');
    assert(configRes.mode === 'simulation', 'Reports simulation mode');

    console.log('\n======================================================');
    console.log(` ALERT DISPATCH TEST SUMMARY: ${passed} Passed, ${failed} Failed`);
    console.log('======================================================\n');

    process.exit(failed > 0 ? 1 : 0);
  } catch (err) {
    console.error('Test execution error:', err);
    process.exit(1);
  }
}

runDispatchTests();
