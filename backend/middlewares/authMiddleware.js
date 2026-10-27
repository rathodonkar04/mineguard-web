/**
 * MineGuard JWT Authentication Middleware
 * Smart India Hackathon 2026 (Problem Statement 26025)
 */

const authService = require('../services/authService');

/**
 * Enforce JWT token verification
 */
function requireAuth(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({
      success: false,
      error: 'Authentication required. Missing or malformed Bearer token.'
    });
  }

  const token = authHeader.split(' ')[1];
  try {
    const decoded = authService.verifyToken(token);
    req.user = decoded;
    next();
  } catch (err) {
    return res.status(401).json({
      success: false,
      error: err.message || 'Invalid or expired session token.'
    });
  }
}

/**
 * Optional JWT token extraction (attaches req.user if valid token present, otherwise continues)
 */
function optionalAuth(req, res, next) {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.split(' ')[1];
    try {
      const decoded = authService.verifyToken(token);
      req.user = decoded;
    } catch (_err) {
      // Ignored for optional auth
    }
  }
  next();
}

/**
 * Role-Based Access Control Middleware
 * Supports 'admin', 'operator', 'planner', and 'auditor'/'regulator'
 */
function requireRole(allowedRoles = []) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ success: false, error: 'Authentication required.' });
    }
    const userRole = (req.user.role || '').toLowerCase();

    // Normalize auditor and regulator synonyms
    const effectiveRoles = allowedRoles.map(r => r.toLowerCase());
    if (effectiveRoles.includes('auditor') && !effectiveRoles.includes('regulator')) {
      effectiveRoles.push('regulator');
    }
    if (effectiveRoles.includes('regulator') && !effectiveRoles.includes('auditor')) {
      effectiveRoles.push('auditor');
    }

    // Administrators have universal stakeholder clearance
    if (userRole === 'admin' || effectiveRoles.includes(userRole)) {
      return next();
    }

    return res.status(403).json({
      success: false,
      error: `Access denied. Role "${req.user.role}" does not have required permissions (${allowedRoles.join(', ')}).`
    });
  };
}

module.exports = {
  requireAuth,
  optionalAuth,
  requireRole
};
