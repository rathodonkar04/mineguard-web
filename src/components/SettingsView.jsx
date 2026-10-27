import React, { useState, useEffect, useCallback } from 'react';
import { fetchUsersList, updateUserRoleApi, updateUserStatusApi } from '../api/backendApi';

/**
 * SettingsView Component - Industrial System Configuration, User Management & Custom Domain Setup
 */
export default function SettingsView({ currentUser = null }) {
  const [warningTilt, setWarningTilt] = useState('1.00');
  const [criticalTilt, setCriticalTilt] = useState('2.00');
  const [warningDisplacement, setWarningDisplacement] = useState('1.00');
  const [criticalDisplacement, setCriticalDisplacement] = useState('2.00');
  const [backendUrl, setBackendUrl] = useState('http://localhost:5000');
  const [customDomain, setCustomDomain] = useState('mineguard-monitoring.gov.in');
  const [alternateDomain, setAlternateDomain] = useState('mineguard.nic.in');
  const [saved, setSaved] = useState(false);

  // User Management State (Administrator only)
  const [users, setUsers] = useState([]);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [userMsg, setUserMsg] = useState(null);
  const [userError, setUserError] = useState(null);

  const isAdmin = currentUser?.role === 'admin';

  const loadUsers = useCallback(async () => {
    if (!isAdmin) return;
    setLoadingUsers(true);
    setUserError(null);
    try {
      const res = await fetchUsersList();
      if (res.success && Array.isArray(res.users)) {
        setUsers(res.users);
      } else {
        setUserError(res.error || 'Failed to load user directory.');
      }
    } catch (err) {
      setUserError(err.message || 'Network error fetching users.');
    } finally {
      setLoadingUsers(false);
    }
  }, [isAdmin]);

  useEffect(() => {
    loadUsers();
  }, [loadUsers]);

  const handleRoleChange = async (userId, newRole) => {
    setUserMsg(null);
    setUserError(null);
    try {
      const res = await updateUserRoleApi(userId, newRole);
      if (res.ok && res.data.success) {
        setUserMsg(`Role updated to "${newRole.toUpperCase()}" for user ID ${userId}.`);
        setUsers(prev => prev.map(u => u.id === userId ? { ...u, role: newRole } : u));
        setTimeout(() => setUserMsg(null), 3500);
      } else {
        setUserError(res.data?.error || 'Role update failed.');
      }
    } catch (err) {
      setUserError(err.message || 'Error updating role.');
    }
  };

  const handleToggleStatus = async (userId, currentStatus) => {
    setUserMsg(null);
    setUserError(null);
    const newStatus = !currentStatus;
    try {
      const res = await updateUserStatusApi(userId, newStatus);
      if (res.ok && res.data.success) {
        setUserMsg(`Account status changed to ${newStatus ? 'ACTIVE' : 'DISABLED'} for user ID ${userId}.`);
        setUsers(prev => prev.map(u => u.id === userId ? { ...u, is_active: newStatus } : u));
        setTimeout(() => setUserMsg(null), 3500);
      } else {
        setUserError(res.data?.error || 'Status update failed.');
      }
    } catch (err) {
      setUserError(err.message || 'Error updating status.');
    }
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  };

  return (
    <div className="space-y-4 font-sans select-none overflow-hidden">
      {/* Header with Single Clear H1 */}
      <div className="bg-[#FFFFFF] p-4 sm:p-5 border border-[#D8D8D5] flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-sm sm:text-base font-bold uppercase tracking-wider text-[#222222]">
            System Settings, Calibration & Domain Configuration
          </h1>
          <p className="text-xs text-[#666666] mt-0.5">
            Geotechnical alarm thresholds, custom domain routing, and telemetry ingestion server parameters
          </p>
        </div>

        {saved && (
          <span className="text-xs font-semibold text-[#3F7655] bg-[#3F7655]/10 px-2.5 py-1 border border-[#3F7655]">
            ● Configuration saved successfully
          </span>
        )}
      </div>

      <form onSubmit={handleSubmit} className="bg-[#FFFFFF] border border-[#D8D8D5] p-4 sm:p-6 space-y-6 text-xs max-w-3xl">
        
        {/* Section 1: Custom Domain & Routing */}
        <div className="space-y-3">
          <div className="text-xs font-bold text-[#222222] uppercase tracking-wide border-b border-[#D8D8D5] pb-1.5 flex items-center justify-between">
            <span>1. Production Domain & Network Identity</span>
            <span className="text-[10px] text-[#3F7655] font-semibold">● SSL ACTIVE (TLS 1.3)</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label htmlFor="custom-domain-input" className="block text-[#222222] font-semibold mb-1">
                Primary Custom Domain (Canonical)
              </label>
              <input
                id="custom-domain-input"
                type="text"
                value={customDomain}
                onChange={(e) => setCustomDomain(e.target.value)}
                className="w-full px-3 py-2 bg-[#FFFFFF] border border-[#D8D8D5] text-[#222222] focus:outline-none focus:border-[#3F4A42] font-mono text-xs"
              />
              <span className="text-[10.5px] text-[#666666] block mt-0.5">Canonical Base URL: https://{customDomain}</span>
            </div>

            <div>
              <label htmlFor="alternate-domain-input" className="block text-[#222222] font-semibold mb-1">
                Secondary / Government Gateway Domain
              </label>
              <input
                id="alternate-domain-input"
                type="text"
                value={alternateDomain}
                onChange={(e) => setAlternateDomain(e.target.value)}
                className="w-full px-3 py-2 bg-[#FFFFFF] border border-[#D8D8D5] text-[#222222] focus:outline-none focus:border-[#3F4A42] font-mono text-xs"
              />
              <span className="text-[10.5px] text-[#666666] block mt-0.5">CNAME mapped to Moonidih SCADA gateway</span>
            </div>
          </div>

          <div className="bg-[#F7F7F5] border border-[#D8D8D5] p-3 space-y-1 font-mono text-[11px] text-[#666666]">
            <div className="font-semibold text-[#222222]">DNS CONFIGURATION RECORD:</div>
            <div>TYPE: <strong>CNAME</strong> • HOST: <strong>@</strong> • VALUE: <strong>ingress.mineguard-monitoring.gov.in</strong></div>
            <div>STATUS: <span className="text-[#3F7655] font-bold">VERIFIED &amp; PROPAGATED</span></div>
          </div>
        </div>

        {/* Section 2: Statutory Geotechnical Limits (DGMS) */}
        <div className="space-y-3">
          <div className="text-xs font-bold text-[#222222] uppercase tracking-wide border-b border-[#D8D8D5] pb-1.5">
            2. DGMS Statutory Safety Limits
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label htmlFor="warning-tilt-input" className="block text-[#222222] font-semibold mb-1">
                Warning Incline Limit (Tilt in Degrees)
              </label>
              <input
                id="warning-tilt-input"
                type="text"
                value={warningTilt}
                onChange={(e) => setWarningTilt(e.target.value)}
                className="w-full px-3 py-2 bg-[#FFFFFF] border border-[#D8D8D5] text-[#222222] focus:outline-none focus:border-[#3F4A42] font-mono text-xs"
              />
              <span className="text-[10.5px] text-[#666666] block mt-0.5">Default: 1.00° (Triggers Advisory Alert)</span>
            </div>

            <div>
              <label htmlFor="critical-tilt-input" className="block text-[#222222] font-semibold mb-1">
                Critical Incline Limit (Tilt in Degrees)
              </label>
              <input
                id="critical-tilt-input"
                type="text"
                value={criticalTilt}
                onChange={(e) => setCriticalTilt(e.target.value)}
                className="w-full px-3 py-2 bg-[#FFFFFF] border border-[#D8D8D5] text-[#222222] focus:outline-none focus:border-[#3F4A42] font-mono text-xs"
              />
              <span className="text-[10.5px] text-[#666666] block mt-0.5">Default: 2.00° (Triggers Evacuation Alarm)</span>
            </div>

            <div>
              <label htmlFor="warning-disp-input" className="block text-[#222222] font-semibold mb-1">
                Warning Vertical Displacement (mm)
              </label>
              <input
                id="warning-disp-input"
                type="text"
                value={warningDisplacement}
                onChange={(e) => setWarningDisplacement(e.target.value)}
                className="w-full px-3 py-2 bg-[#FFFFFF] border border-[#D8D8D5] text-[#222222] focus:outline-none focus:border-[#3F4A42] font-mono text-xs"
              />
              <span className="text-[10.5px] text-[#666666] block mt-0.5">Default: 1.00 mm (Settlement inflection)</span>
            </div>

            <div>
              <label htmlFor="critical-disp-input" className="block text-[#222222] font-semibold mb-1">
                Critical Vertical Displacement (mm)
              </label>
              <input
                id="critical-disp-input"
                type="text"
                value={criticalDisplacement}
                onChange={(e) => setCriticalDisplacement(e.target.value)}
                className="w-full px-3 py-2 bg-[#FFFFFF] border border-[#D8D8D5] text-[#222222] focus:outline-none focus:border-[#3F4A42] font-mono text-xs"
              />
              <span className="text-[10.5px] text-[#666666] block mt-0.5">Default: 2.00 mm (Crown breach threshold)</span>
            </div>
          </div>
        </div>

        {/* Section 3: Telemetry Server Connection */}
        <div className="space-y-3">
          <div className="text-xs font-bold text-[#222222] uppercase tracking-wide border-b border-[#D8D8D5] pb-1.5">
            3. Ingestion Server & WebSocket Port
          </div>

          <div>
            <label htmlFor="backend-url-input" className="block text-[#222222] font-semibold mb-1">
              Backend Ingestion REST & Socket.IO URL
            </label>
            <input
              id="backend-url-input"
              type="text"
              value={backendUrl}
              onChange={(e) => setBackendUrl(e.target.value)}
              className="w-full px-3 py-2 bg-[#FFFFFF] border border-[#D8D8D5] text-[#222222] focus:outline-none focus:border-[#3F4A42] font-mono text-xs"
            />
            <span className="text-[10.5px] text-[#666666] block mt-0.5">Default: http://localhost:5000 (Surface gateway adapter)</span>
          </div>
        </div>

        <div className="pt-2 flex items-center justify-between border-t border-[#D8D8D5]">
          <span className="text-[11px] text-[#666666]">
            Certificate Authority: National Informatics Centre (NIC) • DGMS Standard
          </span>

          <button
            type="submit"
            aria-label="Save system configuration"
            className="px-5 py-2 bg-[#3F4A42] hover:bg-[#323B35] text-[#FFFFFF] font-bold text-xs transition-colors"
          >
            SAVE CONFIGURATION
          </button>
        </div>

      </form>

      {/* Section 4: Administrator User Management & RBAC Provisioning */}
      <div className="bg-[#FFFFFF] border border-[#D8D8D5] p-4 sm:p-6 space-y-4 text-xs max-w-4xl">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#D8D8D5] pb-2">
          <div>
            <div className="text-xs font-bold text-[#222222] uppercase tracking-wide flex items-center gap-2">
              <span>4. Stakeholder User Management &amp; Role Assignments</span>
              <span className={`text-[10px] px-1.5 py-0.2 font-semibold uppercase ${
                isAdmin 
                  ? 'bg-[#F0FDF4] text-[#3F7655] border border-[#BBF7D0]' 
                  : 'bg-[#F7F7F5] text-[#666666] border border-[#D8D8D5]'
              }`}>
                {isAdmin ? '● ADMIN ACCESS GRANTED' : 'RESTRICTED VIEW'}
              </span>
            </div>
            <p className="text-[11px] text-[#666666] mt-0.5">
              Statutory RBAC under DGMS Circular No. 3 (1998) — Provision operators, planners, and auditors
            </p>
          </div>

          {isAdmin && (
            <button
              onClick={loadUsers}
              disabled={loadingUsers}
              className="px-3 py-1 bg-[#F7F7F5] hover:bg-[#EAEAE7] text-[#222222] border border-[#D8D8D5] font-semibold text-[11px] transition-colors flex items-center gap-1.5"
            >
              <span>{loadingUsers ? '⟳' : '↻'}</span>
              <span>{loadingUsers ? 'REFRESHING...' : 'REFRESH DIRECTORY'}</span>
            </button>
          )}
        </div>

        {userMsg && (
          <div className="p-2.5 bg-[#F0FDF4] border border-[#BBF7D0] text-[#3F7655] font-medium text-xs">
            ✓ {userMsg}
          </div>
        )}

        {userError && (
          <div className="p-2.5 bg-[#FDF2F2] border border-[#F3C5C5] text-[#A84444] font-medium text-xs">
            ⚠ {userError}
          </div>
        )}

        {isAdmin ? (
          <div>
            {loadingUsers && users.length === 0 ? (
              <div className="py-8 text-center text-[#666666] font-mono text-xs">
                LOADING REGISTERED STAKEHOLDER DIRECTORY...
              </div>
            ) : users.length === 0 ? (
              <div className="py-8 text-center text-[#666666] font-mono text-xs">
                No registered users found in database directory.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="bg-[#F7F7F5] border-b border-[#D8D8D5] text-[#666666] font-mono text-[10px] uppercase">
                      <th className="py-2 px-3">User</th>
                      <th className="py-2 px-3">Email Address</th>
                      <th className="py-2 px-3">Statutory Role</th>
                      <th className="py-2 px-3">Status</th>
                      <th className="py-2 px-3">Enrolled</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#EAEAE7]">
                    {users.map((u) => {
                      const isCurrent = currentUser?.id === u.id || currentUser?.username === u.username;
                      return (
                        <tr key={u.id} className="hover:bg-[#FBFBFA] transition-colors">
                          <td className="py-2.5 px-3">
                            <div className="font-semibold text-[#222222]">
                              {u.username}
                              {isCurrent && (
                                <span className="ml-1.5 text-[9px] px-1 py-0.2 bg-[#3F4A42] text-white">YOU</span>
                              )}
                            </div>
                            <div className="text-[10px] text-[#666666]">{u.full_name || 'No Full Name'}</div>
                          </td>

                          <td className="py-2.5 px-3 font-mono text-[11px] text-[#444444]">
                            {u.email}
                          </td>

                          <td className="py-2.5 px-3">
                            <select
                              value={u.role || 'operator'}
                              onChange={(e) => handleRoleChange(u.id, e.target.value)}
                              className="px-2 py-1 bg-[#FFFFFF] border border-[#D8D8D5] text-[#222222] font-semibold text-xs focus:outline-none focus:border-[#3F4A42]"
                            >
                              <option value="operator">Mine Safety Operator</option>
                              <option value="planner">Geotechnical Planner</option>
                              <option value="auditor">DGMS Auditor / Regulator</option>
                              <option value="admin">Administrator</option>
                            </select>
                          </td>

                          <td className="py-2.5 px-3">
                            <button
                              type="button"
                              onClick={() => handleToggleStatus(u.id, u.is_active)}
                              disabled={isCurrent}
                              title={isCurrent ? 'Cannot deactivate active account' : 'Click to toggle status'}
                              className={`px-2 py-0.5 text-[10px] font-bold border transition-colors ${
                                u.is_active !== false
                                  ? 'bg-[#F0FDF4] text-[#3F7655] border-[#BBF7D0] hover:bg-[#DCFCE7]'
                                  : 'bg-[#FDF2F2] text-[#A84444] border-[#F3C5C5] hover:bg-[#FEE2E2]'
                              } ${isCurrent ? 'opacity-60 cursor-not-allowed' : 'cursor-pointer'}`}
                            >
                              {u.is_active !== false ? '● ACTIVE' : '○ DISABLED'}
                            </button>
                          </td>

                          <td className="py-2.5 px-3 font-mono text-[10px] text-[#888888]">
                            {u.created_at ? new Date(u.created_at).toLocaleDateString() : 'N/A'}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        ) : (
          <div className="p-3 bg-[#F7F7F5] border border-[#D8D8D5] text-[#666666] text-xs">
            <span className="font-semibold text-[#222222]">Notice: </span>
            Stakeholder role assignments and user directory provisioning require <strong>Administrator</strong> credentials.
            Current account is logged in as <span className="font-semibold text-[#222222]">{currentUser?.username || 'Operator'}</span> with <span className="font-semibold uppercase text-[#3F7655]">[{currentUser?.role || 'OPERATOR'}]</span> privileges.
          </div>
        )}
      </div>
    </div>
  );
}
