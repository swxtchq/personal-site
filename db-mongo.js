// Storage in MongoDB (MongoDB Atlas). Used on the hosting.
// The connection string is taken from MONGODB_URI.

const crypto = require("crypto");
const { MongoClient } = require("mongodb");

let users;
let sessions;

async function init() {
  const client = new MongoClient(process.env.MONGODB_URI);
  await client.connect();

  const database = client.db(process.env.MONGODB_DB || "personal_site");
  users = database.collection("users");
  sessions = database.collection("sessions");

  // unique indexes: the same email or username cannot be registered twice
  await users.createIndex({ id: 1 }, { unique: true });
  await users.createIndex({ email: 1 }, { unique: true });
  await users.createIndex({ usernameLower: 1 }, { unique: true });
  await sessions.createIndex({ token: 1 }, { unique: true });
  // MongoDB deletes expired sessions by itself
  await sessions.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 });

  console.log("Connected to MongoDB");
}


// ------------------------------------------------------------------- users

async function findUserById(id) {
  return users.findOne({ id });
}

async function findUserByEmail(email) {
  return users.findOne({ email });
}

async function findUserByUsername(username) {
  return users.findOne({ usernameLower: username.toLowerCase() });
}

// returns null if the email or username is already used
async function createUser({ name, username, email, passwordHash }) {
  const user = {
    id: crypto.randomUUID(),
    name,
    username,
    usernameLower: username.toLowerCase(),
    email,
    passwordHash,
    bio: "",
    createdAt: new Date().toISOString().slice(0, 10)
  };
  try {
    await users.insertOne(user);
    return user;
  } catch (error) {
    if (error.code === 11000) return null; // duplicate key (email or username)
    throw error;
  }
}

async function updateUser(id, changes) {
  await users.updateOne({ id }, { $set: changes });
}


// ---------------------------------------------------------------- sessions

async function createSession(token, userId, expires) {
  await sessions.insertOne({ token, userId, expiresAt: new Date(expires) });
}

async function findSession(token) {
  const session = await sessions.findOne({ token });
  if (!session || session.expiresAt.getTime() < Date.now()) return null;
  return session;
}

async function deleteSession(token) {
  await sessions.deleteOne({ token });
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
