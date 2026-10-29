// Drives the signed-in ChatGPT pane: attach reference images, type a prompt, send it, wait for the picture,
// and save the full-resolution original into the project. This is UI scripting of chatgpt.com, so it can
// break when the site changes; every step reports what it did, and a failed step stops the queue.
const fs = require('node:fs');
const path = require('node:path');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Runs inside chatgpt.com. Kept as plain functions so they can be stringified into the page.
const PAGE = {
  busy: () => !!document.querySelector('[data-testid="stop-button"], button[aria-label^="Stop"]'),
  cid: () => (location.pathname.match(/\/c\/([0-9a-f-]+)/) || [])[1] || null,
  async token() {
    if (!window.__lbTok) window.__lbTok = (await (await fetch('/api/auth/session')).json()).accessToken;
    return window.__lbTok;
  },
  async images(cid) {
    if (!cid) return [];
    const h = { authorization: 'Bearer ' + (await PAGE.token()) };
    const c = await (await fetch('/backend-api/conversation/' + cid, { headers: h })).json();
    const out = [];
    for (const n of Object.values(c.mapping || {})) {
      const m = n.message; if (!m || m.author.role !== 'tool') continue;
      for (const p of (m.content && m.content.parts) || []) if (p && typeof p === 'object' && p.asset_pointer) out.push({ ap: p.asset_pointer, w: p.width, h: p.height, t: m.create_time });
    }
    return out.sort((a, b) => (a.t || 0) - (b.t || 0));
  },
  async download(cid, ap) {
    const h = { authorization: 'Bearer ' + (await PAGE.token()) };
    const fid = ap.replace(/^.*:\/\//, '');
    const j = await (await fetch('/backend-api/files/download/' + fid + '?conversation_id=' + cid + '&inline=false', { headers: h })).json();
    const buf = new Uint8Array(await (await fetch(j.download_url)).arrayBuffer());
    let s = ''; for (let i = 0; i < buf.length; i += 0x8000) s += String.fromCharCode.apply(null, buf.subarray(i, i + 0x8000));
    return btoa(s);
  },
  attach(files) { // files: [{name, b64}]
    const dt = new DataTransfer();
    for (const f of files) {
      const bin = atob(f.b64); const u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
      dt.items.add(new File([u], f.name, { type: f.type || 'image/png' }));
    }
    const inp = [...document.querySelectorAll('input[type=file]')].find((i) => i.multiple && /image/.test(i.accept || '')) || [...document.querySelectorAll('input[type=file]')].find((i) => /image/.test(i.accept || ''));
    if (!inp) return 'no file input';
    inp.files = dt.files; inp.dispatchEvent(new Event('change', { bubbles: true }));
    return 'ok';
  },
  attachedCount: () => document.querySelectorAll('button[aria-label^="Remove"]').length,
  focusEditor() { const ed = document.querySelector('.ProseMirror[contenteditable=true]'); if (!ed) return false; ed.focus(); return true; },
  typedLength() { const ed = document.querySelector('.ProseMirror[contenteditable=true]'); return ed ? ed.innerText.trim().length : -1; },
  clickSend() { const b = document.querySelector('[data-testid=send-button], button[aria-label*="Send"]'); if (!b) return false; b.click(); return true; },
};
// Method shorthand ("async token() {") is turned into a function expression so it can live in an object literal.
const asExpr = (f) => f.toString().replace(/^async\s+(\w+)\s*\(/, 'async function(').replace(/^(?!async\b|function\b|\()(\w+)\s*\(/, 'function(').replace(/PAGE\./g, 'window.__lb.');
const install = (wc) => wc.executeJavaScript(`window.__lb = {${Object.entries(PAGE).map(([k, f]) => `${JSON.stringify(k)}: ${asExpr(f)}`).join(',\n')}}; true`, true);
const call = (wc, fn, ...args) => wc.executeJavaScript(`window.__lb[${JSON.stringify(fn)}](...${JSON.stringify(args)})`, true)
  .catch(async (e) => { await install(wc); return wc.executeJavaScript(`window.__lb[${JSON.stringify(fn)}](...${JSON.stringify(args)})`, true); });

class ChatGPTDriver {
  constructor(getView, report) { this.getView = getView; this.report = report; this.stopped = false; this.running = false; }
  stop() { this.stopped = true; }

  async run(jobs, outDir) {
    if (this.running) return { ok: false, error: 'A queue is already running.' };
    this.running = true; this.stopped = false;
    const results = [];
    try {
      for (const [i, job] of jobs.entries()) {
        if (this.stopped) { this.report({ i, state: 'stopped' }); break; }
        this.report({ i, state: 'sending', name: job.name });
        const r = await this.one(job, outDir, (msg) => this.report({ i, state: 'working', msg }));
        results.push(r);
        this.report({ i, state: r.ok ? 'done' : 'failed', ...r });
        if (!r.ok) break;
      }
    } finally { this.running = false; }
    return { ok: results.every((r) => r.ok), results };
  }

  async one(job, outDir, note) {
    const view = this.getView(); const wc = view.webContents;
    if (wc.isLoading()) await new Promise((r) => wc.once('did-finish-load', r));
    await install(wc);
    if (!(await call(wc, 'focusEditor'))) return { ok: false, error: 'ChatGPT is not ready. Open the ChatGPT tab and sign in.' };
    for (let k = 0; k < 120 && (await call(wc, 'busy')); k++) await sleep(5000);

    const cid0 = await call(wc, 'cid');
    const before = new Set((await call(wc, 'images', cid0)).map((x) => x.ap));

    if (job.refs && job.refs.length) {
      const files = job.refs.map((p) => ({ name: path.basename(p), type: /\.jpe?g$/i.test(p) ? 'image/jpeg' : 'image/png', b64: fs.readFileSync(p).toString('base64') }));
      await call(wc, 'attach', files); note(`attached ${files.length} picture(s)`);
      for (let k = 0; k < 30 && (await call(wc, 'attachedCount')) < files.length; k++) await sleep(1000);
      if ((await call(wc, 'attachedCount')) < files.length) return { ok: false, error: 'The reference pictures did not attach.' };
    }

    await call(wc, 'focusEditor'); wc.focus();
    await wc.insertText(job.prompt);
    await sleep(600);
    const typed = await call(wc, 'typedLength');
    if (typed < Math.min(20, job.prompt.trim().length)) return { ok: false, error: 'The prompt did not reach the message box.' };
    if (!(await call(wc, 'clickSend'))) return { ok: false, error: 'No send button found.' };
    note('sent, waiting for the picture');

    const t0 = Date.now();
    while (Date.now() - t0 < 10 * 60 * 1000) {
      if (this.stopped) return { ok: false, error: 'stopped' };
      await sleep(8000);
      if (await call(wc, 'busy')) continue;
      const cid = await call(wc, 'cid');
      const fresh = (await call(wc, 'images', cid)).filter((x) => !before.has(x.ap));
      if (fresh.length) {
        const got = fresh[fresh.length - 1];
        const b64 = await call(wc, 'download', cid, got.ap);
        const base = (job.name || `sheet_${Date.now()}`).replace(/[^\w.-]+/g, '_');
        const file = uniquePath(path.join(outDir, `${base}.png`));
        fs.writeFileSync(file, Buffer.from(b64, 'base64'));
        fs.writeFileSync(file.replace(/\.png$/, '.prompt.txt'), job.prompt + (job.refs?.length ? `\n\n[references]\n${job.refs.map((r) => path.basename(r)).join('\n')}` : ''));
        return { ok: true, file, width: got.w, height: got.h, conversation: cid };
      }
      if (Date.now() - t0 > 6 * 60 * 1000) break;
    }
    return { ok: false, error: 'No picture came back (ChatGPT may have answered in text). Check the ChatGPT tab.' };
  }
}

function uniquePath(p) {
  if (!fs.existsSync(p)) return p;
  const { dir, name, ext } = path.parse(p);
  for (let i = 2; ; i++) { const q = path.join(dir, `${name}_v${i}${ext}`); if (!fs.existsSync(q)) return q; }
}

module.exports = { ChatGPTDriver, _installSource: () => `window.__lb = {${Object.entries(PAGE).map(([k, f]) => `${JSON.stringify(k)}: ${asExpr(f)}`).join(',\n')}}; true` };
