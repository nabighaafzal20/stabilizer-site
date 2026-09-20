/*
 * Dashboard gate — the ONLY thing added to the existing dashboard (one <script> tag).
 * Redirects to the landing page's sign-in section when there is no valid session.
 *
 * Development: set ENFORCE = false to open dashboard/index.html directly with no sign-in.
 * Keep SESSION_KEY identical to auth/auth-config.js (auth.sessionKey).
 */
(function () {
  'use strict';
  var ENFORCE = true;
  var SESSION_KEY = 'stabilizer.session';
  if (!ENFORCE) return;
  var ok = false;
  try {
    var v = JSON.parse(sessionStorage.getItem(SESSION_KEY) || 'null');
    ok = !!(v && v.token && v.expiresAt && v.expiresAt > Date.now());
  } catch (e) { ok = false; }
  if (!ok) {
    document.documentElement.style.visibility = 'hidden';
    location.replace('../index.html#sign-in');
  }
})();
