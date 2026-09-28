// Server-side validation. The browser also checks the forms (required, pattern ...),
// but those checks can be skipped, so the server checks everything again.
// Every function returns the cleaned value and adds error messages to the list.

const NAME_RE = /^\p{L}+(?:[ '\-]\p{L}+)*$/u;  // letters, words split by space ' or -
const USERNAME_RE = /^[A-Za-z0-9_]{3,20}$/;
const EMAIL_RE = /^[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}$/;

function name(value, errors) {
  value = String(value || "").trim().replace(/\s+/g, " ");
  if (value.length < 2 || value.length > 50 || !NAME_RE.test(value)) {
    errors.push("Name must be 2-50 letters (spaces, hyphens and apostrophes are allowed).");
  }
  return value;
}

function username(value, errors) {
  value = String(value || "").trim();
  if (!USERNAME_RE.test(value)) {
    errors.push("Username must be 3-20 characters: English letters, digits and underscore only.");
  }
  return value;
}

function email(value, errors) {
  value = String(value || "").trim().toLowerCase();
  if (value.length > 254 || !EMAIL_RE.test(value)) {
    errors.push("Please enter a valid email address.");
  }
  return value;
}

function password(value, confirm, errors) {
  value = String(value || "");
  if (value.length < 8 || value.length > 128) {
    errors.push("Password must be 8-128 characters long.");
  } else if (!/\p{L}/u.test(value) || !/[0-9]/.test(value)) {
    errors.push("Password must contain at least one letter and one digit.");
  }
  if (value !== String(confirm || "")) {
    errors.push("Passwords do not match.");
  }
}

function bio(value, errors) {
  value = String(value || "").trim();
  if (value.length > 300) {
    errors.push("About me must be at most 300 characters.");
  }
  return value;
}

module.exports = { name, username, email, password, bio };
