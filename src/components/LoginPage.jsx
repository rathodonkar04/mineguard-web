import React, { useState } from 'react';
import { loginApi, registerApi } from '../api/backendApi';

/**
 * LoginPage Component - Industrial Geotechnical Portal Sign In & Registration
 * Smart India Hackathon 2026 (Problem Statement 26025)
 */
export default function LoginPage({ onLogin }) {
  const [activeTab, setActiveTab] = useState('login'); // 'login' | 'register'
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  // Sign In State
  const [loginIdentifier, setLoginIdentifier] = useState('admin');
  const [loginPassword, setLoginPassword] = useState('Admin@123');
  const [loginRole, setLoginRole] = useState('admin');

  // Registration State
  const [regFullName, setRegFullName] = useState('');
  const [regUsername, setRegUsername] = useState('');
  const [regEmail, setRegEmail] = useState('');
  const [regRole, setRegRole] = useState('admin');
  const [regPassword, setRegPassword] = useState('');
  const [regConfirmPassword, setRegConfirmPassword] = useState('');

  // Fast pre-fill helper for demonstration
  const handleQuickFill = (roleType) => {
    setErrorMsg('');
    setSuccessMsg('');
    setLoginRole(roleType);
    if (roleType === 'admin') {
      setLoginIdentifier('admin');
      setLoginPassword('Admin@123');
    } else {
      setLoginIdentifier('safety_officer_01');
      setLoginPassword('Safety@123');
    }
  };

  // Submit Sign In
  const handleLoginSubmit = async (e) => {
    e.preventDefault();
    setErrorMsg('');
    setSuccessMsg('');
    setLoading(true);

    try {
      const res = await loginApi({
        username: loginIdentifier.trim(),
        password: loginPassword
      });

      if (res.success && res.user) {
        // Enforce the chosen role selected at login time
        const effectiveUser = {
          ...res.user,
          role: loginRole || res.user.role || 'operator'
        };
        setSuccessMsg(`Welcome, ${effectiveUser.full_name || effectiveUser.username}. Authenticated as ${effectiveUser.role.toUpperCase()}.`);
        setTimeout(() => {
          onLogin(effectiveUser, res.token);
        }, 350);
      } else {
        setErrorMsg(res.error || 'Authentication failed. Please verify credentials.');
      }
    } catch (err) {
      setErrorMsg(err.message || 'Network communication failure with authentication service.');
    } finally {
      setLoading(false);
    }
  };

  // Submit Registration
  const handleRegisterSubmit = async (e) => {
    e.preventDefault();
    setErrorMsg('');
    setSuccessMsg('');

    if (regPassword !== regConfirmPassword) {
      setErrorMsg('Passwords do not match.');
      return;
    }

    if (regPassword.length < 6) {
      setErrorMsg('Password must be at least 6 characters long.');
      return;
    }

    setLoading(true);

    try {
      const res = await registerApi({
        username: regUsername.trim(),
        email: regEmail.trim(),
        full_name: regFullName.trim(),
        role: regRole,
        password: regPassword
      });

      if (res.success && res.user) {
        setSuccessMsg(`Account created for ${res.user.full_name}! Password securely encrypted with bcrypt.`);
        setTimeout(() => {
          onLogin(res.user, res.token);
        }, 500);
      } else {
        setErrorMsg(res.error || 'Registration failed. User or email may already exist.');
      }
    } catch (err) {
      setErrorMsg(err.message || 'Network failure during registration.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#F7F7F5] text-[#222222] flex flex-col justify-between items-center p-4 sm:p-6 select-none font-sans">
      <div className="w-full max-w-md pt-6 sm:pt-12">
        {/* Institutional Header */}
        <div className="mb-5 sm:mb-6 text-center border-b border-[#D8D8D5] pb-4 sm:pb-5">
          <div className="inline-flex items-center gap-2 mb-2">
            <span className="w-2.5 h-2.5 bg-[#3F4A42]"></span>
            <span className="text-[11px] font-mono font-bold tracking-widest text-[#3F4A42]">DGMS STATUTORY PORTAL</span>
            <span className="text-[10px] px-1.5 py-0.5 bg-[#EAEAE7] text-[#666666] border border-[#D8D8D5] font-mono font-semibold">JWT AUTH</span>
          </div>
          <h1 className="text-lg sm:text-xl font-bold tracking-tight text-[#222222]">
            MINEGUARD SCADA ACCESS
          </h1>
          <p className="text-xs text-[#666666] mt-1 font-medium">
            Moonidih Colliery • Panel P-4 Strata Monitoring Center
          </p>
        </div>

        {/* Auth Mode Tabs */}
        <div className="flex border-b border-[#D8D8D5] bg-[#FFFFFF] mb-0">
          <button
            type="button"
            onClick={() => { setActiveTab('login'); setErrorMsg(''); setSuccessMsg(''); }}
            className={`flex-1 py-2.5 text-xs font-bold tracking-wide uppercase transition-colors text-center border-b-2 ${
              activeTab === 'login'
                ? 'border-[#3F4A42] text-[#3F4A42] bg-[#FFFFFF]'
                : 'border-transparent text-[#888888] bg-[#F7F7F5] hover:text-[#222222]'
            }`}
          >
            Sign In
          </button>
          <button
            type="button"
            onClick={() => { setActiveTab('register'); setErrorMsg(''); setSuccessMsg(''); }}
            className={`flex-1 py-2.5 text-xs font-bold tracking-wide uppercase transition-colors text-center border-b-2 ${
              activeTab === 'register'
                ? 'border-[#3F4A42] text-[#3F4A42] bg-[#FFFFFF]'
                : 'border-transparent text-[#888888] bg-[#F7F7F5] hover:text-[#222222]'
            }`}
          >
            Register Personnel
          </button>
        </div>

        {/* Card Body */}
        <div className="bg-[#FFFFFF] border-x border-b border-[#D8D8D5] p-5 sm:p-6 space-y-4 shadow-xs">
          
          {/* Notification Feedback */}
          {errorMsg && (
            <div className="p-3 bg-[#FDF2F2] border-l-4 border-l-[#A84444] border border-[#F3C5C5] text-xs text-[#A84444] font-medium">
              <span className="font-bold mr-1">Error:</span> {errorMsg}
            </div>
          )}

          {successMsg && (
            <div className="p-3 bg-[#F0FDF4] border-l-4 border-l-[#3F7655] border border-[#BBF7D0] text-xs text-[#3F7655] font-medium">
              <span className="font-bold mr-1">Success:</span> {successMsg}
            </div>
          )}

          {/* TAB 1: SIGN IN */}
          {activeTab === 'login' && (
            <form onSubmit={handleLoginSubmit} className="space-y-4 text-xs">
              <div>
                <label htmlFor="login-username" className="block text-[#222222] font-semibold mb-1">
                  Operator / Admin Username or Email
                </label>
                <input
                  id="login-username"
                  type="text"
                  value={loginIdentifier}
                  onChange={(e) => setLoginIdentifier(e.target.value)}
                  placeholder="admin or safety_officer_01"
                  className="w-full px-3 py-2 bg-[#FFFFFF] border border-[#D8D8D5] text-[#222222] focus:outline-none focus:border-[#3F4A42]"
                  required
                />
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label htmlFor="login-password" className="text-[#222222] font-semibold">
                    Security Password
                  </label>
                  <span className="text-[10px] text-[#888888]">Bcrypt Protected</span>
                </div>
                <input
                  id="login-password"
                  type="password"
                  value={loginPassword}
                  onChange={(e) => setLoginPassword(e.target.value)}
                  placeholder="••••••••••••"
                  className="w-full px-3 py-2 bg-[#FFFFFF] border border-[#D8D8D5] text-[#222222] focus:outline-none focus:border-[#3F4A42]"
                  required
                />
              </div>

              <div>
                <label htmlFor="login-role" className="block text-[#222222] font-semibold mb-1">
                  Designated Stakeholder Role (Session Scope)
                </label>
                <select
                  id="login-role"
                  value={loginRole}
                  onChange={(e) => setLoginRole(e.target.value)}
                  className="w-full px-3 py-2 bg-[#FFFFFF] border border-[#D8D8D5] text-[#222222] font-semibold text-xs focus:outline-none focus:border-[#3F4A42] cursor-pointer"
                >
                  <option value="operator">👷 Mine Safety Operator (Real-Time SCADA &amp; Alarms)</option>
                  <option value="planner">📐 Geotechnical Planner (Knothe Subsidence Forecast)</option>
                  <option value="auditor">⚖️ DGMS Auditor / Inspector (Statutory Reports &amp; Ledger)</option>
                  <option value="admin">👑 Chief Administrator (Full Access &amp; User Directory)</option>
                </select>
                <span className="text-[10.5px] text-[#666666] block mt-0.5">
                  Role is selected at login and remains locked for the duration of your session.
                </span>
              </div>

              {/* Quick Fill Demo Access */}
              <div className="pt-1">
                <span className="block text-[10px] font-mono font-semibold text-[#888888] mb-1.5 uppercase">
                  Quick Demo Credentials &amp; Role Presets:
                </span>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => handleQuickFill('operator')}
                    className={`py-1.5 px-2 border text-[10.5px] font-semibold transition-colors ${
                      loginRole === 'operator' 
                        ? 'bg-[#F0FDF4] text-[#3F7655] border-[#BBF7D0]' 
                        : 'bg-[#F7F7F5] hover:bg-[#EAEAE7] text-[#222222] border-[#D8D8D5]'
                    }`}
                  >
                    👷 Operator
                  </button>
                  <button
                    type="button"
                    onClick={() => handleQuickFill('planner')}
                    className={`py-1.5 px-2 border text-[10.5px] font-semibold transition-colors ${
                      loginRole === 'planner' 
                        ? 'bg-[#EFF6FF] text-[#1D4ED8] border-[#BFDBFE]' 
                        : 'bg-[#F7F7F5] hover:bg-[#EAEAE7] text-[#222222] border-[#D8D8D5]'
                    }`}
                  >
                    📐 Planner
                  </button>
                  <button
                    type="button"
                    onClick={() => handleQuickFill('auditor')}
                    className={`py-1.5 px-2 border text-[10.5px] font-semibold transition-colors ${
                      loginRole === 'auditor' 
                        ? 'bg-[#FFFBEB] text-[#B45309] border-[#FDE68A]' 
                        : 'bg-[#F7F7F5] hover:bg-[#EAEAE7] text-[#222222] border-[#D8D8D5]'
                    }`}
                  >
                    ⚖️ Auditor
                  </button>
                  <button
                    type="button"
                    onClick={() => handleQuickFill('admin')}
                    className={`py-1.5 px-2 border text-[10.5px] font-semibold transition-colors ${
                      loginRole === 'admin' 
                        ? 'bg-[#FDF2F2] text-[#A84444] border-[#F3C5C5]' 
                        : 'bg-[#F7F7F5] hover:bg-[#EAEAE7] text-[#222222] border-[#D8D8D5]'
                    }`}
                  >
                    👑 Admin
                  </button>
                </div>
              </div>

              <div className="pt-2">
                <button
                  type="submit"
                  disabled={loading}
                  aria-label="Sign in to MineGuard console"
                  className="w-full py-2.5 px-4 bg-[#3F4A42] hover:bg-[#323B35] disabled:bg-[#888888] text-[#FFFFFF] font-bold text-xs transition-colors tracking-wide flex items-center justify-center gap-2"
                >
                  {loading ? (
                    <>
                      <span className="inline-block w-2.5 h-2.5 border-2 border-white border-t-transparent rounded-full animate-spin"></span>
                      <span>AUTHENTICATING JWT...</span>
                    </>
                  ) : (
                    <span>ACCESS OPERATIONS CONSOLE</span>
                  )}
                </button>
              </div>
            </form>
          )}

          {/* TAB 2: REGISTER PERSONNEL */}
          {activeTab === 'register' && (
            <form onSubmit={handleRegisterSubmit} className="space-y-3.5 text-xs">
              <div>
                <label htmlFor="reg-fullname" className="block text-[#222222] font-semibold mb-1">
                  Full Legal Name
                </label>
                <input
                  id="reg-fullname"
                  type="text"
                  value={regFullName}
                  onChange={(e) => setRegFullName(e.target.value)}
                  placeholder="e.g. Dr. Rajesh Sharma"
                  className="w-full px-3 py-2 bg-[#FFFFFF] border border-[#D8D8D5] text-[#222222] focus:outline-none focus:border-[#3F4A42]"
                  required
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label htmlFor="reg-username" className="block text-[#222222] font-semibold mb-1">
                    System Username
                  </label>
                  <input
                    id="reg-username"
                    type="text"
                    value={regUsername}
                    onChange={(e) => setRegUsername(e.target.value)}
                    placeholder="e.g. rajesh_sharma"
                    className="w-full px-3 py-2 bg-[#FFFFFF] border border-[#D8D8D5] text-[#222222] focus:outline-none focus:border-[#3F4A42]"
                    required
                  />
                </div>

                <div>
                  <label htmlFor="reg-role" className="block text-[#222222] font-semibold mb-1">
                    Role &amp; Privilege
                  </label>
                  <select
                    id="reg-role"
                    value={regRole}
                    onChange={(e) => setRegRole(e.target.value)}
                    className="w-full px-3 py-2 bg-[#FFFFFF] border border-[#D8D8D5] text-[#222222] focus:outline-none focus:border-[#3F4A42]"
                  >
                    <option value="operator">Mine Safety Operator</option>
                    <option value="planner">Geotechnical Planner</option>
                    <option value="auditor">DGMS Auditor / Inspector</option>
                    <option value="admin">Chief Administrator</option>
                  </select>
                </div>
              </div>

              <div>
                <label htmlFor="reg-email" className="block text-[#222222] font-semibold mb-1">
                  Official Email Address
                </label>
                <input
                  id="reg-email"
                  type="email"
                  value={regEmail}
                  onChange={(e) => setRegEmail(e.target.value)}
                  placeholder="e.g. rajesh@mineguard.gov.in"
                  className="w-full px-3 py-2 bg-[#FFFFFF] border border-[#D8D8D5] text-[#222222] focus:outline-none focus:border-[#3F4A42]"
                  required
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label htmlFor="reg-password" className="block text-[#222222] font-semibold mb-1">
                    Password
                  </label>
                  <input
                    id="reg-password"
                    type="password"
                    value={regPassword}
                    onChange={(e) => setRegPassword(e.target.value)}
                    placeholder="Min 6 characters"
                    className="w-full px-3 py-2 bg-[#FFFFFF] border border-[#D8D8D5] text-[#222222] focus:outline-none focus:border-[#3F4A42]"
                    required
                  />
                </div>

                <div>
                  <label htmlFor="reg-confirmpass" className="block text-[#222222] font-semibold mb-1">
                    Confirm Password
                  </label>
                  <input
                    id="reg-confirmpass"
                    type="password"
                    value={regConfirmPassword}
                    onChange={(e) => setRegConfirmPassword(e.target.value)}
                    placeholder="Repeat password"
                    className="w-full px-3 py-2 bg-[#FFFFFF] border border-[#D8D8D5] text-[#222222] focus:outline-none focus:border-[#3F4A42]"
                    required
                  />
                </div>
              </div>

              <div className="pt-2">
                <button
                  type="submit"
                  disabled={loading}
                  className="w-full py-2.5 px-4 bg-[#3F4A42] hover:bg-[#323B35] disabled:bg-[#888888] text-[#FFFFFF] font-bold text-xs transition-colors tracking-wide flex items-center justify-center gap-2"
                >
                  {loading ? (
                    <>
                      <span className="inline-block w-2.5 h-2.5 border-2 border-white border-t-transparent rounded-full animate-spin"></span>
                      <span>HASHING WITH BCRYPT &amp; REGISTERING...</span>
                    </>
                  ) : (
                    <span>CREATE ACCOUNT &amp; SIGN IN</span>
                  )}
                </button>
              </div>
            </form>
          )}

          <div className="pt-3 border-t border-[#D8D8D5] text-center text-[11px] text-[#666666]">
            Credentials securely stored in PostgreSQL/Supabase database • Passwords hashed via Bcrypt (10 salt rounds)
          </div>
        </div>
      </div>

      <div className="text-[11px] text-[#666666] py-4 text-center">
        MineGuard Subsidence Monitoring System • Ministry of Coal • DGMS Compliant
      </div>
    </div>
  );
}
