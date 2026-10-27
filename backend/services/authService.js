/**
 * MineGuard User Authentication Service
 * Smart India Hackathon 2026 (Problem Statement 26025)
 * 
 * Secure JWT Authentication with bcrypt Password Hashing:
 * - Persistent storage in PostgreSQL/Supabase 'users' table
 * - bcrypt salting & hashing (10 rounds)
 * - Signed JWT tokens with configurable expiration (24h default)
 * - In-memory fallback if database persistence is disabled
 */

const { Pool } = require('pg');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { getPoolConfig } = require('../db/init');

const JWT_SECRET = process.env.JWT_SECRET || 'mineguard_sih_2026_super_secret_jwt_key_98234';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '24h';

// In-memory fallback users cache (when DB is offline)
const inMemoryUsers = new Map();

class AuthService {
  constructor() {
    this.pool = null;
    this.enabled = process.env.DB_ENABLED !== 'false';
    if (this.enabled) {
      try {
        this.pool = new Pool({
          ...getPoolConfig(),
          max: parseInt(process.env.DB_POOL_MAX || '10', 10),
          idleTimeoutMillis: 30000,
          connectionTimeoutMillis: 5000
        });
        this.pool.on('error', (err) => {
          console.warn('[AuthService Pool Warning] Idle connection notice:', err.message);
        });
      } catch (err) {
        console.warn('[AuthService] Could not initialize pg pool, using in-memory mode:', err.message);
      }
    }

    // Seed default baseline stakeholder credentials into memory cache
    this.seedDefaultUsers();
  }

  async seedDefaultUsers() {
    try {
      const adminHash = await bcrypt.hash('Admin@123', 10);
      inMemoryUsers.set('admin', {
        id: 1,
        username: 'admin',
        email: 'admin@mineguard.gov.in',
        password_hash: adminHash,
        full_name: 'Chief Mine Safety Administrator',
        role: 'admin',
        is_active: true,
        created_at: new Date().toISOString()
      });

      const safetyHash = await bcrypt.hash('Safety@123', 10);
      inMemoryUsers.set('safety_officer_01', {
        id: 2,
        username: 'safety_officer_01',
        email: 'safety@moonidih.mineguard.in',
        password_hash: safetyHash,
        full_name: 'Shift Incharge Rajesh Kumar',
        role: 'operator',
        is_active: true,
        created_at: new Date().toISOString()
      });
    } catch (err) {
      console.warn('[AuthService] Error seeding default in-memory users:', err.message);
    }
  }

  /**
   * Register a new user / admin
   */
  async register({ username, email, password, full_name, role = 'operator' }) {
    if (!username || !email || !password) {
      throw new Error('Username, email, and password are required.');
    }
    if (username.length < 3) {
      throw new Error('Username must be at least 3 characters long.');
    }
    if (password.length < 6) {
      throw new Error('Password must be at least 6 characters long.');
    }

    const cleanUsername = username.trim().toLowerCase();
    const cleanEmail = email.trim().toLowerCase();
    const cleanRole = ['admin', 'operator', 'planner', 'regulator', 'auditor'].includes(role) ? role : 'operator';
    const cleanFullName = (full_name || username).trim();

    // 1. Hash password with bcrypt
    const passwordHash = await bcrypt.hash(password, 10);

    // 2. Insert into PostgreSQL if available
    if (this.pool) {
      try {
        const checkRes = await this.pool.query(
          'SELECT id FROM users WHERE username = $1 OR email = $2',
          [cleanUsername, cleanEmail]
        );
        if (checkRes.rows.length > 0) {
          throw new Error('User with this username or email already exists.');
        }

        const insertRes = await this.pool.query(
          `INSERT INTO users (username, email, password_hash, full_name, role)
           VALUES ($1, $2, $3, $4, $5)
           RETURNING id, username, email, full_name, role, is_active, created_at`,
          [cleanUsername, cleanEmail, passwordHash, cleanFullName, cleanRole]
        );
        const newUser = insertRes.rows[0];

        // Cache in memory
        inMemoryUsers.set(cleanUsername, { ...newUser, password_hash: passwordHash });

        // Generate JWT token
        const token = this.generateToken(newUser);
        return { user: newUser, token };
      } catch (err) {
        if (err.message.includes('already exists')) throw err;
        console.warn('[AuthService] Database insert failed, falling back to memory:', err.message);
      }
    }

    // In-Memory Fallback
    if (inMemoryUsers.has(cleanUsername)) {
      throw new Error('User with this username already exists in local session.');
    }
    const memUser = {
      id: Date.now(),
      username: cleanUsername,
      email: cleanEmail,
      full_name: cleanFullName,
      role: cleanRole,
      is_active: true,
      created_at: new Date().toISOString()
    };
    inMemoryUsers.set(cleanUsername, { ...memUser, password_hash: passwordHash });
    const token = this.generateToken(memUser);
    return { user: memUser, token };
  }

  /**
   * Authenticate and login with username/email and password
   */
  async login({ usernameOrEmail, password }) {
    if (!usernameOrEmail || !password) {
      throw new Error('Please provide both username/email and password.');
    }

    const identifier = usernameOrEmail.trim().toLowerCase();

    let userRecord = null;

    // 1. Check PostgreSQL Database
    if (this.pool) {
      try {
        const res = await this.pool.query(
          `SELECT id, username, email, password_hash, full_name, role, is_active, created_at
           FROM users
           WHERE LOWER(username) = $1 OR LOWER(email) = $1`,
          [identifier]
        );
        if (res.rows.length > 0) {
          userRecord = res.rows[0];
        }
      } catch (err) {
        console.warn('[AuthService] DB query failed during login, checking memory:', err.message);
      }
    }

    // 2. Check in-memory fallback
    if (!userRecord) {
      userRecord = inMemoryUsers.get(identifier);
    }

    if (!userRecord) {
      throw new Error('Invalid username or password.');
    }

    if (!userRecord.is_active) {
      throw new Error('This account has been deactivated. Please contact your system administrator.');
    }

    // 3. Verify password with bcrypt
    const isPasswordValid = await bcrypt.compare(password, userRecord.password_hash);
    if (!isPasswordValid) {
      throw new Error('Invalid username or password.');
    }

    // 4. Update last_login
    if (this.pool) {
      this.pool.query('UPDATE users SET last_login = NOW() WHERE id = $1', [userRecord.id]).catch(() => {});
    }

    // 5. Exclude password_hash from returned user object
    const { password_hash, ...safeUser } = userRecord;
    const token = this.generateToken(safeUser);

    return { user: safeUser, token };
  }

  /**
   * Verify JWT Token and return payload
   */
  verifyToken(token) {
    if (!token) throw new Error('Authentication token required.');
    try {
      const decoded = jwt.verify(token, JWT_SECRET);
      return decoded;
    } catch (err) {
      if (err.name === 'TokenExpiredError') {
        throw new Error('Your session has expired. Please log in again.');
      }
      throw new Error('Invalid authentication token.');
    }
  }

  /**
   * Helper to sign a JWT
   */
  generateToken(user) {
    return jwt.sign(
      {
        id: user.id,
        username: user.username,
        email: user.email,
        role: user.role,
        full_name: user.full_name
      },
      JWT_SECRET,
      { expiresIn: JWT_EXPIRES_IN }
    );
  }

  /**
   * Retrieve all registered users for administration
   */
  async getAllUsers() {
    if (this.pool) {
      try {
        const res = await this.pool.query(
          `SELECT id, username, email, full_name, role, is_active, created_at, last_login
           FROM users
           ORDER BY created_at DESC`
        );
        if (res.rows.length > 0) {
          return res.rows;
        }
      } catch (_err) {
        // Fall back to memory
      }
    }

    const memList = Array.from(inMemoryUsers.values()).map(u => {
      const { password_hash, ...safe } = u;
      return safe;
    });
    return memList;
  }

  /**
   * Update user role
   */
  async updateUserRole(userId, newRole) {
    const validRoles = ['admin', 'operator', 'planner', 'regulator', 'auditor'];
    if (!validRoles.includes(newRole)) {
      throw new Error(`Invalid role. Must be one of: ${validRoles.join(', ')}`);
    }

    if (this.pool) {
      try {
        const res = await this.pool.query(
          `UPDATE users SET role = $1 WHERE id = $2 RETURNING id, username, email, full_name, role, is_active`,
          [newRole, userId]
        );
        if (res.rows.length > 0) {
          const updated = res.rows[0];
          if (inMemoryUsers.has(updated.username)) {
            const cached = inMemoryUsers.get(updated.username);
            inMemoryUsers.set(updated.username, { ...cached, role: newRole });
          }
          return updated;
        }
      } catch (_err) {
        // Fall back to memory
      }
    }

    // In-memory update
    for (const [uname, u] of inMemoryUsers.entries()) {
      if (u.id === Number(userId) || u.id === userId) {
        u.role = newRole;
        inMemoryUsers.set(uname, u);
        const { password_hash, ...safe } = u;
        return safe;
      }
    }
    throw new Error('User not found.');
  }

  /**
   * Toggle user active/deactive status
   */
  async updateUserStatus(userId, isActive) {
    const active = Boolean(isActive);

    if (this.pool) {
      try {
        const res = await this.pool.query(
          `UPDATE users SET is_active = $1 WHERE id = $2 RETURNING id, username, email, full_name, role, is_active`,
          [active, userId]
        );
        if (res.rows.length > 0) {
          const updated = res.rows[0];
          if (inMemoryUsers.has(updated.username)) {
            const cached = inMemoryUsers.get(updated.username);
            inMemoryUsers.set(updated.username, { ...cached, is_active: active });
          }
          return updated;
        }
      } catch (_err) {
        // Fall back to memory
      }
    }

    // In-memory update
    for (const [uname, u] of inMemoryUsers.entries()) {
      if (u.id === Number(userId) || u.id === userId) {
        u.is_active = active;
        inMemoryUsers.set(uname, u);
        const { password_hash, ...safe } = u;
        return safe;
      }
    }
    throw new Error('User not found.');
  }
}

module.exports = new AuthService();
