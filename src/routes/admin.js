const express  = require('express')
const { pool } = require('../db')

const router = express.Router()

// GET /admin/tasks — view all tasks from all users (admin only)
router.get('/tasks', async (req, res) => {
  const page  = Math.max(1, parseInt(req.query.page)  || 1)
  const limit = Math.min(100, parseInt(req.query.limit) || 20)
  const offset = (page - 1) * limit

  try {
    const countResult = await pool.query('SELECT COUNT(*) FROM tasks')
    const total = parseInt(countResult.rows[0].count)

    const result = await pool.query(
      `SELECT t.*, u.name AS user_name, u.email AS user_email
       FROM tasks t
       JOIN users u ON u.id = t.user_id
       ORDER BY t.created_at DESC
       LIMIT $1 OFFSET $2`,
      [limit, offset]
    )

    return res.status(200).json({
      tasks: result.rows,
      total,
      page,
      limit,
      total_pages: Math.ceil(total / limit),
    })
  } catch (err) {
    console.error('Admin tasks error:', err)
    return res.status(500).json({ error: 'Failed to fetch tasks' })
  }
})

module.exports = router
