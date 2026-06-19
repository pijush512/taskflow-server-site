const express  = require('express')
const bcrypt   = require('bcryptjs')
const jwt      = require('jsonwebtoken')
const { body, validationResult } = require('express-validator')
const { pool } = require('../db')

const router = express.Router()

// ─── Helper: generate a JWT token valid for 7 days ───────────────
function generateToken(userId, role) {
  return jwt.sign(
    { user_id: userId, role },
    process.env.JWT_SECRET,
    { expiresIn: '7d' }
  )
}

// ─── Helper: send validation errors as a response ────────────────
function checkValidation(req, res) {
  const errors = validationResult(req)
  if (!errors.isEmpty()) {
    return res.status(400).json({ error: errors.array()[0].msg })
  }
  return null
}

// ─── POST /auth/signup ────────────────────────────────────────────
// Creates a new user account with a hashed password
router.post(
  '/signup',
  [
    body('name')
      .trim()
      .notEmpty().withMessage('Name is required')
      .isLength({ min: 2 }).withMessage('Name must be at least 2 characters'),
    body('email')
      .trim()
      .notEmpty().withMessage('Email is required')
      .isEmail().withMessage('Enter a valid email address'),
    body('password')
      .notEmpty().withMessage('Password is required')
      .isLength({ min: 6 }).withMessage('Password must be at least 6 characters'),
  ],
  async (req, res) => {
    // Check validation errors
    const validationError = checkValidation(req, res)
    if (validationError) return

    const { name, email, password } = req.body

    try {
      // Check if email is already taken
      const existing = await pool.query(
        'SELECT id FROM users WHERE email = $1',
        [email]
      )
      if (existing.rows.length > 0) {
        return res.status(409).json({ error: 'An account with this email already exists' })
      }

      // Hash the password — cost 12 is secure without being too slow
      const hashedPassword = await bcrypt.hash(password, 12)

      // Insert new user
      const result = await pool.query(
        `INSERT INTO users (name, email, password, role)
         VALUES ($1, $2, $3, 'user')
         RETURNING id, name, email, role, created_at`,
        [name, email, hashedPassword]
      )

      const user  = result.rows[0]
      const token = generateToken(user.id, user.role)

      return res.status(201).json({
        message: 'Account created successfully',
        token,
        user,
      })
    } catch (err) {
      console.error('Signup error:', err)
      return res.status(500).json({ error: 'Server error. Please try again.' })
    }
  }
)

// ─── POST /auth/login ─────────────────────────────────────────────
// Verifies credentials and returns a JWT token
router.post(
  '/login',
  [
    body('email').trim().notEmpty().withMessage('Email is required').isEmail().withMessage('Enter a valid email'),
    body('password').notEmpty().withMessage('Password is required'),
  ],
  async (req, res) => {
    const validationError = checkValidation(req, res)
    if (validationError) return

    const { email, password } = req.body

    try {
      // Find user by email
      const result = await pool.query(
        'SELECT id, name, email, password, role, created_at FROM users WHERE email = $1',
        [email]
      )

      if (result.rows.length === 0) {
        // Don't tell the user whether the email or password was wrong (security)
        return res.status(401).json({ error: 'Invalid email or password' })
      }

      const user = result.rows[0]

      // Compare the provided password with the stored hash
      const isMatch = await bcrypt.compare(password, user.password)
      if (!isMatch) {
        return res.status(401).json({ error: 'Invalid email or password' })
      }

      const token = generateToken(user.id, user.role)

      // Remove password from the response
      delete user.password

      return res.status(200).json({
        message: 'Logged in successfully',
        token,
        user,
      })
    } catch (err) {
      console.error('Login error:', err)
      return res.status(500).json({ error: 'Server error. Please try again.' })
    }
  }
)

module.exports = router
