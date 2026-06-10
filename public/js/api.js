// ── api.js ────────────────────────────────────────────────────
// Shared API fetch wrapper used by every page.
// Place this file at:  public/js/api.js
// Load it BEFORE auth.js in every HTML page:
//   <script src="../js/api.js"></script>
//   <script src="../js/auth.js"></script>

/**
 * api(path, options)
 *
 * Thin wrapper around fetch() that:
 *   - Prepends /api to every path
 *   - Attaches the Bearer token from localStorage automatically
 *   - Sets Content-Type: application/json by default
 *   - On 401 → clears storage and redirects to login.html
 *   - Returns the parsed JSON response object
 *
 * Usage:
 *   const res = await api('/orders');                          // GET
 *   const res = await api('/orders', { method: 'POST', body: JSON.stringify(payload) });
 *
 *   if (res.success) { ... }
 */
async function api(path, opts = {}) {
  const token = localStorage.getItem('token');

  const response = await fetch('/api' + path, {
    ...opts,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { 'Authorization': 'Bearer ' + token } : {}),
      ...(opts.headers || {}),
    },
  });

  // Token expired or invalid → kick to login
  if (response.status === 401) {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    sessionStorage.setItem('redirectAfterLogin', window.location.href);
    window.location.href = 'login.html';
    return null;
  }

  return response.json();
}