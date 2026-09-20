/*
 * Very subtle background lightning — the same visual language as the dashboard's #bgBolts,
 * toned down (lower alpha, fewer bolts) so the converter stays the focus.
 * Pauses when the tab is hidden and is not started at all under prefers-reduced-motion.
 */
(function (w) {
  'use strict';
  function Bolts(canvas) {
    var ctx = canvas.getContext('2d');
    var bw = 0, bh = 0, bolts = [], nextSpawn = 0, raf = 0, running = false;

    function size() {
      var d = Math.min(w.devicePixelRatio || 1, 1.5);
      bw = w.innerWidth; bh = w.innerHeight;
      canvas.width = Math.round(bw * d); canvas.height = Math.round(bh * d);
      ctx.setTransform(d, 0, 0, d, 0, 0);
    }
    function jag(ax, ay, bx, by, off, depth) {
      if (depth === 0) return [[ax, ay], [bx, by]];
      var mx = (ax + bx) / 2 + (Math.random() - .5) * off;
      var my = (ay + by) / 2 + (Math.random() - .5) * off * 0.35;
      var l = jag(ax, ay, mx, my, off / 2, depth - 1);
      var r = jag(mx, my, bx, by, off / 2, depth - 1);
      return l.concat(r.slice(1));
    }
    function make() {
      var x0 = Math.random() * bw, y0 = -10;
      var x1 = x0 + (Math.random() - .5) * bw * 0.28;
      var y1 = bh * (0.4 + Math.random() * 0.5);
      var main = jag(x0, y0, x1, y1, (y1 - y0) * 0.16, 6), branches = [];
      var nb = 1 + Math.floor(Math.random() * 3);
      for (var i = 0; i < nb; i++) {
        var idx = Math.floor(main.length * (0.2 + Math.random() * 0.55));
        var sx = main[idx][0], sy = main[idx][1];
        var dir = Math.random() < .5 ? -1 : 1, len = bh * (0.12 + Math.random() * 0.18);
        branches.push(jag(sx, sy, sx + dir * len * (0.5 + Math.random() * 0.7), sy + len, len * 0.35, 4));
      }
      return { paths: [main].concat(branches), born: performance.now() / 1000, dur: 2.6 + Math.random() * 1.4,
        color: Math.random() < .8 ? '122,240,221' : '255,122,46' };
    }
    function draw() {
      if (!running) return;
      var t = performance.now() / 1000;
      ctx.clearRect(0, 0, bw, bh);
      if (t >= nextSpawn && bolts.length < 2) { bolts.push(make()); nextSpawn = t + 1.6 + Math.random() * 2.6; }
      for (var i = bolts.length - 1; i >= 0; i--) {
        var b = bolts[i], p = (t - b.born) / b.dur;
        if (p >= 1) { bolts.splice(i, 1); continue; }
        var a = Math.pow(Math.sin(Math.PI * p), 2) * 0.26, reveal = Math.min(1, p / 0.28);
        ctx.strokeStyle = 'rgba(' + b.color + ',' + a + ')';
        ctx.shadowColor = 'rgba(' + b.color + ',' + a + ')';
        ctx.shadowBlur = 14; ctx.lineJoin = 'round'; ctx.lineCap = 'round';
        for (var pi = 0; pi < b.paths.length; pi++) {
          var path = b.paths[pi];
          ctx.lineWidth = pi === 0 ? 1.4 : 0.8;
          var n = Math.max(2, Math.ceil(path.length * reveal));
          ctx.beginPath(); ctx.moveTo(path[0][0], path[0][1]);
          for (var j = 1; j < n; j++) ctx.lineTo(path[j][0], path[j][1]);
          ctx.stroke();
        }
      }
      ctx.shadowBlur = 0;
      raf = requestAnimationFrame(draw);
    }
    function start() { if (running) return; running = true; size(); raf = requestAnimationFrame(draw); }
    function stop() { running = false; cancelAnimationFrame(raf); ctx.clearRect(0, 0, bw, bh); }
    w.addEventListener('resize', function () { if (running) size(); });
    document.addEventListener('visibilitychange', function () { if (document.hidden) stop(); else start(); });
    return { start: start, stop: stop };
  }
  w.Bolts = Bolts;
})(window);
