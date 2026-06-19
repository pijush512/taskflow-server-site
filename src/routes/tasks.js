const express  = require('express')
const { body, query, validationResult } = require('express-validator')
const { pool } = require('../db')

const router = express.Router()

// ─── Helper: log a change to the activity_logs table ─────────────
async function logActivity(taskId, userId, action, detail) {
  try {
    await pool.query(
      'INSERT INTO activity_logs (task_id, user_id, action, detail) VALUES ($1, $2, $3, $4)',
      [taskId, userId, action, detail]
    )
  } catch (err) {
    // Activity logging is best-effort — don't crash the request if it fails
    console.error('Activity log error:', err.message)
  }
}

// ─── POST /tasks ──────────────────────────────────────────────────
// Create a new task
router.post(
  '/',
  [
    body('title')
      .trim()
      .notEmpty().withMessage('Title is required')
      .isLength({ max: 255 }).withMessage('Title must be under 255 characters'),
    body('status')
      .optional()
      .isIn(['todo', 'in_progress', 'done']).withMessage('Status must be todo, in_progress, or done'),
    body('priority')
      .optional()
      .isIn(['low', 'medium', 'high']).withMessage('Priority must be low, medium, or high'),
    body('due_date')
      .optional({ checkFalsy: true })
      .isISO8601().withMessage('due_date must be a valid date (e.g. 2025-12-31)'),
  ],
  async (req, res) => {
    const errors = validationResult(req)
    if (!errors.isEmpty()) {
      return res.status(400).json({ error: errors.array()[0].msg })
    }

    const { title, description = '', status = 'todo', priority = 'medium', due_date } = req.body
    const userId = req.user.id

    try {
      const result = await pool.query(
        `INSERT INTO tasks (user_id, title, description, status, priority, due_date)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING *`,
        [userId, title, description, status, priority, due_date || null]
      )

      const task = result.rows[0]
      await logActivity(task.id, userId, 'created', `Task "${task.title}" was created`)

      return res.status(201).json(task)
    } catch (err) {
      console.error('Create task error:', err)
      return res.status(500).json({ error: 'Failed to create task' })
    }
  }
)

// ─── GET /tasks ───────────────────────────────────────────────────
// List tasks with search, filter, sort, and pagination
// Query params: status, search, sort_by, order, page, limit
router.get('/', async (req, res) => {
  const userId = req.user.id

  // Read and sanitize query params
  const status  = req.query.status  || ''
  const search  = req.query.search  || ''
  const sortBy  = req.query.sort_by || 'created_at'
  const order   = req.query.order   || 'desc'
  const page    = Math.max(1, parseInt(req.query.page)  || 1)
  const limit   = Math.min(100, Math.max(1, parseInt(req.query.limit) || 10))
  const offset  = (page - 1) * limit

  // Only allow safe sort column names to prevent SQL injection
  const allowedSortColumns = {
    created_at: 'created_at',
    updated_at: 'updated_at',
    due_date:   'due_date',
    title:      'title',
    // For priority, sort by importance: high=1, medium=2, low=3
    priority:   `CASE priority WHEN 'high' THEN 1 WHEN 'medium' THEN 2 WHEN 'low' THEN 3 END`,
  }
  const sortColumn  = allowedSortColumns[sortBy]  || 'created_at'
  const sortOrder   = order === 'asc' ? 'ASC' : 'DESC'

  // Build WHERE clause dynamically
  const conditions = ['user_id = $1']
  const params     = [userId]
  let   paramIndex = 2

  const validStatuses = ['todo', 'in_progress', 'done']
  if (status && validStatuses.includes(status)) {
    conditions.push(`status = $${paramIndex}`)
    params.push(status)
    paramIndex++
  }

  if (search) {
    // ILIKE = case-insensitive search
    conditions.push(`title ILIKE $${paramIndex}`)
    params.push(`%${search}%`)
    paramIndex++
  }

  const where = conditions.join(' AND ')

  try {
    // Get total count (for pagination info)
    const countResult = await pool.query(
      `SELECT COUNT(*) FROM tasks WHERE ${where}`,
      params
    )
    const total      = parseInt(countResult.rows[0].count)
    const totalPages = Math.ceil(total / limit)

    // Get paginated tasks
    const tasksResult = await pool.query(
      `SELECT * FROM tasks
       WHERE ${where}
       ORDER BY ${sortColumn} ${sortOrder}
       LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
      [...params, limit, offset]
    )

    return res.status(200).json({
      tasks:       tasksResult.rows,
      total,
      page,
      limit,
      total_pages: totalPages,
    })
  } catch (err) {
    console.error('List tasks error:', err)
    return res.status(500).json({ error: 'Failed to fetch tasks' })
  }
})

// ─── GET /tasks/:id ───────────────────────────────────────────────
// Get a single task (only if it belongs to the logged-in user)
router.get('/:id', async (req, res) => {
  const taskId = parseInt(req.params.id)
  const userId = req.user.id

  if (isNaN(taskId)) {
    return res.status(400).json({ error: 'Invalid task ID' })
  }

  try {
    const result = await pool.query(
      'SELECT * FROM tasks WHERE id = $1 AND user_id = $2',
      [taskId, userId]
    )

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Task not found' })
    }

    return res.status(200).json(result.rows[0])
  } catch (err) {
    console.error('Get task error:', err)
    return res.status(500).json({ error: 'Failed to fetch task' })
  }
})

// ─── PATCH /tasks/:id ─────────────────────────────────────────────
// Update a task — only send the fields you want to change
router.patch(
  '/:id',
  [
    body('title')
      .optional()
      .trim()
      .notEmpty().withMessage('Title cannot be empty')
      .isLength({ max: 255 }).withMessage('Title must be under 255 characters'),
    body('status')
      .optional()
      .isIn(['todo', 'in_progress', 'done']).withMessage('Invalid status'),
    body('priority')
      .optional()
      .isIn(['low', 'medium', 'high']).withMessage('Invalid priority'),
    body('due_date')
      .optional({ checkFalsy: true })
      .isISO8601().withMessage('due_date must be a valid date'),
  ],
  async (req, res) => {
    const errors = validationResult(req)
    if (!errors.isEmpty()) {
      return res.status(400).json({ error: errors.array()[0].msg })
    }

    const taskId = parseInt(req.params.id)
    const userId = req.user.id

    if (isNaN(taskId)) {
      return res.status(400).json({ error: 'Invalid task ID' })
    }

    // Check the task exists and belongs to this user
    const existing = await pool.query(
      'SELECT * FROM tasks WHERE id = $1 AND user_id = $2',
      [taskId, userId]
    )
    if (existing.rows.length === 0) {
      return res.status(404).json({ error: 'Task not found' })
    }

    // Build dynamic SET clause — only update the fields that were sent
    const allowed = ['title', 'description', 'status', 'priority', 'due_date']
    const setClauses = ['updated_at = NOW()']
    const params     = []
    const changes    = []
    let   paramIndex = 1

    for (const field of allowed) {
      if (req.body[field] !== undefined) {
        setClauses.push(`${field} = $${paramIndex}`)
        // Empty string for due_date means "clear it"
        params.push(field === 'due_date' && req.body[field] === '' ? null : req.body[field])
        paramIndex++

        // Track what changed for the activity log
        if (field === 'status')   changes.push(`status changed to "${req.body[field]}"`)
        if (field === 'priority') changes.push(`priority changed to "${req.body[field]}"`)
        if (field === 'title')    changes.push(`title changed to "${req.body[field]}"`)
        if (field === 'due_date' && req.body[field]) changes.push('due date updated')
      }
    }

    params.push(taskId, userId)

    try {
      const result = await pool.query(
        `UPDATE tasks
         SET ${setClauses.join(', ')}
         WHERE id = $${paramIndex} AND user_id = $${paramIndex + 1}
         RETURNING *`,
        params
      )

      const updatedTask = result.rows[0]

      if (changes.length > 0) {
        await logActivity(taskId, userId, 'updated', changes.join('; '))
      }

      return res.status(200).json(updatedTask)
    } catch (err) {
      console.error('Update task error:', err)
      return res.status(500).json({ error: 'Failed to update task' })
    }
  }
)

// ─── DELETE /tasks/:id ────────────────────────────────────────────
router.delete('/:id', async (req, res) => {
  const taskId = parseInt(req.params.id)
  const userId = req.user.id

  if (isNaN(taskId)) {
    return res.status(400).json({ error: 'Invalid task ID' })
  }

  try {
    const result = await pool.query(
      'DELETE FROM tasks WHERE id = $1 AND user_id = $2 RETURNING title',
      [taskId, userId]
    )

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Task not found' })
    }

    return res.status(200).json({
      message: `Task "${result.rows[0].title}" deleted successfully`,
    })
  } catch (err) {
    console.error('Delete task error:', err)
    return res.status(500).json({ error: 'Failed to delete task' })
  }
})

// ─── GET /tasks/:id/activity ──────────────────────────────────────
// Get the change history for a task
router.get('/:id/activity', async (req, res) => {
  const taskId = parseInt(req.params.id)
  const userId = req.user.id

  if (isNaN(taskId)) {
    return res.status(400).json({ error: 'Invalid task ID' })
  }

  // Make sure the task belongs to this user
  const taskCheck = await pool.query(
    'SELECT id FROM tasks WHERE id = $1 AND user_id = $2',
    [taskId, userId]
  )
  if (taskCheck.rows.length === 0) {
    return res.status(404).json({ error: 'Task not found' })
  }

  try {
    const result = await pool.query(
      `SELECT * FROM activity_logs
       WHERE task_id = $1
       ORDER BY created_at DESC`,
      [taskId]
    )
    return res.status(200).json(result.rows)
  } catch (err) {
    console.error('Activity log error:', err)
    return res.status(500).json({ error: 'Failed to fetch activity' })
  }
})

module.exports = router
