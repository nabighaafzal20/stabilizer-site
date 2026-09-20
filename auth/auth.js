/*
 * Minimal, swappable authentication layer.
 * Exposes window.StabilizerAuth = { signIn, signOut, getSession, isAuthenticated, config }.
 *
 * To connect a real backend: set auth.mode = 'api' in auth-config.js (or replace
 * providers.api below). Passwords are only ever held in memory for the duration of the
 * call — they are never written to storage, logged or embedded in source.
 */
(function (w) {
  'use strict';
  var base = {
    mode: 'demo', apiBase: '/api/auth', sessionKey: 'stabilizer.session', ttlMinutes: 480,
    dashboardUrl: 'dashboard/index.html', minIdentityLength: 3, minPasswordLength: 6,
    demoLatencyMs: 800, showDemoNotice: true, supabaseUrl: '', supabaseAnonKey: ''
  };
  var cfg = Object.assign({}, base, (w.STABILIZER_CONFIG || {}).auth);

  function AuthError(code, message) {
    var e = new Error(message); e.name = 'AuthError'; e.code = code; return e;
  }
  function store() { try { return w.sessionStorage; } catch (e) { return null; } }
  function delay(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }

  function validate(c) {
    var id = (c && c.identity || '').trim(), pw = (c && c.password) || '';
    if (id.length < cfg.minIdentityLength) throw AuthError('INVALID_INPUT', 'Enter your email or username.');
    if (pw.length < cfg.minPasswordLength) throw AuthError('INVALID_INPUT', 'Password must be at least ' + cfg.minPasswordLength + ' characters.');
    return { identity: id, password: pw };
  }

  /* Supabase client (created lazily). Session tokens live in sessionStorage. */
  var _sb = null;
  function getClient() {
    if (!cfg.supabaseUrl || !cfg.supabaseAnonKey || /XXXX|YOUR_/.test(cfg.supabaseUrl + cfg.supabaseAnonKey))
      throw AuthError('CONFIG', 'Supabase is not configured. Add your URL and anon key in auth/auth-config.js.');
    if (!w.supabase || !w.supabase.createClient)
      throw AuthError('NETWORK', 'Could not load the Supabase library. Check your internet connection.');
    if (!_sb) _sb = w.supabase.createClient(cfg.supabaseUrl, cfg.supabaseAnonKey,
      { auth: { storage: w.sessionStorage, persistSession: true, autoRefreshToken: true } });
    return _sb;
  }

  var providers = {
    /* Front-end only. Accepts any well-formed credentials. */
    demo: function (c) {
      return delay(cfg.demoLatencyMs).then(function () {
        var rnd = new Uint8Array(16);
        (w.crypto || {}).getRandomValues ? w.crypto.getRandomValues(rnd) : rnd.forEach(function (_, i) { rnd[i] = Math.random() * 256; });
        var token = 'demo.' + Array.prototype.map.call(rnd, function (b) { return ('0' + b.toString(16)).slice(-2); }).join('');
        var name = c.identity.split('@')[0];
        return { token: token, user: { name: name }, expiresIn: cfg.ttlMinutes * 60 };
      });
    },
    /* Supabase Auth (email + password). Sign-ups are disabled in the Supabase dashboard, so only
       the single admin user created there can sign in. */
    supabase: function (c) {
      var sb; try { sb = getClient(); } catch (e) { return Promise.reject(e); }
      return sb.auth.signInWithPassword({ email: c.identity, password: c.password }).then(function (res) {
        if (res.error) {
          if (res.error.status >= 500 || /fetch|network/i.test(res.error.message || '')) throw AuthError('NETWORK', 'Cannot reach the authentication service.');
          throw AuthError('INVALID_CREDENTIALS', 'Incorrect email or password.');
        }
        return { token: res.data.session.access_token, user: { name: res.data.user.email }, expiresIn: cfg.ttlMinutes * 60 };
      }, function () { throw AuthError('NETWORK', 'Cannot reach the authentication service.'); });
    },
    /* Real backend contract: POST {identity,password} -> 200 {token,user,expiresIn} | 401 */
    api: function (c) {
      return fetch(cfg.apiBase.replace(/\/$/, '') + '/sign-in', {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
        body: JSON.stringify({ identity: c.identity, password: c.password })
      }).then(function (res) {
        if (res.status === 401 || res.status === 403) throw AuthError('INVALID_CREDENTIALS', 'Incorrect email/username or password.');
        if (!res.ok) throw AuthError('SERVER', 'Sign-in is unavailable right now. Please try again.');
        return res.json();
      }, function () { throw AuthError('NETWORK', 'Cannot reach the authentication service.'); });
    }
  };

  function persist(r) {
    var s = store(); var now = Date.now();
    var session = {
      token: String(r.token || ''), user: { name: String((r.user && r.user.name) || 'operator') },
      issuedAt: now, expiresAt: now + (Number(r.expiresIn) || cfg.ttlMinutes * 60) * 1000, mode: cfg.mode
    };
    if (s) s.setItem(cfg.sessionKey, JSON.stringify(session));
    return session;
  }

  var Auth = {
    config: cfg,
    signIn: function (credentials) {
      var c; try { c = validate(credentials); } catch (e) { return Promise.reject(e); }
      var p = providers[cfg.mode] || providers.demo;
      return p(c).then(persist);
    },
    signOut: function () {
      var s = store(); if (s) s.removeItem(cfg.sessionKey);
      if (cfg.mode === 'supabase') { try { return getClient().auth.signOut().catch(function () {}); } catch (e) {} }
      return Promise.resolve();
    },
    getSession: function () {
      var s = store(); if (!s) return null;
      try {
        var v = JSON.parse(s.getItem(cfg.sessionKey) || 'null');
        if (!v || !v.token || !v.expiresAt || v.expiresAt < Date.now()) { s.removeItem(cfg.sessionKey); return null; }
        return v;
      } catch (e) { return null; }
    },
    isAuthenticated: function () { return !!Auth.getSession(); }
  };
  w.StabilizerAuth = Auth;
})(window);
