// App shell: project sidebar, tabs, web panes, the prompt queue and the cutter.
/* global window, document, Studio */
(function () {
  const $ = (s) => document.querySelector(s);
  const L = window.lightbox;
  let info = null, refs = [], queue = [];

  const imgFromBytes = (bytes, type = 'image/png') => new Promise((ok, no) => { const i = new Image(); i.onload = () => ok(i); i.onerror = no; i.src = URL.createObjectURL(new Blob([bytes], { type })); });
  const base = (p) => p.split(/[\\/]/).pop();

  // ---- tabs and panes ----
  let tab = 'studio';
  function showTab(t) {
    tab = t;
    document.querySelectorAll('.tabs button').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.tab === t)));
    $('#view-studio').hidden = t !== 'studio';
    $('#view-prompts').hidden = t !== 'prompts';
    const pane = t === 'chatgpt' || t === 'suno';
    $('#view-pane').hidden = !pane;
    if (t !== 'studio') Studio.stop();
    if (pane) { $('#paneTitle').textContent = t === 'chatgpt' ? 'ChatGPT (your own sign-in)' : 'Suno (your own sign-in). Downloads land in the project\'s audio folder.'; requestAnimationFrame(placePane); }
    else L.showPane(null, {});
  }
  function placePane() {
    if (tab !== 'chatgpt' && tab !== 'suno') return;
    const r = $('#paneArea').getBoundingClientRect();
    L.showPane(tab, { x: r.left, y: r.top, width: r.width, height: r.height });
  }
  document.querySelectorAll('.tabs button').forEach((b) => (b.onclick = () => showTab(b.dataset.tab)));
  window.addEventListener('resize', placePane);
  $('#paneReload').onclick = () => L.reloadPane(tab);

  // ---- project ----
  function list(el, items, label, onPick, empty) {
    el.innerHTML = '';
    if (!items.length) { el.innerHTML = `<li class="empty">${empty}</li>`; return; }
    for (const it of items) { const li = document.createElement('li'); const b = document.createElement('button'); b.textContent = label(it); b.title = it.path; b.onclick = () => onPick(it, b); li.appendChild(b); el.appendChild(li); }
  }
  function render(p) {
    info = p;
    $('#projName').textContent = p ? p.dir : 'No project open';
    if (!p) return;
    list($('#kitList'), p.kits, (k) => k.name, openKit, 'Cut a sheet to make one.');
    list($('#sheetList'), p.sheets, (s) => s.name, (s) => { showTab('prompts'); $('#cSheet').value = s.path; }, 'None yet.');
    list($('#audioList'), p.audio, (a) => a.name, openSong, 'Download from the Suno tab.');
    $('#cSheet').innerHTML = p.sheets.map((s) => `<option value="${s.path}">${s.name}</option>`).join('');
  }
  async function openKit(k, btn) {
    const paths = await L.kitFrames(k.path);
    if (!paths.length) { alertLine(`No frames (name_f1.png …) in ${k.name}.`); return; }
    const imgs = await Promise.all(paths.map(async (p) => imgFromBytes(await L.bytes(p))));
    const meta = await L.kitMeta(k.path); const t = await L.loadTiming(k.path);
    Studio.load(imgs, { name: k.name, dir: k.path, hold: t?.hold || meta?.hold, fps: t?.fps, audioOffset: t?.audioOffset, bpm: t?.bpm });
    document.querySelectorAll('#kitList button').forEach((b) => b.classList.toggle('cur', b === btn));
    showTab('studio');
  }
  async function openSong(a) {
    const type = /\.wav$/i.test(a.name) ? 'audio/wav' : /\.m4a$/i.test(a.name) ? 'audio/mp4' : 'audio/mpeg';
    await Studio.loadAudio(new Blob([await L.bytes(a.path)], { type }), a.name);
    showTab('studio');
  }
  const alertLine = (t) => { $('#dlNote').textContent = t; };
  $('#openProject').onclick = async () => render(await L.chooseProject());
  L.onProject(render);
  L.onDownload((d) => alertLine(d.state === 'completed' ? `Saved ${d.name}` : `Download ${d.state}: ${d.name}`));
  $('#saveTiming').onclick = async () => { const dir = Studio.dir(); if (!dir) return; const p = await L.saveTiming(dir, Studio.timing()); alertLine(`Timing saved: ${base(p)}`); };

  // ---- prompt queue ----
  function drawQueue() {
    $('#queue').innerHTML = queue.map((j, i) => `<li>${j.name || 'sheet'} <span class="hint">(${j.refs.length} ref)</span><span class="state ${j.state || ''}" id="q${i}">${j.state || 'waiting'}</span></li>`).join('');
  }
  $('#pAddRefs').onclick = () => $('#pRefFiles').click();
  $('#pRefFiles').onchange = (e) => { refs = [...e.target.files].map((f) => L.pathFor(f)).filter(Boolean); $('#pRefs').textContent = refs.length ? refs.map(base).join(', ') : 'No references.'; };
  $('#pQueue').onclick = () => {
    const prompt = $('#pText').value.trim(); if (!prompt) return;
    queue.push({ name: $('#pName').value.trim() || `sheet_${queue.length + 1}`, prompt, refs: refs.slice() });
    $('#pText').value = ''; drawQueue();
  };
  $('#pRun').onclick = async () => {
    const todo = queue.filter((j) => j.state !== 'done'); if (!todo.length) return;
    const r = await L.runPrompts(todo.map(({ name, prompt, refs }) => ({ name, prompt, refs })));
    if (r && r.error) alertLine(r.error);
  };
  $('#pStop').onclick = () => L.stopPrompts();
  L.onJob((p) => {
    const pending = queue.filter((j) => j.state !== 'done');
    const j = pending[p.i] || queue[p.i]; if (!j) return;
    j.state = p.state; if (p.error) j.state = 'failed: ' + p.error; if (p.msg) j.state = p.msg;
    drawQueue();
  });

  // ---- cutter ----
  $('#cRun').onclick = async () => {
    const sheet = $('#cSheet').value; if (!sheet) return;
    const name = ($('#cName').value.trim() || base(sheet).replace(/\.\w+$/, '')).replace(/[^\w.-]+/g, '_');
    $('#cLog').textContent = '';
    const r = await L.cut({ sheet, rows: +$('#cRows').value, cols: +$('#cCols').value, hold: +$('#cHold').value, skip: $('#cSkip').value.trim(), name });
    $('#cLog').textContent += r.ok ? `\nDone: ${r.dir}` : `\nFailed: ${r.error}`;
    if (r.ok) { const k = (info?.kits || []).find((x) => x.path === r.dir) || { name, path: r.dir }; openKit(k); }
  };
  L.onCutLog((t) => { $('#cLog').textContent += t; });

  L.project().then(render);
  showTab('studio');
})();
