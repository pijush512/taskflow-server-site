require('dotenv').config()

const express = require('express')
const cors    = require('cors')

const { migrate }                     = require('./db')
const authRoutes                    = require('./routes/auth')
const taskRoutes                    = require('./routes/tasks')
const adminRoutes                   = require('./routes/admin')
const { authRequired, adminRequired } = require('./middleware/auth')

const app  = express()
const PORT = process.env.PORT || 8080

// ─── Middleware ───────────────────────────────────────────────────

// CORS: প্রোডাকশনে আপনার Vercel ফ্রন্টএন্ড ইউআরএল অথবা '*' এলাউ করুন
app.use(cors({
  origin: process.env.FRONTEND_URL || '*', 
  credentials: true,
}))

app.use(express.json())

// ─── Routes ──────────────────────────────────────────────────────

// 🌟 ১. রুট রাউট যোগ করা হলো (যাতে সরাসরি লিংকে ঢুকলে ৪MD না আসে)
app.get('/', (req, res) => {
  res.send("🚀 TaskFlow API is running successfully on Vercel!")
})

app.use('/auth', authRoutes)
app.use('/tasks', authRequired, taskRoutes)
app.use('/admin', authRequired, adminRequired, adminRoutes)

app.get('/health', (req, res) => {
  res.json({ status: 'ok', message: 'TaskFlow API is running' })
})

app.use((req, res) => {
  res.status(404).json({ error: `Route ${req.method} ${req.path} not found` })
})

app.use((err, req, res, next) => {
  console.error('Unhandled error:', err)
  res.status(500).json({ error: 'Something went wrong on the server' })
})

// ─── Start ───────────────────────────────────────────────────────

// 🌟 ২. Vercel Serverless-এর জন্য মাইগ্রেশন হ্যান্ডলিং ফিক্স
// ─── Start ───────────────────────────────────────────────────────

if (process.env.NODE_ENV !== 'production') {
  migrate().then(() => {
    app.listen(PORT, () => {
      console.log(`🚀 Server running on http://localhost:${PORT}`)
    })
  }).catch((err) => {
    console.error('❌ Failed to run migrations:', err)
  })
} else {
  migrate().catch((err) => console.error('❌ Async Migration Failed:', err))
}

// 🌟 Vercel Serverless-এর জন্য এক্সপোর্ট সিনট্যাক্সটি এভাবে দিন:
module.exports = app;