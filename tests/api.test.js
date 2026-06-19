const request = require('supertest')
const bcrypt  = require('bcryptjs')
const app     = require('../src/server')
const { pool } = require('../src/db')

// Clean up database before each test so tests don't affect each other
beforeEach(async () => {
  await pool.query('DELETE FROM activity_logs')
  await pool.query('DELETE FROM tasks')
  await pool.query('DELETE FROM users')
})

// Close the DB connection after all tests finish
afterAll(async () => {
  await pool.end()
})

// Test 1: Signup creates a new account and returns a token 
describe('POST /auth/signup', () => {
  test('creates account and returns token', async () => {
    const res = await request(app)
      .post('/auth/signup')
      .send({ name: 'Test User', email: 'test@example.com', password: 'password123' })

    expect(res.status).toBe(201)
    expect(res.body.token).toBeDefined()
    expect(res.body.user.email).toBe('test@example.com')
    // Password must never be returned
    expect(res.body.user.password).toBeUndefined()
  })

  test('rejects duplicate email', async () => {
    const hashed = await bcrypt.hash('pass123', 12)
    await pool.query(
      "INSERT INTO users (name, email, password) VALUES ('Existing', 'dupe@test.com', $1)",
      [hashed]
    )

    const res = await request(app)
      .post('/auth/signup')
      .send({ name: 'New User', email: 'dupe@test.com', password: 'password123' })

    expect(res.status).toBe(409)
  })

  test('rejects short password', async () => {
    const res = await request(app)
      .post('/auth/signup')
      .send({ name: 'Test', email: 'test@test.com', password: '123' })

    expect(res.status).toBe(400)
  })
})

//Test 2: Login returns token for correct credentials
describe('POST /auth/login', () => {
  beforeEach(async () => {
    const hashed = await bcrypt.hash('correctpassword', 12)
    await pool.query(
      "INSERT INTO users (name, email, password) VALUES ('Login User', 'login@test.com', $1)",
      [hashed]
    )
  })

  test('returns token for correct credentials', async () => {
    const res = await request(app)
      .post('/auth/login')
      .send({ email: 'login@test.com', password: 'correctpassword' })

    expect(res.status).toBe(200)
    expect(res.body.token).toBeDefined()
  })

  test('rejects wrong password', async () => {
    const res = await request(app)
      .post('/auth/login')
      .send({ email: 'login@test.com', password: 'wrongpassword' })

    expect(res.status).toBe(401)
  })

  test('rejects unknown email', async () => {
    const res = await request(app)
      .post('/auth/login')
      .send({ email: 'nobody@test.com', password: 'password123' })

    expect(res.status).toBe(401)
  })
})

// Test 3: Task CRUD requires auth and enforces ownership 
describe('Task routes', () => {
  let token
  let otherToken

  // Create two users and get their tokens before each test
  beforeEach(async () => {
    const signupA = await request(app)
      .post('/auth/signup')
      .send({ name: 'User A', email: 'a@test.com', password: 'password123' })
    token = signupA.body.token

    const signupB = await request(app)
      .post('/auth/signup')
      .send({ name: 'User B', email: 'b@test.com', password: 'password123' })
    otherToken = signupB.body.token
  })

  test('creates a task', async () => {
    const res = await request(app)
      .post('/tasks')
      .set('Authorization', `Bearer ${token}`)
      .send({ title: 'My Task', priority: 'high' })

    expect(res.status).toBe(201)
    expect(res.body.title).toBe('My Task')
    expect(res.body.priority).toBe('high')
    expect(res.body.status).toBe('todo') // default
  })

  test('rejects unauthenticated task creation', async () => {
    const res = await request(app)
      .post('/tasks')
      .send({ title: 'My Task' })

    expect(res.status).toBe(401)
  })

  test('rejects empty title', async () => {
    const res = await request(app)
      .post('/tasks')
      .set('Authorization', `Bearer ${token}`)
      .send({ title: '' })

    expect(res.status).toBe(400)
  })

  test('user cannot access another user task', async () => {
    // User A creates a task
    const createRes = await request(app)
      .post('/tasks')
      .set('Authorization', `Bearer ${token}`)
      .send({ title: 'Private Task' })

    const taskId = createRes.body.id

    // User B tries to get that task
    const res = await request(app)
      .get(`/tasks/${taskId}`)
      .set('Authorization', `Bearer ${otherToken}`)

    expect(res.status).toBe(404)
  })

  test('lists tasks with pagination', async () => {
    // Create 3 tasks
    for (let i = 1; i <= 3; i++) {
      await request(app)
        .post('/tasks')
        .set('Authorization', `Bearer ${token}`)
        .send({ title: `Task ${i}` })
    }

    const res = await request(app)
      .get('/tasks?limit=2&page=1')
      .set('Authorization', `Bearer ${token}`)

    expect(res.status).toBe(200)
    expect(res.body.tasks.length).toBe(2)
    expect(res.body.total).toBe(3)
    expect(res.body.total_pages).toBe(2)
  })
})
