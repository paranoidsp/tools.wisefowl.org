// Handoff — pass a tool's output straight into another tool without a manual
// download/re-upload round trip. All tools are same-origin static pages, so a
// single IndexedDB record is a shared clipboard between them: the source tool
// stashes {blob, name} and navigates to the target with ?handoff=1; the target
// picks it up on load and feeds it to its normal file-loading path.
//
// Blobs (not data URLs) keep large media cheap; IndexedDB has no practical size
// cap the way sessionStorage's ~5 MB string limit does.
(function () {
  const DB = 'wf-tools', STORE = 'handoff', KEY = 'pending', TTL = 120000;

  // Which tools accept which kinds of file. The "Send to" menu is derived from
  // this, so a source only ever offers targets that can actually use its output.
  const TOOLS = [
    { file: 'media-clip.html',    name: 'Media Clipper',    accepts: ['audio', 'video'] },
    { file: 'audio-merge.html',   name: 'Audio Merge',      accepts: ['audio'] },
    { file: 'audio-video.html',   name: 'Audio to Video',   accepts: ['image', 'audio'] },
    { file: 'media-compress.html', name: 'Media Compressor', accepts: ['image', 'pdf'] },
  ];

  const IMAGE_EXT = ['jpg', 'jpeg', 'png', 'webp', 'gif', 'bmp', 'avif'];
  const AUDIO_EXT = ['mp3', 'm4a', 'aac', 'wav', 'ogg', 'oga', 'opus', 'flac', 'weba'];
  const VIDEO_EXT = ['mp4', 'm4v', 'mov', 'webm', 'mkv', 'avi', 'ogv', '3gp'];

  function kindOf(type, name) {
    type = (type || '').toLowerCase();
    if (type.startsWith('image/')) return 'image';
    if (type.startsWith('audio/')) return 'audio';
    if (type.startsWith('video/')) return 'video';
    if (type === 'application/pdf') return 'pdf';
    const m = (name || '').toLowerCase().match(/\.([a-z0-9]+)$/);
    const e = m ? m[1] : '';
    if (IMAGE_EXT.includes(e)) return 'image';
    if (AUDIO_EXT.includes(e)) return 'audio';
    if (VIDEO_EXT.includes(e)) return 'video';
    if (e === 'pdf') return 'pdf';
    return null;
  }

  const selfFile = () => location.pathname.split('/').pop() || 'index.html';

  function openDB() {
    return new Promise((res, rej) => {
      const r = indexedDB.open(DB, 1);
      r.onupgradeneeded = () => r.result.createObjectStore(STORE);
      r.onsuccess = () => res(r.result);
      r.onerror = () => rej(r.error);
    });
  }
  function put(rec) {
    return openDB().then(db => new Promise((res, rej) => {
      const t = db.transaction(STORE, 'readwrite');
      t.objectStore(STORE).put(rec, KEY);
      t.oncomplete = () => res();
      t.onerror = () => rej(t.error);
    }));
  }
  function peek() {
    return openDB().then(db => new Promise((res, rej) => {
      const t = db.transaction(STORE, 'readonly');
      const rq = t.objectStore(STORE).get(KEY);
      rq.onsuccess = () => res(rq.result || null);
      rq.onerror = () => rej(rq.error);
    }));
  }
  function clear() {
    return openDB().then(db => new Promise((res, rej) => {
      const t = db.transaction(STORE, 'readwrite');
      t.objectStore(STORE).delete(KEY);
      t.oncomplete = () => res();
      t.onerror = () => rej(t.error);
    }));
  }

  // Render the "Send to" control for a produced output. `out` is
  // { blob, name, kind }. Targets are the tools (other than this one) that
  // accept `out.kind`; if there are none the control hides itself.
  function showOpenIn(el, out) {
    if (!el) return;
    el.innerHTML = '';
    const self = selfFile();
    const targets = TOOLS.filter(t => t.file !== self && t.accepts.includes(out.kind));
    if (!targets.length) { el.hidden = true; return; }
    el.hidden = false;
    const label = document.createElement('span');
    label.className = 'oi-label';
    label.textContent = 'Send to:';
    el.appendChild(label);
    targets.forEach(t => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'oi-btn';
      b.textContent = t.name;
      b.addEventListener('click', async () => {
        try {
          await put({ blob: out.blob, name: out.name, type: out.blob.type || '', ts: Date.now() });
          location.href = t.file + '?handoff=1';
        } catch (e) {
          console.error('[handoff] could not send', e);
        }
      });
      el.appendChild(b);
    });
  }

  // Call on load. If this page was opened via a handoff (?handoff=1) and a fresh
  // record is waiting whose kind one of `handlers` can take, build a File from
  // it and hand it to that loader. `handlers` maps kind -> fn(File).
  async function receive(handlers) {
    if (new URLSearchParams(location.search).get('handoff') !== '1') return;
    try {
      const rec = await peek();
      if (!rec) return;
      if (Date.now() - (rec.ts || 0) > TTL) { await clear(); return; }
      const kind = kindOf(rec.type, rec.name);
      const fn = handlers[kind];
      if (!fn) return;                       // leave it for the intended tool
      await clear();
      fn(new File([rec.blob], rec.name || 'file', { type: rec.type || '' }));
    } catch (e) {
      console.error('[handoff] receive failed', e);
    }
  }

  window.WFHandoff = { TOOLS, kindOf, showOpenIn, receive, put, peek, clear };
})();
