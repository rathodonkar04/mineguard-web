/**
 * MineGuard Node.js + Express + Socket.IO Backend Server
 * Smart India Hackathon 2026 (Problem Statement 26025)
 * 
 * Target: Real-Time Mine Subsidence Monitoring & Early Warning System
 */

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const http = require('http');
const express = require('express');
const { Server } = require('socket.io');
const cors = require('cors');

const telemetryRoutes = require('./routes/telemetry');
const authRoutes = require('./routes/auth');
const forecastRoutes = require('./routes/forecast');
const reportsRoutes = require('./routes/reports');
const mineRoutes = require('./routes/mineRoutes');
const { checkSensorHeartbeats, getAllSensors } = require('./services/sensorService');

const app = express();
const server = http.createServer(app);

const PORT = process.env.PORT || 5000;
const CORS_ORIGIN = process.env.CORS_ORIGIN || 'http://localhost:5173';

// 1. Socket.IO Setup
const io = new Server(server, {
  cors: {
    origin: CORS_ORIGIN === '*' ? '*' : [CORS_ORIGIN, 'http://localhost:5173', 'http://127.0.0.1:5173', 'http://localhost:5174', 'http://127.0.0.1:5174'],
    methods: ['GET', 'POST'],
    credentials: true
  }
});

// Attach io instance to express app for controllers
app.set('io', io);

// 2. Express Middlewares
app.use(cors({
  origin: CORS_ORIGIN === '*' ? '*' : [CORS_ORIGIN, 'http://localhost:5173', 'http://127.0.0.1:5173', 'http://localhost:5174', 'http://127.0.0.1:5174'],
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Camera-Token', 'X-Camera-Angle']
}));
app.use(express.json());
app.use(require('./routes/camera'));
app.get('/health', require('./controllers/telemetryController').getHealth);

// Simple request logger
app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    const duration = Date.now() - start;
    if (req.path.startsWith('/api')) {
      console.log(`[${new Date().toISOString()}] ${req.method} ${req.originalUrl} -> ${res.statusCode} (${duration}ms)`);
    }
  });
  next();
});

// 3. Mount Routes
app.use('/api/auth', authRoutes);
app.use('/api', authRoutes);
app.use('/api', telemetryRoutes);
app.use('/api', forecastRoutes);
app.use('/api/reports', reportsRoutes);
app.use('/api', reportsRoutes);
app.use('/api', mineRoutes);

// Serve the production dashboard on the same origin as API and Socket.IO.
const fs = require('fs');
const frontendDir = fs.existsSync(path.join(__dirname, 'public/index.html'))
  ? path.join(__dirname, 'public') : path.join(__dirname, '../dist');
app.use(express.static(frontendDir));
app.get('*', (req, res) => {
  if (req.path.startsWith('/api/') || !req.accepts('html')) return res.status(404).json({ error: 'Not found' });
  if (fs.existsSync(path.join(frontendDir, 'index.html'))) return res.sendFile(path.join(frontendDir, 'index.html'));
  res.status(404).json({ error: 'Build the frontend with npm run build' });
});
app.use((err, req, res, next) => {
  console.error('[Request]', err.message);
  res.status(err.status || 500).json({ success: false, error: err.status === 413 ? 'Upload exceeds 5 MB' : 'Request failed' });
});

// 4. Socket.IO Real-Time Connection Handling
io.on('connection', (socket) => {
  console.log(`[Socket.IO] Client connected: ${socket.id}`);

  // Send current state to newly connected client
  socket.emit('initialState', {
    sensors: getAllSensors(),
    connectedAt: new Date().toISOString()
  });

  socket.on('disconnect', () => {
    console.log(`[Socket.IO] Client disconnected: ${socket.id}`);
  });
});

// 5. Periodic Heartbeat Checker (runs every 10 seconds)
const heartbeatInterval = setInterval(() => {
  checkSensorHeartbeats(io);
}, 10000);

// Graceful cleanup on shutdown
function handleShutdown() {
  console.log('[Server] Shutting down gracefully...');
  clearInterval(heartbeatInterval);
  server.close(() => {
    console.log('[Server] Closed.');
    process.exit(0);
  });
}

process.on('SIGINT', handleShutdown);
process.on('SIGTERM', handleShutdown);

process.on('unhandledRejection', (reason) => {
  console.warn('⚠️ [Process Warning: Unhandled Rejection]', reason?.message || reason);
});

process.on('uncaughtException', (err) => {
  console.error('❌ [Process Warning: Uncaught Exception]', err.message);
});

// Error handling for server listen (e.g. EADDRINUSE)
server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`\n❌ [Server Error] Port ${PORT} is already in use by another process.`);
    console.error(`   To resolve, close the other process using port ${PORT} or check running background tasks.\n`);
  } else {
    console.error('[Server Error]', err);
  }
  process.exit(1);
});

// Only listen if executed directly
if (require.main === module) {
  server.listen(PORT, () => {
    console.log('====================================================');
    console.log(` MineGuard Real-Time Backend Active on Port ${PORT}`);
    console.log(` Health endpoint: http://localhost:${PORT}/api/health`);
    console.log(` Telemetry ingest: POST http://localhost:${PORT}/api/telemetry`);
    console.log(` Hardware gateway: POST http://localhost:${PORT}/api/readings`);
    console.log(` Risk history:    GET http://localhost:${PORT}/api/history/risk`);
    console.log('====================================================');
  });
}

module.exports = { app, server, io };
