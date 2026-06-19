# 🚀 TaskFlow API

The robust backend API powering the TaskFlow management platform. Built with Node.js, Express.js, and PostgreSQL, this production-ready server is optimized for serverless deployment on Vercel and hosted on Neon PostgreSQL Cloud.

## 🛠️ Tech Stack & Features
- **Node.js & Express.js** - Fast, unopinionated backend framework.
- **PostgreSQL (Neon)** - Serverless relational database cloud.
- **JWT (JSON Web Tokens)** - Secure stateless user authentication.
- **BcryptJS** - Strong password hashing security.
- **Express Validator** - Robust server-side request sanitization and validation.
- **Auto-Migrations** - Automatic database table provisioning on initialization.

## 🌐 Live API URL
👉 [TaskFlow Live API](https://taskflow-server-site.vercel.app)

## ⚙️ Environment Variables (`.env`)
To run this project locally, create a `.env` file in your backend root directory and configure the following variables:
```text
DATABASE_URL=your_neon_postgresql_connection_string
JWT_SECRET=your-super-secret-key-change-this
PORT=8080
NODE_ENV=development