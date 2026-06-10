// ── auth.js ───────────────────────────────────────────────────
// Handles login form submission, token storage, and auth guards.
// Place this file at:  public/js/auth.js
//
// On protected pages (dashboard, orders, etc.):
//   Load AFTER api.js — auth guard runs on every page load.
//   <script src="../js/api.js"></script>
//   <script src="../js/auth.js"></script>
//
// On login.html:
//   Load the same two files and call initLoginPage() once the DOM is ready.
//   The login form must have:
//     - id="loginForm"
//     - id="emailInput"   (or name="email")
//     - id="passwordInput" (or name="password")
//     - id="loginError"   (a <p> or <div> to show error messages)
//     - id="loginBtn"     (the submit button)

// ── Auth guard (runs on every protected page) ─────────────────
// If this script is loaded on a page that is NOT login.html and
// there is no token in localStorage, redirect to login.html.
(function guardProtectedPage() {
  const isLoginPage = window.location.pathname.endsWith('login.html');
  if (isLoginPage) return; // login page handles itself

  const token = localStorage.getItem('token');
  const user  = JSON.parse(localStorage.getItem('user') || 'null');

  if (!token || !user) {
    // Save where the user was trying to go so we can send them back after login
    sessionStorage.setItem('redirectAfterLogin', window.location.href);
    window.location.href = 'login.html';
  }
})();

// ── Login page handler ────────────────────────────────────────
// Call this function from login.html once the DOM is ready.
function initLoginPage() {
  const form     = document.getElementById('loginForm');
  const errorEl  = document.getElementById('loginError');
  const loginBtn = document.getElementById('loginBtn');

  if (!form) return; // not on login page

  // If user is already logged in, skip the login page entirely
  const existingToken = localStorage.getItem('token');
  if (existingToken) {
    redirectAfterLogin();
    return;
  }

  form.addEventListener('submit', async (e) => {
    e.preventDefault();

    const email    = document.getElementById('emailInput').value.trim();
    const password = document.getElementById('passwordInput').value;

    // Basic client-side check
    if (!email || !password) {
      showError('Please enter your email and password.');
      return;
    }

    // Disable button while request is in flight
    loginBtn.disabled = true;
    loginBtn.textContent = 'Signing in…';
    if (errorEl) errorEl.style.display = 'none';

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });

      const data = await res.json();

      if (res.ok && data.success) {
        // Store credentials
        localStorage.setItem('token', data.token);
        localStorage.setItem('user',  JSON.stringify(data.user));

        // Go back to where the user originally wanted to go
        redirectAfterLogin();
      } else {
        showError(data.message || 'Invalid email or password.');
      }
    } catch (err) {
      showError('Could not connect to the server. Please try again.');
    } finally {
      loginBtn.disabled = false;
      loginBtn.textContent = 'Sign in';
    }
  });

  function showError(msg) {
    if (!errorEl) return;
    errorEl.textContent = msg;
    errorEl.style.display = 'block';
  }
}

// ── Redirect helper ───────────────────────────────────────────
// After a successful login, send the user to the page they came
// from, or fall back to dashboard.html.
function redirectAfterLogin() {
  const destination = sessionStorage.getItem('redirectAfterLogin') || 'dashboard.html';
  sessionStorage.removeItem('redirectAfterLogin');
  window.location.href = destination;
}

// ── Logout helper ─────────────────────────────────────────────
// Attach this to any logout button:
//   document.getElementById('logoutBtn').addEventListener('click', logout);
function logout() {
  localStorage.removeItem('token');
  localStorage.removeItem('user');
  window.location.href = 'login.html';
}