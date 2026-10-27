const express = require('express');
const router = express.Router();

const {
  getParameters,
  getSubsidenceForecast,
  postCalculateForecast
} = require('../controllers/forecastController');

const { optionalAuth } = require('../middlewares/authMiddleware');

// 1. Retrieve baseline geotechnical parameters
router.get('/forecast/parameters', getParameters);

// 2. Retrieve live forward subsidence forecast
router.get('/forecast/subsidence', getSubsidenceForecast);

// 3. Interactive calculation & scenario simulation endpoint
router.post('/forecast/calculate', optionalAuth, postCalculateForecast);
router.post('/forecast/simulate', optionalAuth, postCalculateForecast);

module.exports = router;
