// The studio: plays a move on its exposure sheet with onion skin, flags jumps, and plays a song under it.
/* global window, document */
(function () {
  const $ = (s) => document.querySelector(s);
  const cv = $('#cv'), cx = cv.getContext('2d'), sm = $('#sm'), sx = sm.getContext('2d');
  const css = (n) => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
  const hex = (h) => { h = h.replace('#', ''); return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)); };

  let D = [], expo = [], seq = [], f = 0, playing = false, loop = true, sel = new Set(), lastClick = null, timer = null, boil = [];
  let clip = { name: '', dir: null };
  const au = new Audio(); let peaks = null, muted = false;

  function inkOf(src, color) { // white paper -> coloured ink with alpha; transparent PNGs keep their alpha
    const c = document.createElement('canvas'); c.width = src.width; c.height = src.height;
    const g = c.getContext('2d'); g.drawImage(src, 0, 0);
    const d = g.getImageData(0, 0, c.width, c.height), p = d.data;
    for (let i = 0; i < p.length; i += 4) {
      const l = p[i] * 0.3 + p[i + 1] * 0.59 + p[i + 2] * 0.11;
      p[i + 3] = p[i + 3] < 255 ? p[i + 3] : 255 - l;   // keep a transparent PNG's alpha; turn white paper clear
      p[i] = color[0]; p[i + 1] = color[1]; p[i + 2] = color[2];
    }
    g.putImageData(d, 0, 0); return c;
  }
  function boilOf(a, b) {
    const w = 80, h = Math.max(1, Math.round(80 * a.height / a.width)), c = document.createElement('canvas'); c.width = w; c.height = h;
    const g = c.getContext('2d', { willReadFrequently: true });
    const get = (s) => { g.clearRect(0, 0, w, h); g.drawImage(s, 0, 0, w, h); return g.getImageData(0, 0, w, h).data; };
    const A = get(a), B = get(b); let diff = 0, sum = 0;
    for (let i = 3; i < A.length; i += 4) { diff += Math.abs(A[i] - B[i]); sum += A[i]; }
    return diff / Math.max(1, sum);
  }

  function load(imgs, opts = {}) {
    stop();
    const red = hex(css('--prev')), blue = hex(css('--next'));
    D = imgs.map((im) => ({ ink: inkOf(im, [28, 32, 29]), red: inkOf(im, red), blue: inkOf(im, blue), url: im.src || im.toDataURL() }));
    expo = opts.hold && opts.hold.length === D.length ? opts.hold.slice() : D.map(() => 2);
    sel = new Set(); f = 0; clip = { name: opts.name || 'Untitled move', dir: opts.dir || null };
    boil = D.slice(0, -1).map((d, i) => boilOf(d.ink, D[i + 1].ink));
    const W = Math.max(...D.map((d) => d.ink.width)), H = Math.max(...D.map((d) => d.ink.height));
    cv.width = W; cv.height = H; sm.height = 100; sm.width = Math.max(1, Math.round(100 * W / H));
    if (opts.fps) $('#fps').value = String(opts.fps);
    if (opts.audioOffset != null) $('#aOff').value = opts.audioOffset;
    if (opts.bpm != null) $('#bpm').value = opts.bpm;
    $('#clipName').textContent = clip.name;
    $('#saveTiming').disabled = !clip.dir;
    buildSheet(); rebuild(); draw();
  }

  function rebuild() { seq = []; expo.forEach((e, i) => { for (let k = 0; k < e; k++) seq.push(i); }); if (f >= seq.length) f = 0; readout(); }
  const fps = () => +$('#fps').value;
  const songTime = () => +$('#aOff').value + f / fps();
  function readout() {
    if (!seq.length) return;
    $('#rFrame').textContent = `${f + 1} / ${seq.length}`; $('#rDraw').textContent = seq[f] + 1;
    $('#rLen').textContent = (seq.length / fps()).toFixed(2) + ' s'; $('#rCount').textContent = D.length;
    $('#rSong').textContent = peaks || au.src ? songTime().toFixed(2) + ' s' : '–';
    document.querySelectorAll('.cell').forEach((c, i) => c.classList.toggle('now', i === seq[f]));
  }
  function draw() {
    if (!D.length) return;
    const i = seq[f], op = $('#onOp').value / 100;
    cx.fillStyle = '#fff'; cx.fillRect(0, 0, cv.width, cv.height);
    const at = (s) => cx.drawImage(s, (cv.width - s.width) / 2, cv.height - s.height);
    if ($('#onPrev').classList.contains('on') && i > 0) { cx.globalAlpha = op; at(D[i - 1].red); }
    if ($('#onNext').classList.contains('on') && i < D.length - 1) { cx.globalAlpha = op; at(D[i + 1].blue); }
    cx.globalAlpha = 1; at(D[i].ink);
    sx.fillStyle = '#fff'; sx.fillRect(0, 0, sm.width, sm.height);
    const s = D[i].ink, k = sm.height / cv.height; sx.drawImage(s, (sm.width - s.width * k) / 2, sm.height - s.height * k, s.width * k, s.height * k);
    readout(); drawWave();
    const c = document.querySelectorAll('.cell')[i]; if (c && playing) c.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }
  function buildSheet() {
    const box = $('#cells'); box.innerHTML = '';
    D.forEach((d, i) => {
      const c = document.createElement('div'); c.className = 'cell'; c.tabIndex = 0; c.setAttribute('role', 'button'); c.setAttribute('aria-label', `Drawing ${i + 1}`);
      c.innerHTML = `<img alt="" src="${d.url}"><div class="num">#${i + 1}</div><div class="ex"><button aria-label="Hold one frame less">−</button><span id="ex${i}">${expo[i]}</span><button aria-label="Hold one frame more">+</button></div>`;
      const [minus, plus] = c.querySelectorAll('button');
      minus.onclick = (e) => { e.stopPropagation(); expo[i] = Math.max(1, expo[i] - 1); syncEx(); };
      plus.onclick = (e) => { e.stopPropagation(); expo[i] = Math.min(12, expo[i] + 1); syncEx(); };
      c.onclick = (e) => pick(i, e.shiftKey);
      c.onkeydown = (e) => { if (e.key === 'Enter') pick(i, e.shiftKey); };
      box.appendChild(c);
    });
    const med = [...boil].sort((a, b) => a - b)[Math.floor(boil.length / 2)] || 1, mx = Math.max(...boil, 1e-6);
    $('#boil').innerHTML = boil.map((b) => `<i style="height:${Math.max(2, 22 * b / mx)}px" class="${b > 2 * med ? 'pop' : ''}" title="${Math.round(b * 100)}% of the line changes"></i>`).join('');
    syncSel();
  }
  function syncEx() { expo.forEach((e, i) => { const s = $('#ex' + i); if (s) s.textContent = e; }); rebuild(); draw(); }
  function syncSel() { document.querySelectorAll('.cell').forEach((c, i) => c.classList.toggle('sel', sel.has(i))); }
  function pick(i, shift) {
    if (shift && lastClick !== null) { const [a, b] = [Math.min(lastClick, i), Math.max(lastClick, i)]; for (let k = a; k <= b; k++) sel.add(k); }
    else { sel = new Set([i]); lastClick = i; }
    syncSel(); f = seq.indexOf(i); stop(); draw();
  }
  function tick() {
    f++;
    if (f >= seq.length) { if (loop) { f = 0; audioPlay(); } else { f = seq.length - 1; stop(); } }
    draw();
  }
  function start() { if (playing || !D.length) return; playing = true; $('#play').textContent = 'Pause'; audioPlay(); timer = setInterval(tick, 1000 / fps()); }
  function stop() { playing = false; clearInterval(timer); $('#play').textContent = 'Play'; au.pause(); }

  // ---- song ----
  function audioPlay() { if (!au.src || muted) return; au.currentTime = Math.max(0, songTime()); au.play().catch(() => {}); }
  function drawWave() {
    const w = $('#wave'), g = w.getContext('2d'); const W = w.clientWidth || 600; w.width = W; g.clearRect(0, 0, W, 64);
    if (!peaks) return;
    const dur = peaks.dur, off = +$('#aOff').value, len = seq.length / fps();
    g.fillStyle = css('--line'); g.fillRect(W * off / dur, 0, W * len / dur, 64);
    const bpm = +$('#bpm').value;
    if (bpm > 0) { g.fillStyle = css('--beat'); for (let t = 0; t < dur; t += 60 / bpm) g.fillRect(Math.round(W * t / dur), 0, 1, 6); }
    g.fillStyle = css('--soft');
    for (let x = 0; x < W; x++) { const p = peaks.v[Math.floor(x / W * peaks.v.length)] || 0; g.fillRect(x, 32 - p * 30, 1, Math.max(1, p * 60)); }
    g.fillStyle = css('--prev'); g.fillRect(W * songTime() / dur, 0, 2, 64);
  }
  async function loadAudio(blob, name) {
    stop(); au.src = URL.createObjectURL(blob); $('#songName').textContent = `Song: ${name} (reading…)`;
    try {
      const ac = new AudioContext(); const buf = await ac.decodeAudioData(await blob.arrayBuffer());
      const ch = buf.getChannelData(0), N = 3000, step = Math.max(1, Math.floor(ch.length / N)), v = [];
      for (let i = 0; i < N; i++) { let m = 0; for (let k = i * step; k < (i + 1) * step && k < ch.length; k += 8) m = Math.max(m, Math.abs(ch[k])); v.push(m); }
      peaks = { v, dur: buf.duration }; ac.close();
      $('#songName').textContent = `Song: ${name} (${buf.duration.toFixed(1)} s)`;
    } catch { peaks = null; $('#songName').textContent = `Song: ${name} (plays, but no waveform)`; }
    drawWave(); readout();
  }
  function landOnBeat() {
    const bpm = +$('#bpm').value; if (!(bpm > 0) || !seq.length) return;
    const i = sel.size ? Math.min(...sel) : seq[f]; const frame = seq.indexOf(i);
    const t = +$('#aOff').value + frame / fps(), p = 60 / bpm, nearest = Math.round(t / p) * p;
    $('#aOff').value = Math.max(0, +$('#aOff').value + (nearest - t)).toFixed(3); drawWave(); readout();
  }

  // ---- controls ----
  $('#play').onclick = () => (playing ? stop() : start());
  $('#prevB').onclick = () => { if (!seq.length) return; stop(); f = (f - 1 + seq.length) % seq.length; draw(); };
  $('#nextB').onclick = () => { if (!seq.length) return; stop(); f = (f + 1) % seq.length; draw(); };
  $('#loop').onclick = (e) => { loop = !loop; e.target.classList.toggle('on', loop); };
  $('#fps').onchange = () => { if (playing) { stop(); start(); } readout(); drawWave(); };
  ['#onPrev', '#onNext'].forEach((s) => ($(s).onclick = (e) => { e.target.classList.toggle('on'); draw(); }));
  $('#onOp').oninput = draw;
  document.querySelectorAll('[data-set]').forEach((b) => (b.onclick = () => { const v = +b.dataset.set; (sel.size ? [...sel] : expo.map((_, i) => i)).forEach((i) => (expo[i] = v)); syncEx(); }));
  $('#selAll').onclick = () => { sel = new Set(D.map((_, i) => i)); syncSel(); };
  $('#aOff').oninput = () => { drawWave(); readout(); };
  $('#bpm').oninput = drawWave;
  $('#snapBeat').onclick = landOnBeat;
  $('#aMute').onclick = (e) => { muted = !muted; e.target.classList.toggle('on', muted); if (muted) au.pause(); else if (playing) audioPlay(); };
  (() => {
    const w = $('#wave'); let down = false;
    const set = (e) => { if (!peaks) return; const r = w.getBoundingClientRect(); $('#aOff').value = Math.max(0, (e.clientX - r.left) / r.width * peaks.dur).toFixed(2); drawWave(); readout(); if (playing) audioPlay(); };
    w.addEventListener('pointerdown', (e) => { down = true; set(e); }); w.addEventListener('pointermove', (e) => down && set(e)); window.addEventListener('pointerup', () => (down = false));
  })();
  window.addEventListener('resize', drawWave);
  document.addEventListener('keydown', (e) => {
    if (e.target.matches('input,select,textarea') || $('#view-studio').hidden) return;
    if (e.key === ' ') { e.preventDefault(); playing ? stop() : start(); }
    if (e.key === 'ArrowLeft') $('#prevB').click();
    if (e.key === 'ArrowRight') $('#nextB').click();
  });

  window.Studio = {
    load, loadAudio, stop,
    timing: () => ({ move: clip.name, fps: fps(), hold: expo.slice(), frames: seq.length, audioOffset: +$('#aOff').value, bpm: +$('#bpm').value }),
    dir: () => clip.dir,
  };
})();
