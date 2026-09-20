/*
 * FrameSequence — draws one frame of a pre-rendered image sequence onto a <canvas>.
 *
 *  • Frames are sorted numerically (frame-2 before frame-19) from the manifest.
 *  • Preloading is prioritised: a coarse pass across the whole range first (so there is
 *    always a close frame to show), then whatever is nearest to the current scroll position.
 *  • Only ONE frame is ever visible: the canvas. No <img> elements are in the DOM.
 *  • If the exact frame is not decoded yet, the nearest ready frame is shown (no flicker,
 *    no blank canvas, no visible loading).
 *  • The original JPG is drawn untouched; the optional matte (see tools/build_mattes.py)
 *    only supplies transparency, via `destination-in`.
 *  • A small window of pre-composited ImageBitmaps around the playhead keeps the per-scroll
 *    cost to a single drawImage().
 */
(function (w) {
  'use strict';

  function natural(a, b) { return a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }); }

  function FrameSequence(canvas, manifest, opts) {
    opts = opts || {};
    var self = this;
    var pairs = manifest.frames.map(function (f, i) { return { f: f, m: (manifest.mattes || [])[i] || null }; });
    pairs.sort(function (a, b) { return natural(a.f, b.f); });          // defensive numeric sort
    this.frameUrls = pairs.map(function (p) { return manifest.frameDir + p.f; });
    this.matteUrls = opts.useMatte !== false && pairs.every(function (p) { return p.m; })
      ? pairs.map(function (p) { return manifest.matteDir + p.m; }) : null;
    this.count = this.frameUrls.length;

    this.canvas = canvas;
    this.ctx = canvas.getContext('2d', { alpha: true });
    this.W = opts.width || 1280; this.H = opts.height || 720;
    canvas.width = this.W; canvas.height = this.H;

    this.state = new Uint8Array(this.count);   // 0 idle · 1 loading · 2 ready · 3 failed
    this.imgs = new Array(this.count);
    this.mats = new Array(this.count);
    this.bitmaps = new Map();
    this.pendingBitmap = new Set();
    this.readyCount = 0;
    this.coarseTotal = 0; this.coarseReady = 0;
    this.shown = -1;
    this.cursor = 0; this.dir = 1;
    this.maxInflight = opts.maxInflight || 6;
    this.inflight = 0;
    this.ahead = opts.ahead != null ? opts.ahead : 14;
    this.behind = opts.behind != null ? opts.behind : 6;
    this.onProgress = opts.onProgress || function () {};
    this.canBitmap = typeof w.createImageBitmap === 'function' && opts.bitmaps !== false;
    this.scratch = document.createElement('canvas');
    this.scratch.width = this.W; this.scratch.height = this.H;
    this.sctx = this.scratch.getContext('2d');
    this.warming = false;
    this.destroyed = false;

    // coarse pass: every 8th frame + the last one, nearest to the starting index first
    var start = opts.startIndex || 0, coarse = [];
    for (var i = 0; i < this.count; i += 8) coarse.push(i);
    if (coarse[coarse.length - 1] !== this.count - 1) coarse.push(this.count - 1);
    coarse.sort(function (a, b) { return Math.abs(a - start) - Math.abs(b - start); });
    this.coarse = coarse; this.coarseTotal = coarse.length;
    this.coarseSet = new Set(coarse);
    this.cursor = start;
    // opts.only: load a single frame and nothing else (reduced-motion / static mode)
    if (opts.only != null) {
      var only = opts.only;
      this.coarse = [only]; this.coarseTotal = 1; this.coarseSet = new Set([only]);
      this._next = function () { return this.state[only] === 0 ? only : -1; };
    }
  }

  FrameSequence.prototype._decodeImage = function (src) {
    return new Promise(function (resolve, reject) {
      var im = new Image();
      im.decoding = 'async';
      im.src = src;
      if (im.decode) { im.decode().then(function () { resolve(im); }, function () {
        // decode() can reject for cached/edge cases; fall back to onload
        if (im.complete && im.naturalWidth) resolve(im); else { im.onload = function () { resolve(im); }; im.onerror = reject; }
      }); }
      else { im.onload = function () { resolve(im); }; im.onerror = reject; }
    });
  };

  FrameSequence.prototype._next = function () {
    var i, c = this.coarse;
    for (i = 0; i < c.length; i++) if (this.state[c[i]] === 0) return c[i];
    var best = -1, bd = 1e9;
    for (i = 0; i < this.count; i++) {
      if (this.state[i] !== 0) continue;
      var d = i - this.cursor;
      d = (d >= 0) === (this.dir >= 0) ? Math.abs(d) : Math.abs(d) * 1.8;   // favour the scroll direction
      if (d < bd) { bd = d; best = i; }
    }
    return best;
  };

  FrameSequence.prototype.start = function () { this._pump(); };

  FrameSequence.prototype._pump = function () {
    if (this.destroyed) return;
    while (this.inflight < this.maxInflight) {
      var i = this._next();
      if (i < 0) break;
      this._load(i);
    }
  };

  FrameSequence.prototype._load = function (i, attempt) {
    var self = this;
    attempt = attempt || 0;
    this.state[i] = 1; this.inflight++;
    var jobs = [this._decodeImage(this.frameUrls[i])];
    if (this.matteUrls) jobs.push(this._decodeImage(this.matteUrls[i]));
    Promise.all(jobs).then(function (r) {
      if (self.destroyed) return;
      self.imgs[i] = r[0]; self.mats[i] = r[1] || null;
      self.state[i] = 2; self.readyCount++;
      if (self.coarseSet.has(i)) self.coarseReady++;
      self.inflight--;
      self.onProgress(self);
      // if the playhead is waiting on this exact frame, show it right away
      if (self.wanted != null && self.shown !== self.wanted) self.draw(self.wanted);
      self._warm();
      self._pump();
    }, function () {
      self.inflight--;
      if (attempt < 2) { self.state[i] = 0; setTimeout(function () { self._retry(i, attempt + 1); }, 600 * (attempt + 1)); }
      else self.state[i] = 3;
      self._pump();
    });
  };
  FrameSequence.prototype._retry = function (i, attempt) {
    if (this.destroyed || this.state[i] !== 0) return;
    if (this.inflight < this.maxInflight) this._load(i, attempt); else { var s = this; setTimeout(function () { s._retry(i, attempt); }, 300); }
  };

  FrameSequence.prototype._nearestReady = function (i) {
    if (this.state[i] === 2) return i;
    for (var d = 1; d < this.count; d++) {
      var a = i - d, b = i + d;
      // prefer a frame behind the playhead in scroll direction to avoid "looking ahead" pops
      var first = this.dir >= 0 ? a : b, second = this.dir >= 0 ? b : a;
      if (first >= 0 && first < this.count && this.state[first] === 2) return first;
      if (second >= 0 && second < this.count && this.state[second] === 2) return second;
    }
    return -1;
  };

  FrameSequence.prototype._compose = function (g, idx) {
    var img = this.imgs[idx], mat = this.mats[idx];
    g.globalCompositeOperation = 'source-over';
    g.clearRect(0, 0, this.W, this.H);
    g.drawImage(img, 0, 0, this.W, this.H);
    if (mat) {
      g.globalCompositeOperation = 'destination-in';
      g.drawImage(mat, 0, 0, this.W, this.H);
      g.globalCompositeOperation = 'source-over';
    }
  };

  /* Show frame i (or the nearest decoded one). Returns the index actually shown. */
  FrameSequence.prototype.draw = function (i) {
    i = Math.max(0, Math.min(this.count - 1, i | 0));
    this.dir = i >= this.cursor ? (i === this.cursor ? this.dir : 1) : -1;
    this.cursor = i; this.wanted = i;
    var idx = this._nearestReady(i);
    if (idx < 0) return -1;
    if (idx !== this.shown) {
      var bmp = this.bitmaps.get(idx);
      if (bmp) { this.ctx.clearRect(0, 0, this.W, this.H); this.ctx.drawImage(bmp, 0, 0); }
      else this._compose(this.ctx, idx);
      this.shown = idx;
    }
    this._warm();
    return idx;
  };

  /* Keep composited bitmaps for a window around the playhead; free the rest. */
  FrameSequence.prototype._warm = function () {
    if (!this.canBitmap || this.warming || this.destroyed) return;
    var lo = this.cursor - (this.dir >= 0 ? this.behind : this.ahead);
    var hi = this.cursor + (this.dir >= 0 ? this.ahead : this.behind);
    var self = this, target = -1, k;
    // order: nearest first
    for (k = 0; k <= Math.max(this.ahead, this.behind); k++) {
      var cands = this.dir >= 0 ? [this.cursor + k, this.cursor - k] : [this.cursor - k, this.cursor + k];
      for (var c = 0; c < 2; c++) {
        var j = cands[c];
        if (j >= lo && j <= hi && j >= 0 && j < this.count && this.state[j] === 2 && !this.bitmaps.has(j)) { target = j; break; }
      }
      if (target >= 0) break;
    }
    // evict outside a slightly wider window
    this.bitmaps.forEach(function (bmp, key) {
      if (key < lo - 6 || key > hi + 6) { try { bmp.close(); } catch (e) {} self.bitmaps.delete(key); }
    });
    if (target < 0) return;
    this.warming = true;
    var idx = target;
    var run = function () {
      if (self.destroyed) return;
      self._compose(self.sctx, idx);
      self.canvasToBitmap(self.scratch).then(function (bmp) {
        if (self.destroyed) { try { bmp.close(); } catch (e) {} return; }
        self.bitmaps.set(idx, bmp);
        self.warming = false;
        self._warmSoon();
      }, function () { self.warming = false; self.canBitmap = false; });
    };
    // spread the work: never inside the scroll frame itself
    if (w.requestIdleCallback) w.requestIdleCallback(run, { timeout: 120 }); else setTimeout(run, 0);
  };
  FrameSequence.prototype.canvasToBitmap = function (c) { return w.createImageBitmap(c); };
  FrameSequence.prototype._warmSoon = function () { var s = this; setTimeout(function () { s._warm(); }, 0); };

  FrameSequence.prototype.destroy = function () {
    this.destroyed = true;
    this.bitmaps.forEach(function (b) { try { b.close(); } catch (e) {} });
    this.bitmaps.clear();
  };

  w.FrameSequence = FrameSequence;
})(window);
