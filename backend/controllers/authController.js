/**
 * MineGuard Authentication Controller
 * Smart India Hackathon 2026 (Problem Statement 26025)
 */

const authService = require('../services/authService');
const auditService = require('../services/auditService');

/**
 * POST /api/auth/register
 * Register a new operator, planner, regulator, or administrator
 */
async function register(req, res) {
  try {
    const { username, email, password, full_name, role } = req.body;
    const result = await authService.register({
      username,
      email,
      password,
      full_name,
      role
    });

    // Record audit event
    auditService.recordLog({
      user: result.user,
      action: 'USER_REGISTER',
      resource: `USER_${result.user.username}`,
      details: { role: result.user.role, email: result.user.email },
      ip: req.ip || req.headers['x-forwarded-for'] || '127.0.0.1'
    }).catch(() => {});

    return res.status(201).json({
      success: true,
      message: `User "${result.user.username}" registered successfully.`,
      user: result.user,
      token: result.token
    });
  } catch (err) {
    const status = err.message.includes('already exists') ? 409 : 400;
    return res.status(status).json({
      success: false,
      error: err.message || 'Registration failed.'
    });
  }
}

/**
 * POST /api/auth/login
 * Authenticate with username or email + password, issues JWT token
 */
async function login(req, res) {
  try {
    const { username, usernameOrEmail, password } = req.body;
    const identifier = username || usernameOrEmail;

    const result = await authService.login({
      usernameOrEmail: identifier,
      password
    });

    // Record audit event
    auditService.recordLog({
      user: result.user,
      action: 'USER_LOGIN',
      resource: `USER_${result.user.username}`,
      details: { role: result.user.role },
      ip: req.ip || req.headers['x-forwarded-for'] || '127.0.0.1'
    }).catch(() => {});

    return res.status(200).json({
      success: true,
      message: 'Authentication successful.',
      user: result.user,
      token: result.token
    });
  } catch (err) {
    return res.status(401).json({
      success: false,
      error: err.message || 'Invalid username or password.'
    });
  }
}

/**
 * GET /api/auth/me
 * Returns authenticated user profile from verified JWT
 */
function getMe(req, res) {
  if (!req.user) {
    return res.status(401).json({ success: false, error: 'Unauthorized.' });
  }

  return res.status(200).json({
    success: true,
    user: req.user
  });
}

/**
 * POST /api/auth/logout
 * Client-side token clearance confirmation
 */
function logout(req, res) {
  if (req.user) {
    auditService.recordLog({
      user: req.user,
      action: 'USER_LOGOUT',
      resource: `USER_${req.user.username}`,
      details: {},
      ip: req.ip || '127.0.0.1'
    }).catch(() => {});
  }

  return res.status(200).json({
    success: true,
    message: 'Logged out successfully.'
  });
}

/**
 * GET /api/users
 * Administrator: list all registered users
 */
async function listUsers(_req, res) {
  try {
    const users = await authService.getAllUsers();
    return res.status(200).json({
      success: true,
      count: users.length,
      users
    });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
}

/**
 * POST /api/users/:id/role
 * Administrator: update a user's role
 */
async function updateRole(req, res) {
  try {
    const { id } = req.params;
    const { role } = req.body;
    if (!role) {
      return res.status(400).json({ success: false, error: 'Target role is required.' });
    }

    const updatedUser = await authService.updateUserRole(id, role);

    auditService.recordLog({
      user: req.user,
      action: 'ROLE_UPDATE',
      resource: `USER_${updatedUser.username}`,
      details: { targetUserId: id, newRole: role },
      ip: req.ip || '127.0.0.1'
    }).catch(() => {});

    return res.status(200).json({
      success: true,
      message: `Updated role for ${updatedUser.username} to ${role}.`,
      user: updatedUser
    });
  } catch (err) {
    return res.status(400).json({ success: false, error: err.message });
  }
}

/**
 * POST /api/users/:id/status
 * Administrator: activate or deactivate a user
 */
async function updateStatus(req, res) {
  try {
    const { id } = req.params;
    const { is_active } = req.body;
    if (is_active === undefined) {
      return res.status(400).json({ success: false, error: 'is_active boolean required.' });
    }

    const updatedUser = await authService.updateUserStatus(id, is_active);

    auditService.recordLog({
      user: req.user,
      action: is_active ? 'USER_ACTIVATE' : 'USER_DEACTIVATE',
      resource: `USER_${updatedUser.username}`,
      details: { targetUserId: id, active: is_active },
      ip: req.ip || '127.0.0.1'
    }).catch(() => {});

    return res.status(200).json({
      success: true,
      message: `User ${updatedUser.username} ${is_active ? 'activated' : 'deactivated'}.`,
      user: updatedUser
    });
  } catch (err) {
    return res.status(400).json({ success: false, error: err.message });
  }
}

module.exports = {
  register,
  login,
  getMe,
  logout,
  listUsers,
  updateRole,
  updateStatus
};
