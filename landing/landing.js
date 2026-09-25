/*
 * Landing controller
 *   scroll position → progress q → frame index (single rAF loop, no autoplay)
 *   hero / canvas transform driven by q (opacity + scale + blur only — the converter
 *   stays centred throughout, it never shifts left/right)
 *   navigation, sign-in form, page-leave transition
 */
(function (w, d) {
  'use strict';

  var root = d.documentElement;
  var CFG = (w.STABILIZER_CONFIG || {}).landing || {};
  var Auth = w.StabilizerAuth;
  var $ = function (s, c) { return (c || d).querySelector(s); };
  var $$ = function (s, c) { return Array.prototype.slice.call((c || d).querySelectorAll(s)); };
  var clamp = function (v, a, b) { return Math.max(a, Math.min(b, v)); };
  var smooth = function (a, b, x) { var t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };

  var reduceMQ = w.matchMedia('(prefers-reduced-motion: reduce)');
  var mobileMQ = w.matchMedia('(max-width:760px)');
  var reduce = reduceMQ.matches;

  /* ─────────── timeline (fractions of the pinned scroll length) ─────────── */
  var FRAME_END = 0.86;          // frames finish here, then the exploded view holds briefly
  var HERO_OUT = [0.012, 0.066];
  var DIM = [0.93, 1.05];        // converter recedes into the background as sign-in arrives

  var nav = $('#nav'), navProgress = $('#navProgress'), navCta = $('#navCta');
  var loader = $('#loader'), loaderBar = $('#loaderBar'), loaderPct = $('#loaderPct');
  var story = $('#story'), stage = $('#stage'), glow = $('#stageGlow'), canvas = $('#seq');
  var hero = $('#hero'), cue = $('#cue'), hud = $('#hud'), hudFrame = $('#hudFrame');
  var signin = $('#sign-in');

  /* ─────────── state ─────────── */
  var vw = 0, vh = 0, Y = 1, isMobile = mobileMQ.matches;
  var targetQ = 0, curQ = 0, raf = 0, lastT = 0, lastIdx = -2;
  var seq = null, manifest = w.STABILIZER_FRAMES;
  var scrubbing = false;

  /* ─────────── layout ─────────── */
  function measure() {
    vw = w.innerWidth; vh = w.innerHeight;
    isMobile = mobileMQ.matches;
    if (!scrubbing) return;
    Y = Math.max(1, story.offsetHeight - vh);
  }
  function signInY() { return signin.getBoundingClientRect().top + w.pageYOffset; }
  function anchorY(id) {
    if (id === 'sign-in') return signInY();
    if (id === 'top') return 0;
    return null;
  }

  /* ─────────── render (called from rAF only) ─────────── */
  function render(q) {
    var f = clamp(q / FRAME_END, 0, 1);
    var idx = Math.round(f * (seq.count - 1));
    if (idx !== lastIdx) {
      var shown = seq.draw(idx);
      lastIdx = idx;
      hudFrame.textContent = ('00' + (idx + 1)).slice(-3);
    }

    // hero
    var hp = smooth(HERO_OUT[0], HERO_OUT[1], q);
    hero.style.opacity = (1 - hp).toFixed(3);
    hero.style.visibility = hp >= 0.995 ? 'hidden' : 'visible';
    hero.style.transform = 'translate3d(0,' + (-hp * 36).toFixed(1) + 'px,0)';
    hero.style.filter = hp > 0.01 ? 'blur(' + (hp * 8).toFixed(1) + 'px)' : 'none';

    cue.style.opacity = (1 - smooth(0.002, 0.03, q)).toFixed(3);

    // converter: stays dead-centre the whole time — only scale/opacity change, never x/y drift.
    // A gentle push-in while it disassembles, then it recedes into the background as sign-in arrives.
    var dim = smooth(DIM[0], DIM[1], q);
    var s = (1 + 0.05 * smooth(0, 0.6, q)) - 0.13 * dim;
    canvas.style.transform = 'translate3d(-50%,-50%,0) scale(' + s.toFixed(4) + ')';
    canvas.style.opacity = (1 - 0.8 * dim).toFixed(3);
    glow.style.opacity = (0.95 - 0.55 * dim).toFixed(3);

    // chrome
    navProgress.style.transform = 'scaleX(' + clamp(q, 0, 1).toFixed(4) + ')';
    hud.classList.toggle('hide', q < 0.004 || q > 0.9);
  }

  function tick(t) {
    var dt = Math.min(64, t - (lastT || t)); lastT = t;
    var k = 1 - Math.pow(1 - 0.13, dt / 16.667);         // frame-rate independent easing — the smoothing rate
    curQ += (targetQ - curQ) * k;
    if (Math.abs(targetQ - curQ) < 0.00006) curQ = targetQ;
    render(curQ);
    if (curQ !== targetQ) raf = w.requestAnimationFrame(tick); else { raf = 0; lastT = 0; }
  }
  function kick() { if (!raf) raf = w.requestAnimationFrame(tick); }

  function onScroll() {
    nav.classList.toggle('scrolled', w.pageYOffset > 24);
    if (!scrubbing) return;
    targetQ = w.pageYOffset / Y;
    kick();
  }

  /* ─────────── eased programmatic scroll (nav links) ─────────── */
  var scrollAnim = 0;
  function cancelScrollAnim() { if (scrollAnim) { w.cancelAnimationFrame(scrollAnim); scrollAnim = 0; } }
  function scrollToY(y, instant) {
    cancelScrollAnim();
    y = Math.max(0, Math.round(y));
    if (instant || reduce) { w.scrollTo(0, y); return; }
    var y0 = w.pageYOffset, dist = y - y0;
    if (Math.abs(dist) < 4) return;
    var dur = clamp(Math.abs(dist) / vh * 170, 650, 2400), t0 = 0;
    function step(t) {
      if (!t0) t0 = t;
      var p = clamp((t - t0) / dur, 0, 1);
      var e = p < .5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2;
      w.scrollTo(0, y0 + dist * e);
      if (p < 1) scrollAnim = w.requestAnimationFrame(step); else scrollAnim = 0;
    }
    scrollAnim = w.requestAnimationFrame(step);
  }
  ['wheel', 'touchstart', 'keydown', 'mousedown'].forEach(function (ev) { w.addEventListener(ev, cancelScrollAnim, { passive: true }); });

  function bindNavLinks() {
    $$('a[data-nav], a.brand').forEach(function (a) {
      a.addEventListener('click', function (e) {
        var id = (a.dataset.nav || (a.getAttribute('href') || '').replace('#', ''));
        if (a.id === 'navCta' && a.dataset.signed === '1') return;          // real link to the dashboard
        var y = anchorY(id);
        if (y == null) return;
        e.preventDefault();
        scrollToY(y);
        if (history.replaceState) history.replaceState(null, '', '#' + id);
      });
    });
  }

  /* ─────────── loading ─────────── */
  var loaderStart = performance.now(), loaderDone = false;
  function onProgress(s) {
    if (loaderDone) return;
    var need = Math.min(s.coarseTotal, scrubbing ? 14 : 1);
    var p = clamp(s.coarseReady / need, 0, 1);
    loaderBar.style.transform = 'scaleX(' + p.toFixed(3) + ')';
    loaderPct.textContent = Math.round(p * 100) + '%';
    if (p >= 1) finishLoading();
  }
  function finishLoading() {
    if (loaderDone) return;
    loaderDone = true;
    var wait = Math.max(0, 450 - (performance.now() - loaderStart));
    setTimeout(function () {
      if (scrubbing) { lastIdx = -2; curQ = targetQ; render(curQ); }
      loader.classList.add('done');
      root.classList.add('ready');
      setTimeout(function () { loader.style.display = 'none'; }, 900);
    }, wait);
  }

  /* ─────────── static (reduced-motion / fallback) ─────────── */
  function setupStatic() {
    var idx = clamp((CFG.staticFrame || 200) - 1, 0, manifest.frames.length - 1);
    seq = new w.FrameSequence(canvas, manifest, { useMatte: CFG.useMatte !== false, only: idx, bitmaps: false, startIndex: idx, onProgress: function (s) {
      if (s.state[idx] === 2 && s.shown !== idx) s.draw(idx);
      onProgress(s);
    } });
    seq.start();
    if ('IntersectionObserver' in w) {
      var io = new IntersectionObserver(function (es) {
        es.forEach(function (en) { if (en.isIntersecting) { en.target.classList.add('in'); io.unobserve(en.target); } });
      }, { threshold: 0.12 });
      $$('.reveal').forEach(function (el) { io.observe(el); });
    } else { $$('.reveal').forEach(function (el) { el.classList.add('in'); }); }
  }

  /* ─────────── scrubbing setup ─────────── */
  function setupScrub() {
    scrubbing = true;
    root.classList.add('scrub');
    if (CFG.storyViewports) story.style.setProperty('--story-h', (CFG.storyViewports * (mobileMQ.matches ? 0.9 : 1)) * 100 + 'svh');
    measure();
    targetQ = curQ = w.pageYOffset / Y;
    var startIdx = Math.round(clamp(targetQ / FRAME_END, 0, 1) * (manifest.frames.length - 1));
    var small = mobileMQ.matches || (navigator.deviceMemory && navigator.deviceMemory <= 4);
    seq = new w.FrameSequence(canvas, manifest, {
      useMatte: CFG.useMatte !== false, startIndex: startIdx,
      ahead: small ? 8 : 14, behind: small ? 3 : 6, maxInflight: small ? 4 : 6, onProgress: onProgress
    });
    seq.start();
    w.addEventListener('scroll', onScroll, { passive: true });
  }

  /* ─────────── sign-in ─────────── */
  var form = $('#signInForm'), identity = $('#identity'), password = $('#password'), formMsg = $('#formMsg');
  var submitBtn = $('#submitBtn'), card = $('#authCard'), leave = $('#leave');
  var signedPanel = $('#signedPanel'), signedName = $('#signedName'), signOutBtn = $('#signOutBtn'), openDash = $('#openDash');
  var pwToggle = $('#pwToggle'), demoNote = $('#demoNote');
  var wait = function (ms) { return new Promise(function (r) { setTimeout(r, ms); }); };
  var dashUrl = (Auth && Auth.config.dashboardUrl) || 'dashboard/index.html';

  function paintSession() {
    var s = Auth && Auth.getSession();
    form.hidden = !!s; signedPanel.hidden = !s;
    card.classList.remove('granted');
    if (s) { signedName.textContent = s.user.name; }
    openDash.setAttribute('href', dashUrl);
    navCta.textContent = s ? 'Dashboard' : 'Sign In';
    navCta.setAttribute('href', s ? dashUrl : '#sign-in');
    if (s) navCta.dataset.signed = '1'; else delete navCta.dataset.signed;
    demoNote.hidden = !(Auth && Auth.config.mode === 'demo' && Auth.config.showDemoNotice && !s);
  }
  function setMsg(text, ok) { formMsg.textContent = text || ''; formMsg.classList.toggle('ok', !!ok); }
  function setBusy(b) { submitBtn.disabled = b; submitBtn.classList.toggle('loading', b); identity.disabled = b; password.disabled = b; }

  pwToggle.addEventListener('click', function () {
    var show = password.type === 'password';
    password.type = show ? 'text' : 'password';
    pwToggle.setAttribute('aria-pressed', String(show));
    pwToggle.setAttribute('aria-label', show ? 'Hide password' : 'Show password');
  });
  [identity, password].forEach(function (i) { i.addEventListener('input', function () { i.closest('.field').classList.remove('invalid'); setMsg(''); }); });

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    if (!Auth) return;
    setMsg('');
    var cred = { identity: identity.value, password: password.value };
    setBusy(true);
    Auth.signIn(cred).then(function (session) {
      password.value = '';                                  // never keep the password around
      setMsg('Access granted', true);
      card.classList.add('granted');
      return wait(700).then(function () { leave.classList.add('on'); return wait(720); }).then(function () { w.location.href = dashUrl; });
    }).catch(function (err) {
      setBusy(false);
      setMsg(err && err.message ? err.message : 'Sign-in failed. Please try again.');
      if (err && (err.code === 'INVALID_INPUT')) {
        var badId = cred.identity.trim().length < Auth.config.minIdentityLength;
        (badId ? identity : password).closest('.field').classList.add('invalid');
        (badId ? identity : password).focus();
      } else { identity.closest('.field').classList.add('invalid'); password.closest('.field').classList.add('invalid'); }
      card.classList.remove('shake'); void card.offsetWidth; card.classList.add('shake');
    });
  });
  signOutBtn.addEventListener('click', function () { Auth.signOut().then(function () { paintSession(); identity.focus({ preventScroll: true }); }); });

  // coming back via the browser's back button (bfcache): reset transient UI
  w.addEventListener('pageshow', function (e) {
    if (e.persisted) { leave.classList.remove('on'); setBusy(false); paintSession(); }
  });

  /* ─────────── boot ─────────── */
  function boot() {
    bindNavLinks();
    paintSession();
    onScrollNav();

    if (!manifest || !manifest.frames || !manifest.frames.length) { loader.classList.add('done'); return; }
    if (reduce) { root.classList.add('static'); measure(); setupStatic(); }
    else {
      setupScrub();
      var bolts = w.Bolts && new w.Bolts($('#bgBolts')); if (bolts) bolts.start();
    }
    if (!('requestAnimationFrame' in w)) finishLoading();

    // honour #hash on load (e.g. redirected from the dashboard guard to #sign-in)
    var id = (location.hash || '').replace('#', '');
    if (id && anchorY(id) != null) { w.scrollTo(0, Math.round(anchorY(id))); if (scrubbing) { targetQ = curQ = w.pageYOffset / Y; } }
    onScroll();
    if (scrubbing) { lastIdx = -2; }
  }
  function onScrollNav() { nav.classList.toggle('scrolled', w.pageYOffset > 24); }

  var rz = 0;
  w.addEventListener('resize', function () {
    var pw = vw, ph = vh;
    clearTimeout(rz);
    rz = setTimeout(function () {
      // ignore tiny vertical-only changes (mobile URL bar) so progress does not jump
      if (mobileMQ.matches && Math.abs(w.innerWidth - pw) < 2 && Math.abs(w.innerHeight - ph) < 160) return;
      var ratio = scrubbing ? w.pageYOffset / Y : 0;
      measure();
      if (scrubbing) { w.scrollTo(0, ratio * Y); targetQ = curQ = w.pageYOffset / Y; lastIdx = -2; kick(); }
    }, 120);
  });
  reduceMQ.addEventListener && reduceMQ.addEventListener('change', function () { location.reload(); });

  if (history.scrollRestoration) history.scrollRestoration = 'auto';
  boot();
})(window, document);
