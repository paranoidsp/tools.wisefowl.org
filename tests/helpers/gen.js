// In-page generators for deterministic test inputs. Everything is produced in
// the browser (canvas, MediaRecorder, pdf-lib) so there are no binary fixtures
// to check in and the suite runs the same on any machine with Chromium.

// Attach `count` small PNG images to a file input (#file-input by default).
async function attachImages(page, count = 2, inputSel = '#file-input') {
  await page.evaluate(async ({ count, inputSel }) => {
    const dt = new DataTransfer();
    for (let i = 0; i < count; i++) {
      const c = document.createElement('canvas');
      c.width = 200; c.height = 150;
      const x = c.getContext('2d');
      x.fillStyle = `hsl(${i * 90}, 70%, 55%)`;
      x.fillRect(0, 0, c.width, c.height);
      x.fillStyle = 'white';
      x.font = '24px sans-serif';
      x.fillText('img ' + (i + 1), 20, 80);
      const blob = await new Promise((r) => c.toBlob(r, 'image/png'));
      dt.items.add(new File([blob], `image-${i + 1}.png`, { type: 'image/png' }));
    }
    const input = document.querySelector(inputSel);
    input.files = dt.files;
    input.dispatchEvent(new Event('change'));
  }, { count, inputSel });
}

// Build a small multi-page PDF with pdf-lib (loaded on the page) and attach it.
async function attachPdf(page, pages = 2, inputSel = '#file-input') {
  await page.evaluate(async ({ pages, inputSel }) => {
    const { PDFDocument, StandardFonts, rgb } = window.PDFLib;
    const doc = await PDFDocument.create();
    const font = await doc.embedFont(StandardFonts.Helvetica);
    for (let i = 0; i < pages; i++) {
      const p = doc.addPage([300, 200]);
      p.drawText('Page ' + (i + 1), { x: 40, y: 100, size: 28, font, color: rgb(0.1, 0.1, 0.1) });
    }
    const bytes = await doc.save();
    const dt = new DataTransfer();
    dt.items.add(new File([bytes], 'doc.pdf', { type: 'application/pdf' }));
    const input = document.querySelector(inputSel);
    input.files = dt.files;
    input.dispatchEvent(new Event('change'));
  }, { pages, inputSel });
}

// Record a short webm (video+audio, or audio-only) and attach it.
async function attachMedia(page, { video = true, ms = 2500, inputSel = '#file-input' } = {}) {
  await page.evaluate(async ({ video, ms, inputSel }) => {
    const tracks = [];
    let iv, osc, ac, canvas;
    if (video) {
      canvas = document.createElement('canvas');
      canvas.width = 320; canvas.height = 240;
      const ctx = canvas.getContext('2d');
      tracks.push(...canvas.captureStream(25).getVideoTracks());
      let f = 0;
      iv = setInterval(() => {
        ctx.fillStyle = `hsl(${(f * 8) % 360},70%,50%)`;
        ctx.fillRect(0, 0, 320, 240);
        ctx.fillStyle = 'white'; ctx.font = '30px sans-serif';
        ctx.fillText('frame ' + f, 20, 130);
        f++;
      }, 40);
    }
    ac = new (window.AudioContext || window.webkitAudioContext)();
    osc = ac.createOscillator(); osc.frequency.value = 440;
    const dest = ac.createMediaStreamDestination();
    osc.connect(dest); osc.start();
    tracks.push(...dest.stream.getAudioTracks());

    const stream = new MediaStream(tracks);
    const mime = video ? 'video/webm' : 'audio/webm';
    const rec = new MediaRecorder(stream, { mimeType: mime });
    const chunks = [];
    rec.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
    const stopped = new Promise((r) => (rec.onstop = r));
    rec.start();
    await new Promise((r) => setTimeout(r, ms));
    if (iv) clearInterval(iv);
    osc.stop(); rec.stop();
    await stopped;

    const file = new File(chunks, video ? 'sample.webm' : 'tone.webm', { type: mime });
    const dt = new DataTransfer();
    dt.items.add(file);
    const input = document.querySelector(inputSel);
    input.files = dt.files;
    input.dispatchEvent(new Event('change'));
  }, { video, ms, inputSel });
}

module.exports = { attachImages, attachPdf, attachMedia };
