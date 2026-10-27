const express = require('express');
const router = express.Router();
const { 
  register, 
  login, 
  getMe, 
  logout, 
  listUsers, 
  updateRole, 
  updateStatus 
} = require('../controllers/authController');
const { requireAuth, requireRole } = require('../middlewares/authMiddleware');

// Public authentication routes
router.post('/register', register);
router.post('/login', login);
router.post('/logout', logout);

// Protected profile route
router.get('/me', requireAuth, getMe);

// Administrator User Management
router.get('/users', requireAuth, requireRole(['admin']), listUsers);
router.post('/users/:id/role', requireAuth, requireRole(['admin']), updateRole);
router.post('/users/:id/status', requireAuth, requireRole(['admin']), updateStatus);

module.exports = router;

