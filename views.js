// HTML pages. Everything the user typed is passed through esc(),
// so it is shown as text and can never become HTML or JavaScript.

function esc(value) {
  return String(value ?? "").replace(/[&<>"']/g, (ch) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  }[ch]));
}

function errorList(errors) {
  if (!errors || errors.length === 0) return "";
  return `<div class="errors">${errors.map((e) => `<p>${esc(e)}</p>`).join("")}</div>`;
}

function layout(ctx, title, content) {
  const menu = ctx.user
    ? `<a href="/">Home</a>
    <a href="/profile">Profile</a>
    <form method="post" action="/logout" class="inline">
      <button type="submit" class="linklike">Log out</button>
    </form>`
    : `<a href="/login">Log in</a>
    <a href="/register">Register</a>`;

  const flash = ctx.message ? `<div class="flash"><p>${esc(ctx.message)}</p></div>` : "";

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${esc(title)}</title>
<link rel="icon" href="data:,">
<link rel="stylesheet" href="/static/style.css">
</head>
<body>

<div class="wrap">

  <nav class="nav">
    ${menu}
  </nav>

  ${flash}

${content}

</div>

</body>
</html>`;
}


function home(ctx) {
  return layout(ctx, "Alikhan Ibraimov", `
  <section class="hero">
    <div class="hero-text">
      <h1>Alikhan Ibraimov</h1>
      <p class="role">Information Systems student, currently working at Inditex. In my free time I like basketball, music, movies and traveling.</p>
    </div>
    <div class="hero-photo">
      <img src="/static/photo.jpg" alt="Alikhan Ibraimov on a ferry with the New York skyline in the background">
    </div>
  </section>

  <section class="about">
    <h2>About me</h2>
    <p>I grew up and live in Almaty, Kazakhstan. I'm studying Information Systems at the International IT University. I'm interested in how technology, business and data work together.</p>
    <p>Right now I also work at Inditex, which has given me some practical experience alongside my studies.</p>
    <div class="now">
      <div class="now-row">
        <div class="place">International IT University</div>
        <div class="role">Information Systems, student</div>
      </div>
      <div class="now-row">
        <div class="place">Inditex</div>
        <div class="role">currently working</div>
      </div>
    </div>
  </section>

  <section class="interests">
    <h2>Hobbies</h2>
    <div class="interest-item">
      <h3>Music</h3>
      <p>I listen to music pretty much every day, always looking for new tracks.</p>
    </div>
    <div class="interest-item">
      <h3>Basketball</h3>
      <p>I play whenever I get the chance, it's my main way to relax.</p>
    </div>
    <div class="interest-item">
      <h3>Movies</h3>
      <p>I enjoy watching films, especially after a busy week.</p>
    </div>
    <div class="interest-item">
      <h3>Traveling</h3>
      <p>I like visiting new places. The photo above was taken on a ferry near New York.</p>
    </div>
  </section>

  <section class="connect">
    <h2>Contact</h2>
    <div class="links">
      <a href="https://www.instagram.com/swxtchq/" target="_blank" rel="noopener">Instagram</a>
      <a href="https://github.com/swxtchq" target="_blank" rel="noopener">GitHub</a>
    </div>
  </section>`);
}


function register(ctx, { form, errors }) {
  return layout(ctx, "Register", `
  <section class="form-page">
    <h1>Register</h1>

    ${errorList(errors)}

    <form method="post" action="/register">
      <label for="name">Full name</label>
      <input type="text" id="name" name="name" value="${esc(form.name)}"
             required minlength="2" maxlength="50"
             pattern="[\\p{L} '\\-]{2,50}" title="Letters only, 2-50 characters">

      <label for="username">Username</label>
      <input type="text" id="username" name="username" value="${esc(form.username)}"
             required minlength="3" maxlength="20"
             pattern="[A-Za-z0-9_]{3,20}" title="3-20 characters: English letters, digits, underscore">

      <label for="email">Email</label>
      <input type="email" id="email" name="email" value="${esc(form.email)}"
             required maxlength="254">

      <label for="password">Password</label>
      <input type="password" id="password" name="password"
             required minlength="8" maxlength="128"
             pattern="(?=.*\\p{L})(?=.*[0-9]).{8,128}"
             title="At least 8 characters, with a letter and a digit">
      <div class="hint">At least 8 characters, with a letter and a digit.</div>

      <label for="confirm">Repeat password</label>
      <input type="password" id="confirm" name="confirm" required>

      <label class="check">
        <input type="checkbox" name="remember" value="1" checked>
        Remember me for 30 days
      </label>

      <button type="submit" class="primary">Create account</button>
    </form>

    <p class="hint">Already have an account? <a href="/login">Log in</a></p>
  </section>

  <script>
    // check in the browser that both passwords are the same
    var password = document.getElementById("password");
    var confirmField = document.getElementById("confirm");

    function checkMatch() {
      if (confirmField.value !== password.value) {
        confirmField.setCustomValidity("Passwords do not match");
      } else {
        confirmField.setCustomValidity("");
      }
    }

    password.addEventListener("input", checkMatch);
    confirmField.addEventListener("input", checkMatch);
  </script>`);
}


function login(ctx, { email, error }) {
  return layout(ctx, "Log in", `
  <section class="form-page">
    <h1>Log in</h1>
    <p class="hint">Log in or create an account to see the website.</p>

    ${errorList(error ? [error] : [])}

    <form method="post" action="/login">
      <label for="email">Email</label>
      <input type="email" id="email" name="email" value="${esc(email)}" required>

      <label for="password">Password</label>
      <input type="password" id="password" name="password" required>

      <label class="check">
        <input type="checkbox" name="remember" value="1" checked>
        Remember me for 30 days
      </label>

      <button type="submit" class="primary">Log in</button>
    </form>

    <p class="hint">No account yet? <a href="/register">Register</a></p>
  </section>`);
}


function profile(ctx, { form, errors }) {
  const user = ctx.user;
  return layout(ctx, "Profile", `
  <section class="form-page">
    <h1>Your profile</h1>

    <div class="profile-info">
      <div><span>Username</span><span>${esc(user.username)}</span></div>
      <div><span>Email</span><span>${esc(user.email)}</span></div>
      <div><span>Registered</span><span>${esc(user.createdAt)}</span></div>
    </div>

    ${errorList(errors)}

    <form method="post" action="/profile">
      <label for="name">Full name</label>
      <input type="text" id="name" name="name" value="${esc(form.name)}"
             required minlength="2" maxlength="50"
             pattern="[\\p{L} '\\-]{2,50}" title="Letters only, 2-50 characters">

      <label for="bio">About me</label>
      <textarea id="bio" name="bio" maxlength="300">${esc(form.bio)}</textarea>
      <div class="hint">Up to 300 characters.</div>

      <button type="submit" class="primary">Save</button>
    </form>
  </section>`);
}


function message(ctx, title, text) {
  return layout(ctx, title, `
  <section class="form-page">
    <h1>${esc(title)}</h1>
    <p>${esc(text)}</p>
    <p><a href="/">Go to the website</a></p>
  </section>`);
}

module.exports = { home, register, login, profile, message };
