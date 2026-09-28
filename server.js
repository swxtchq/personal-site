// Personal website with registration, login, cookies and a profile.
// The website itself is shown only after the user logs in.

const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { promisify } = require("util");

loadEnvFile(path.join(__dirname, ".env"));

const db = require("./db");
const validate = require("./validation");
const views = require("./views");

const PORT = Number(process.env.PORT) || 3000;
// public address of the site (Render sets RENDER_EXTERNAL_URL automatically)
const BASE_URL = (process.env.BASE_URL || process.env.RENDER_EXTERNAL_URL ||
                  `http://localhost:${PORT}`).replace(/\/+$/, "");
// on https cookies get the Secure flag: the browser sends them only over an encrypted connection
const SECURE_COOKIES = BASE_URL.startsWith("https://");
const PUBLIC_DIR = path.join(__dirname, "public");
const MAX_BODY = 10 * 1024; // bytes
const DAY = 24 * 60 * 60 * 1000;
const TOKEN_RE = /^[0-9a-f]{64}$/;
const scrypt = promisify(crypto.scrypt);


// ------------------------------------------------------------------ server

start();

async function start() {
  try {
    await db.init();
  } catch (error) {
    console.error("Could not connect to the database:", error.message);
    process.exit(1);
  }

  const server = http.createServer(async (req, res) => {
    try {
      await handle(req, res);
    } catch (error) {
      console.error(error);
      if (!res.headersSent && !req.destroyed) {
        sendHtml(res, 500, views.message({}, "Error", "Something went wrong. Please try again."));
      }
    }
  });

  server.listen(PORT, () => {
    console.log(`Server is running: ${BASE_URL}`);
  });
}

async function handle(req, res) {
  const url = new URL(req.url, "http://localhost");
  const ctx = { req, res, url, cookies: parseCookies(req) };

  if (req.method === "GET" && url.pathname.startsWith("/static/")) {
    return serveStatic(url.pathname.slice("/static/".length), res);
  }

  // forms must be sent from this website (protection against CSRF)
  if (req.method === "POST" && !isSameOrigin(req)) {
    return sendHtml(res, 403, views.message(ctx, "Forbidden", "This form was sent from another website."));
  }

  ctx.user = await currentUser(ctx);
  ctx.message = req.method === "GET" ? takeFlash(ctx) : null;

  switch (`${req.method} ${url.pathname}`) {
    case "GET /":          return showHome(ctx);
    case "GET /register":  return showRegister(ctx);
    case "POST /register": return register(ctx);
    case "GET /login":     return showLogin(ctx);
    case "POST /login":    return login(ctx);
    case "POST /logout":   return logout(ctx);
    case "GET /profile":   return showProfile(ctx);
    case "POST /profile":  return saveProfile(ctx);
    default:
      return sendHtml(res, 404, views.message(ctx, "Not found", "This page does not exist."));
  }
}


// --------------------------------------------------------------- home page

// The website is shown only to logged in users, everybody else sees the login form
function showHome(ctx) {
  if (!ctx.user) return redirect(ctx.res, "/login");
  sendHtml(ctx.res, 200, views.home(ctx));
}


// ------------------------------------------------------------ registration

function showRegister(ctx) {
  if (ctx.user) return redirect(ctx.res, "/");
  sendHtml(ctx.res, 200, views.register(ctx, { form: {}, errors: [] }));
}

async function register(ctx) {
  if (ctx.user) return redirect(ctx.res, "/");

  const form = await readForm(ctx.req);
  const errors = [];
  const name = validate.name(form.name, errors);
  const username = validate.username(form.username, errors);
  const email = validate.email(form.email, errors);
  validate.password(form.password, form.confirm, errors);

  if (errors.length === 0) {
    if (await db.findUserByEmail(email)) errors.push("This email is already registered.");
    if (await db.findUserByUsername(username)) errors.push("This username is already taken.");
  }
  if (errors.length > 0) {
    return sendHtml(ctx.res, 400, views.register(ctx, { form: { name, username, email }, errors }));
  }

  const passwordHash = await hashPassword(form.password);
  const user = await db.createUser({ name, username, email, passwordHash });
  if (!user) {
    // somebody used the same email or username while the password was being hashed
    errors.push("This email or username is already taken.");
    return sendHtml(ctx.res, 400, views.register(ctx, { form: { name, username, email }, errors }));
  }

  // the user is logged in right after registration
  await startSession(ctx, user.id, form.remember === "1");
  flash(ctx, `Welcome, ${user.name}! Your account has been created.`);
  redirect(ctx.res, "/");
}


// ---------------------------------------------------------- login / logout

function showLogin(ctx) {
  if (ctx.user) return redirect(ctx.res, "/");
  sendHtml(ctx.res, 200, views.login(ctx, { email: "", error: null }));
}

async function login(ctx) {
  const form = await readForm(ctx.req);
  const email = String(form.email || "").trim().toLowerCase();
  const password = String(form.password || "");
  const user = await db.findUserByEmail(email);

  if (!user || !(await checkPassword(password, user.passwordHash))) {
    return sendHtml(ctx.res, 401, views.login(ctx, { email, error: "Wrong email or password." }));
  }

  if (ctx.cookies.sid) await db.deleteSession(ctx.cookies.sid);
  await startSession(ctx, user.id, form.remember === "1");
  redirect(ctx.res, "/");
}

async function logout(ctx) {
  if (ctx.cookies.sid) await db.deleteSession(ctx.cookies.sid);
  setCookie(ctx.res, "sid", "", { maxAge: 0 });
  flash(ctx, "You have logged out.");
  redirect(ctx.res, "/login");
}


// ----------------------------------------------------------------- profile

function showProfile(ctx) {
  if (!ctx.user) return requireLogin(ctx);
  const form = { name: ctx.user.name, bio: ctx.user.bio };
  sendHtml(ctx.res, 200, views.profile(ctx, { form, errors: [] }));
}

async function saveProfile(ctx) {
  if (!ctx.user) return requireLogin(ctx);

  const form = await readForm(ctx.req);
  const errors = [];
  const name = validate.name(form.name, errors);
  const bio = validate.bio(form.bio, errors);

  if (errors.length > 0) {
    return sendHtml(ctx.res, 400, views.profile(ctx, { form: { name, bio }, errors }));
  }
  await db.updateUser(ctx.user.id, { name, bio });
  flash(ctx, "Profile saved.");
  redirect(ctx.res, "/profile");
}

function requireLogin(ctx) {
  flash(ctx, "Please log in first.");
  redirect(ctx.res, "/login");
}


// ----------------------------------------------------------------- cookies

function parseCookies(req) {
  const cookies = {};
  const header = req.headers.cookie;
  if (!header) return cookies;

  for (const part of header.split(";")) {
    const index = part.indexOf("=");
    if (index === -1) continue;
    const name = part.slice(0, index).trim();
    const value = part.slice(index + 1).trim();
    try {
      cookies[name] = decodeURIComponent(value);
    } catch {
      cookies[name] = value;
    }
  }
  return cookies;
}

function setCookie(res, name, value, options = {}) {
  // HttpOnly: JavaScript on the page cannot read the cookie
  // SameSite=Lax: the browser does not send it with forms from other websites
  let cookie = `${name}=${encodeURIComponent(value)}; Path=/; HttpOnly; SameSite=Lax`;
  if (options.maxAge !== undefined) cookie += `; Max-Age=${options.maxAge}`;
  if (SECURE_COOKIES) cookie += "; Secure";

  const cookies = res.getHeader("Set-Cookie") || [];
  res.setHeader("Set-Cookie", cookies.concat(cookie));
}

// A short message that is shown once on the next page (after a redirect)
function flash(ctx, message) {
  setCookie(ctx.res, "flash", message, { maxAge: 60 });
}

function takeFlash(ctx) {
  const message = ctx.cookies.flash;
  if (message) setCookie(ctx.res, "flash", "", { maxAge: 0 });
  return message || null;
}


// ---------------------------------------------------------------- sessions

async function startSession(ctx, userId, remember) {
  const token = crypto.randomBytes(32).toString("hex");
  await db.createSession(token, userId, Date.now() + (remember ? 30 * DAY : DAY));

  // With Max-Age the browser keeps the cookie for 30 days, even after it is closed.
  // Without Max-Age the cookie is deleted when the browser is closed.
  setCookie(ctx.res, "sid", token, remember ? { maxAge: 30 * 24 * 60 * 60 } : {});
}

async function currentUser(ctx) {
  const token = ctx.cookies.sid;
  if (!token || !TOKEN_RE.test(token)) return null;
  const session = await db.findSession(token);
  return session ? db.findUserById(session.userId) : null;
}


// --------------------------------------------------------------- passwords

// The password itself is never saved, only a salted scrypt hash of it
async function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = await scrypt(password, salt, 64);
  return `${salt}:${hash.toString("hex")}`;
}

async function checkPassword(password, stored) {
  const [salt, hash] = stored.split(":");
  const attempt = await scrypt(password, salt, 64);
  return crypto.timingSafeEqual(attempt, Buffer.from(hash, "hex"));
}


// ------------------------------------------------------------------ helpers

// Reads the body of a POST form: name=Alikhan&email=...
function readForm(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;

    req.on("data", (chunk) => {
      size += chunk.length;
      if (size > MAX_BODY) {
        reject(new Error("Request body is too large"));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => {
      const body = Buffer.concat(chunks).toString("utf8");
      resolve(Object.fromEntries(new URLSearchParams(body)));
    });
    req.on("error", reject);
  });
}

function isSameOrigin(req) {
  const origin = req.headers.origin;
  if (!origin) return true; // old browsers and tools like curl do not send it
  if (origin === new URL(BASE_URL).origin) return true;
  try {
    return new URL(origin).host === req.headers.host;
  } catch {
    return false;
  }
}

function sendHtml(res, status, html) {
  res.writeHead(status, {
    "Content-Type": "text/html; charset=utf-8",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY"
  });
  res.end(html);
}

// 303 = after a POST the browser opens the new page with GET
function redirect(res, location) {
  res.writeHead(303, { Location: location });
  res.end();
}

const TYPES = {
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon"
};

function serveStatic(name, res) {
  let file;
  try {
    file = path.join(PUBLIC_DIR, decodeURIComponent(name));
  } catch {
    file = "";
  }
  const type = TYPES[path.extname(file).toLowerCase()];

  // do not allow paths like /static/../server.js
  if (!file.startsWith(PUBLIC_DIR + path.sep) || !type) {
    res.writeHead(404, { "Content-Type": "text/plain" });
    return res.end("Not found");
  }

  fs.readFile(file, (error, data) => {
    if (error) {
      res.writeHead(404, { "Content-Type": "text/plain" });
      return res.end("Not found");
    }
    res.writeHead(200, { "Content-Type": type, "Cache-Control": "public, max-age=3600" });
    res.end(data);
  });
}

// Reads settings like SMTP_HOST=... from the .env file (if it exists)
function loadEnvFile(file) {
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (match && process.env[match[1]] === undefined) {
      process.env[match[1]] = match[2].trim().replace(/^(['"])(.*)\1$/, "$2");
    }
  }
}
