const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const { Pool } = require('pg');
const bcrypt = require('bcryptjs');
const { getPoolConfig } = require('./init');

async function seedAdmin() {
  const pool = new Pool(getPoolConfig());
  try {
    const existing = await pool.query('SELECT id, username FROM users WHERE username = $1', ['admin']);
    if (existing.rows.length === 0) {
      const hash = await bcrypt.hash('Admin@123', 10);
      const insertRes = await pool.query(
        `INSERT INTO users (username, email, password_hash, full_name, role)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING id, username, email, role, created_at`,
        ['admin', 'admin@mineguard.gov.in', hash, 'Chief Mine Safety Administrator', 'admin']
      );
      console.log('✅ Admin user created successfully:', insertRes.rows[0]);
    } else {
      console.log('ℹ️ Admin user already exists:', existing.rows[0]);
    }
  } catch (err) {
    console.error('❌ Error seeding admin:', err.message);
  } finally {
    await pool.end();
  }
}

if (require.main === module) {
  seedAdmin();
}

module.exports = { seedAdmin };
