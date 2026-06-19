require('dotenv').config()

const express = require('express')
const cors    = require('cors')

const { migrate }                   = require('./db')
const authRoutes                    = require('./routes/auth')
const taskRoutes                    = require('./routes/tasks')
const adminRoutes                   = require('./routes/admin')
const { authRequired, adminRequired } = require('./middleware/auth')

const app  = express()
const PORT = process.env.PORT || 8080

// ─── Middleware ───────────────────────────────────────────────────

// Allow requests from the Next.js frontend
app.use(cors({
  origin:      'http://localhost:3000',
  credentials: true,
}))

// Parse JSON request bodies
app.use(express.json())

// ─── Routes ──────────────────────────────────────────────────────

// Public routes (no login needed)
app.use('/auth', authRoutes)

// Protected routes (JWT required)
app.use('/tasks', authRequired, taskRoutes)

// Admin routes (JWT + admin role required)
app.use('/admin', authRequired, adminRequired, adminRoutes)

// Health check — useful to verify the server is running
app.get('/health', (req, res) => {
  res.json({ status: 'ok', message: 'TaskFlow API is running' })
})

// 404 handler for unknown routes
app.use((req, res) => {
  res.status(404).json({ error: `Route ${req.method} ${req.path} not found` })
})

// Global error handler
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err)
  res.status(500).json({ error: 'Something went wrong on the server' })
})

// ─── Start ───────────────────────────────────────────────────────

// Run migrations first, then start the server
migrate().then(() => {
  app.listen(PORT, () => {
    console.log(`🚀 Server running on http://localhost:${PORT}`)
  })
}).catch((err) => {
  console.error('❌ Failed to run migrations:', err)
  process.exit(1)
})

module.exports = app
