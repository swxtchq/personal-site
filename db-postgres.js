// Storage in PostgreSQL (for example Neon or Render Postgres). Used on the hosting.
// The connection string is taken from DATABASE_URL.

const crypto = require("crypto");
const { Pool } = require("pg");

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

// the database may close unused connections (Neon does it when it sleeps);
// without this handler such an error would stop the whole server
pool.on("error", (error) => {
  console.error("Database connection closed:", error.message);
});

async function init() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id             TEXT PRIMARY KEY,
      name           TEXT NOT NULL,
      username       TEXT NOT NULL,
      username_lower TEXT NOT NULL UNIQUE,
      email          TEXT NOT NULL UNIQUE,
      password_hash  TEXT NOT NULL,
      bio            TEXT NOT NULL DEFAULT '',
      created_at     TEXT NOT NULL
    )`);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS sessions (
      token      TEXT PRIMARY KEY,
      user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      expires_at BIGINT NOT NULL
    )`);
  console.log("Connected to PostgreSQL");
}


// ------------------------------------------------------------------- users

const USER_COLUMNS = "id, name, username, email, password_hash, bio, created_at";

// database columns -> the object the rest of the code uses
function toUser(row) {
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    username: row.username,
    email: row.email,
    passwordHash: row.password_hash,
    bio: row.bio,
    createdAt: row.created_at
  };
}

async function findUserById(id) {
  const result = await pool.query(`SELECT ${USER_COLUMNS} FROM users WHERE id = $1`, [id]);
  return toUser(result.rows[0]);
}

async function findUserByEmail(email) {
  const result = await pool.query(`SELECT ${USER_COLUMNS} FROM users WHERE email = $1`, [email]);
  return toUser(result.rows[0]);
}

async function findUserByUsername(username) {
  const result = await pool.query(
    `SELECT ${USER_COLUMNS} FROM users WHERE username_lower = $1`, [username.toLowerCase()]);
  return toUser(result.rows[0]);
}

// returns null if the email or username is already used
async function createUser({ name, username, email, passwordHash }) {
  const user = {
    id: crypto.randomUUID(),
    name,
    username,
    email,
    passwordHash,
    bio: "",
    createdAt: new Date().toISOString().slice(0, 10)
  };
  const result = await pool.query(
    `INSERT INTO users (id, name, username, username_lower, email, password_hash, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     ON CONFLICT DO NOTHING`,
    [user.id, name, username, username.toLowerCase(), email, passwordHash, user.createdAt]);
  return result.rowCount === 1 ? user : null;
}

async function updateProfile(id, { name, bio }) {
  await pool.query("UPDATE users SET name = $1, bio = $2 WHERE id = $3", [name, bio, id]);
}


// ---------------------------------------------------------------- sessions

async function createSession(token, userId, expires) {
  // remove sessions that have already expired
  await pool.query("DELETE FROM sessions WHERE expires_at < $1", [Date.now()]);
  await pool.query(
    "INSERT INTO sessions (token, user_id, expires_at) VALUES ($1, $2, $3)",
    [token, userId, expires]);
}

async function findSession(token) {
  const result = await pool.query(
    "SELECT user_id FROM sessions WHERE token = $1 AND expires_at > $2", [token, Date.now()]);
  return result.rows[0] ? { userId: result.rows[0].user_id } : null;
}

async function deleteSession(token) {
  await pool.query("DELETE FROM sessions WHERE token = $1", [token]);
}

module.exports = {
  init,
  findUserById,
  findUserByEmail,
  findUserByUsername,
  createUser,
  updateProfile,
  createSession,
  findSession,
  deleteSession
};
