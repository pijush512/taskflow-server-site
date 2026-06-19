const { Pool } = require('pg')

const isProduction = process.env.NODE_ENV === 'production'

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || `postgresql://postgres:admine@localhost:5432/taskapp`,
  ssl: isProduction ? { rejectUnauthorized: false } : false,
})

// Test the connection safely
pool.connect((err, client, release) => {
  if (err) {
    console.error('❌ Failed to connect to PostgreSQL:', err.message)
    return;
  }
  release()
  console.log('✅ Connected to PostgreSQL Successfully via Connection String')
})

// Run this once on startup to create all tables
async function migrate() {
  const queries = [
    // Users table
    `CREATE TABLE IF NOT EXISTS users (
      id         SERIAL PRIMARY KEY,
      name       TEXT NOT NULL,
      email      TEXT NOT NULL UNIQUE,
      password   TEXT NOT NULL,
      role       TEXT NOT NULL DEFAULT 'user',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`,

    // Tasks table
    `CREATE TABLE IF NOT EXISTS tasks (
      id          SERIAL PRIMARY KEY,
      user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      title       TEXT NOT NULL,
      description TEXT DEFAULT '',
      status      TEXT NOT NULL DEFAULT 'todo',
      priority    TEXT NOT NULL DEFAULT 'medium',
      due_date    TIMESTAMPTZ,
      created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`,

    // Activity log — tracks every change made to a task
    `CREATE TABLE IF NOT EXISTS activity_logs (
      id         SERIAL PRIMARY KEY,
      task_id    INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
      user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      action     TEXT NOT NULL,
      detail     TEXT DEFAULT '',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`,

    // Indexes for faster queries
    `CREATE INDEX IF NOT EXISTS idx_tasks_user_id    ON tasks(user_id)`,
    `CREATE INDEX IF NOT EXISTS idx_activity_task_id ON activity_logs(task_id)`,
  ]

  for (const query of queries) {
    await pool.query(query)
  }

  console.log('✅ Database tables ready')
}

module.exports = { pool, migrate }