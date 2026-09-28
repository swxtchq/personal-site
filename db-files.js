// Storage in JSON files inside the "data" folder (used on a local computer).
// data/users.json    - registered users (profiles)
// data/sessions.json - who is logged in (token from the cookie -> user id)

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const DATA_DIR = path.join(__dirname, "data");
const USERS_FILE = path.join(DATA_DIR, "users.json");
const SESSIONS_FILE = path.join(DATA_DIR, "sessions.json");

async function init() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  console.log("Data is stored in the data folder");
}

function readJson(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch (error) {
    if (error.code === "ENOENT") return fallback; // file does not exist yet
    throw error;
  }
}

// write to a temporary file first, so a crash cannot leave a half-written file
function writeJson(file, data) {
  const temp = file + ".tmp";
  fs.writeFileSync(temp, JSON.stringify(data, null, 2));
  fs.renameSync(temp, file);
}


// ------------------------------------------------------------------- users

function getUsers() {
  return readJson(USERS_FILE, []);
}

async function findUserById(id) {
  return getUsers().find((user) => user.id === id) || null;
}

async function findUserByEmail(email) {
  return getUsers().find((user) => user.email === email) || null;
}

async function findUserByUsername(username) {
  const name = username.toLowerCase();
  return getUsers().find((user) => user.username.toLowerCase() === name) || null;
}

// returns null if the email or username is already used
async function createUser({ name, username, email, passwordHash }) {
  const users = getUsers();
  const taken = users.some((user) =>
    user.email === email || user.username.toLowerCase() === username.toLowerCase());
  if (taken) return null;

  const user = {
    id: crypto.randomUUID(),
    name,
    username,
    email,
    passwordHash,
    bio: "",
    createdAt: new Date().toISOString().slice(0, 10)
  };
  users.push(user);
  writeJson(USERS_FILE, users);
  return user;
}

async function updateUser(id, changes) {
  const users = getUsers();
  const user = users.find((u) => u.id === id);
  if (!user) return;
  Object.assign(user, changes);
  writeJson(USERS_FILE, users);
}


// ---------------------------------------------------------------- sessions

async function createSession(token, userId, expires) {
  const now = Date.now();
  const sessions = readJson(SESSIONS_FILE, {});

  // remove sessions that have already expired
  for (const key of Object.keys(sessions)) {
    if (sessions[key].expires < now) delete sessions[key];
  }
  sessions[token] = { userId, expires };
  writeJson(SESSIONS_FILE, sessions);
}

async function findSession(token) {
  const sessions = readJson(SESSIONS_FILE, {});
  if (!Object.prototype.hasOwnProperty.call(sessions, token)) return null;

  const session = sessions[token];
  if (session.expires < Date.now()) {
    delete sessions[token];
    writeJson(SESSIONS_FILE, sessions);
    return null;
  }
  return session;
}

async function deleteSession(token) {
  const sessions = readJson(SESSIONS_FILE, {});
  if (Object.prototype.hasOwnProperty.call(sessions, token)) {
    delete sessions[token];
    writeJson(SESSIONS_FILE, sessions);
  }
}

module.exports = {
  init,
  findUserById,
  findUserByEmail,
  findUserByUsername,
  createUser,
  updateUser,
  createSession,
  findSession,
  deleteSession
};
