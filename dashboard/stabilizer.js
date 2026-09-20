(() => {
  "use strict";

  const SMIN = 180, SMAX = 260;    
  const S = { running:false, target:220, outputV:0, inputV:0, freq:0, stability:0, eff:0, thd:0, load:0, regUntil:0, overVolt:false };
  const OV_LIMIT = 253;

  const $ = id => document.getElementById(id);
  const els = {
    statusPill:$('statusPill'), statusText:$('statusText'), inputCard:$('inputCard'),
    inV:$('inV'), inHz:$('inHz'), inWarn:$('inWarn'),
    outV:$('outV'), stabTag:$('stabTag'), stabPct:$('stabPct'),
    freqV:$('freqV'), effV:$('effV'), thdV:$('thdV'), loadV:$('loadV'),
    effBar:$('effBar'), thdBar:$('thdBar'), loadBar:$('loadBar'),
    eq:$('eq'), mIn:$('mIn'), mOut:$('mOut'), zone:$('zone'), deltaV:$('deltaV'),
    powerBtn:$('powerBtn'), powerLabel:$('powerLabel'), setBtn:$('setBtn'),
  };

  const BARS = 22, eqBars = [];
  for (let i = 0; i < BARS; i++) { const b = document.createElement('span'); els.eq.appendChild(b); eqBars.push(b); }

  const clamp = (v,a,b) => Math.max(a, Math.min(b, v));
  const lerp = (a,b,t) => a + (b - a) * t;
  const now = () => performance.now();
  const pos = v => clamp((v - SMIN) / (SMAX - SMIN) * 100, 0, 100);   // value -> % on track

  function telemetry() {
    const t = now() / 1000;
    if (S.running) {
      const drift = 9 * Math.sin(t * 0.45) + 4 * Math.sin(t * 0.17 + 1.3);
      S.inputV = clamp(242 + drift + (Math.random() - 0.5) * 3.2, S.target + 8, 262);
      S.overVolt = S.inputV > OV_LIMIT;

      const reg = now() < S.regUntil;
      S.outputV = reg ? lerp(S.outputV, S.target, 0.18) : S.target + (Math.random() - 0.5) * 0.7;

      S.freq = 50 + 0.04 * Math.sin(t * 0.9) + (Math.random() - 0.5) * 0.03;

      const err = Math.abs(S.outputV - S.target);
      S.stability = clamp(99.4 - err * 4 - (S.overVolt ? 1.2 : 0) - Math.random() * 0.4, 90, 99.6);
      S.eff = clamp(97.8 - (S.inputV - S.target) * 0.05 - Math.random() * 0.3, 93, 98.5);
      S.thd = clamp(1.6 + (S.overVolt ? 0.8 : 0) + Math.random() * 0.4, 1.2, 3.2);
      S.load = clamp(58 + 10 * Math.sin(t * 0.3) + (Math.random() - 0.5) * 6, 30, 85);
    } else {
      S.inputV = 0; S.outputV = 0; S.freq = 0; S.stability = 0; S.eff = 0; S.thd = 0; S.load = 0; S.overVolt = false;
    }
    render();
    eqTick();
  }

  function render() {
    if (S.running) {
      els.inV.textContent = S.inputV.toFixed(0);
      els.inHz.textContent = S.freq.toFixed(1) + ' Hz';
      els.outV.textContent = S.outputV.toFixed(0);
      els.freqV.textContent = S.freq.toFixed(2);
      els.stabPct.textContent = Math.round(S.stability);
      els.effV.textContent = S.eff.toFixed(1) + '%';
      els.thdV.textContent = S.thd.toFixed(1) + '%';
      els.loadV.textContent = Math.round(S.load) + '%';
      els.effBar.style.width = S.eff + '%';
      els.thdBar.style.width = (S.thd / 5 * 100) + '%';
      els.loadBar.style.width = S.load + '%';

      els.mIn.style.opacity = 1; els.mOut.style.opacity = 1; els.zone.style.opacity = 1;
      els.mIn.style.left = pos(S.inputV) + '%';
      els.mOut.style.left = pos(S.outputV) + '%';
      const zL = pos(S.target - 3), zR = pos(S.target + 3);
      els.zone.style.left = zL + '%'; els.zone.style.width = (zR - zL) + '%';
      els.deltaV.textContent = '−' + (S.inputV - S.outputV).toFixed(0) + ' V';

      const reg = now() < S.regUntil;
      els.stabTag.className = 'stab-tag ' + (reg ? 'reg' : 'stable');
      els.stabTag.textContent = reg ? 'REGULATING' : 'STABLE';
      els.inputCard.classList.toggle('alert', S.overVolt);
      els.inWarn.innerHTML = S.overVolt ? '<span class="ovwarn">⚠ OVER-VOLTAGE</span>' : 'within range';
    } else {
      els.inV.textContent = '—'; els.inHz.textContent = '— Hz';
      els.outV.textContent = '—'; els.freqV.textContent = '—';
      els.stabPct.textContent = '0';
      els.effV.textContent = '—'; els.thdV.textContent = '—'; els.loadV.textContent = '—';
      els.effBar.style.width = '0'; els.thdBar.style.width = '0'; els.loadBar.style.width = '0';
      els.mIn.style.opacity = 0; els.mOut.style.opacity = 0; els.zone.style.opacity = 0;
      els.deltaV.textContent = '— V';
      els.stabTag.className = 'stab-tag idle'; els.stabTag.textContent = 'IDLE';
      els.inputCard.classList.remove('alert'); els.inWarn.textContent = 'offline';
    }
  }

  function eqTick() {
    for (let i = 0; i < BARS; i++) {
      let h = 14;
      if (S.running) { h = clamp(30 + 50 * Math.abs(Math.sin(now() / 300 + i * 0.6)) + (Math.random() * 16 - 8), 14, 100); }
      eqBars[i].style.height = h + '%';
      eqBars[i].style.opacity = S.running ? 0.85 : 0.2;
    }
  }

  function setPower(on) {
    S.running = on;
    if (on) {
      S.outputV = Math.max(S.target - 30, 180);
      S.regUntil = now() + 1100;
      els.statusPill.className = 'status online'; els.statusText.textContent = 'SYSTEM ONLINE';
      els.powerBtn.className = 'btn power stop'; els.powerLabel.textContent = 'Stop Converter';
    } else {
      els.statusPill.className = 'status offline'; els.statusText.textContent = 'SYSTEM OFFLINE';
      els.powerBtn.className = 'btn power start'; els.powerLabel.textContent = 'Start Converter';
    }
    telemetry();
  }
  els.powerBtn.addEventListener('click', () => setPower(!S.running));

  const overlay = $('overlay'), slider = $('vslider'), modalVal = $('modalVal'), modalNote = $('modalNote');
  const presets = [...document.querySelectorAll('.preset')];
  let pendingTarget = S.target, lastFocused = null;

  function syncModal(v) {
    pendingTarget = clamp(parseInt(v, 10), 180, 235);
    slider.value = pendingTarget; modalVal.textContent = pendingTarget;
    presets.forEach(p => p.classList.toggle('active', +p.dataset.v === pendingTarget));
    if (S.running && pendingTarget >= S.inputV - 6) {
      modalNote.className = 'modal-note warn';
      modalNote.textContent = '⚠ Target close to mains — limited buck headroom.';
    } else {
      modalNote.className = 'modal-note';
      modalNote.textContent = 'Mains stays above target so the converter can buck down.';
    }
  }
  function openModal() {
    lastFocused = document.activeElement;
    syncModal(S.target);
    overlay.classList.add('open');
    setTimeout(() => $('confirmBtn').focus(), 30);
    document.addEventListener('keydown', onKey);
  }
  function closeModal() {
    overlay.classList.remove('open');
    document.removeEventListener('keydown', onKey);
    if (lastFocused) lastFocused.focus();
  }
  function onKey(e) { if (e.key === 'Escape') closeModal(); }

  els.setBtn.addEventListener('click', openModal);
  $('cancelBtn').addEventListener('click', closeModal);
  overlay.addEventListener('click', e => { if (e.target === overlay) closeModal(); });
  slider.addEventListener('input', e => syncModal(e.target.value));
  presets.forEach(p => p.addEventListener('click', () => syncModal(p.dataset.v)));
  $('confirmBtn').addEventListener('click', () => {
    S.target = pendingTarget;
    if (S.running) S.regUntil = now() + 1100;
    closeModal();
    telemetry();
  });

  render();
  setInterval(telemetry, 120);
})();
