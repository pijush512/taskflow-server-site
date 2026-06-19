const jwt = require('jsonwebtoken')

// This middleware runs on every protected route.
// It checks the Authorization header, verifies the JWT token,
// and puts the user's id and role into req.user
function authRequired(req, res, next) {
  const authHeader = req.headers['authorization']

  if (!authHeader) {
    return res.status(401).json({ error: 'Authorization header is missing' })
  }

  // Expected format: "Bearer <token>"
  const parts = authHeader.split(' ')
  if (parts.length !== 2 || parts[0] !== 'Bearer') {
    return res.status(401).json({ error: 'Invalid Authorization header format' })
  }

  const token = parts[1]

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET)
    // Store user info so route handlers can access it via req.user
    req.user = {
      id:   decoded.user_id,
      role: decoded.role,
    }
    next()
  } catch (err) {
    return res.status(401).json({ error: 'Invalid or expired token' })
  }
}

// This middleware checks that the logged-in user is an admin.
// Must be used AFTER authRequired.
function adminRequired(req, res, next) {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Admin access required' })
  }
  next()
}

module.exports = { authRequired, adminRequired }
