const express = require('express');
const router = express.Router();
const {
  getHierarchy,
  getMines,
  getMine,
  getPanel,
  getPanelSensors
} = require('../controllers/mineController');

// Multi-Mine & Colliery Hierarchy REST Routes
router.get('/hierarchy', getHierarchy);
router.get('/mines', getMines);
router.get('/mines/:mineId', getMine);
router.get('/mines/:mineId/panels/:panelId', getPanel);
router.get('/mines/:mineId/panels/:panelId/sensors', getPanelSensors);

module.exports = router;
