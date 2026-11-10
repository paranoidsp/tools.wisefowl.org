const fs = require('fs');
const JSZip = require('jszip');
const { test, expect } = require('./helpers/fixtures');

// ---- In-page input generators ------------------------------------------------
// Every test book is built in the browser at runtime (JSZip, pdf-lib, a tiny
// MOBI writer below), so there are no binary fixtures to check in.

async function loadLibs(page) {
  await page.addScriptTag({ url: 'https://unpkg.com/jszip@3.10.1/dist/jszip.min.js' });
  await page.addScriptTag({ url: 'https://unpkg.com/pdf-lib@1.17.1/dist/pdf-lib.min.js' });
  await page.evaluate(() => {
    window.__attach = (parts, name, type = '') => {
      const dt = new DataTransfer();
      dt.items.add(new File(parts, name, { type }));
      const input = document.getElementById('file-input');
      input.files = dt.files;
      input.dispatchEvent(new Event('change'));
    };
    window.__png = async (w = 60, h = 90, color = '#2563eb') => {
      const c = document.createElement('canvas');
      c.width = w; c.height = h;
      const x = c.getContext('2d');
      x.fillStyle = color; x.fillRect(0, 0, w, h);
      return new Uint8Array(await (await new Promise((r) => c.toBlob(r, 'image/png'))).arrayBuffer());
    };
  });
}

async function attachText(page, text, name, type = 'text/plain') {
  await page.evaluate(({ text, name, type }) => window.__attach([text], name, type), { text, name, type });
}

// An EPUB with the usual faults that make Send to Kindle reject a book:
// a chapter that isn't well-formed XHTML, no dc:language, a cover page as the
// first spine item, plus an image, a stylesheet and a cross-chapter link.
async function attachBrokenEpub(page, { drm = false } = {}) {
  await page.evaluate(async ({ drm }) => {
    const zip = new JSZip();
    zip.file('mimetype', 'application/epub+zip');
    zip.file('META-INF/container.xml', `<?xml version="1.0"?><container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles><rootfile full-path="OPS/book.opf" media-type="application/oebps-package+xml"/></rootfiles></container>`);
    if (drm) zip.file('META-INF/encryption.xml', `<encryption xmlns="urn:oasis:names:tc:opendocument:xmlns:container" xmlns:enc="http://www.w3.org/2001/04/xmlenc#"><enc:EncryptedData><enc:EncryptionMethod Algorithm="http://www.w3.org/2001/04/xmlenc#aes128-cbc"/><enc:CipherData><enc:CipherReference URI="OPS/ch1.xhtml"/></enc:CipherData></enc:EncryptedData></encryption>`);
    zip.file('OPS/book.opf', `<?xml version="1.0"?>
<package xmlns="http://www.idpf.org/2007/opf" version="2.0" unique-identifier="uid">
<metadata xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:opf="http://www.idpf.org/2007/opf">
<dc:title>Broken Book</dc:title><dc:creator>Ada Author</dc:creator><dc:identifier id="uid">urn:uuid:1b4e28ba-2fa1-11d2-883f-0016d3cca427</dc:identifier>
<meta name="cover" content="cover-img"/>
</metadata>
<manifest>
<item id="cover-img" href="images/cover.png" media-type="image/png"/>
<item id="coverpage" href="cover.xhtml" media-type="application/xhtml+xml"/>
<item id="ch1" href="text/ch1.xhtml" media-type="application/xhtml+xml"/>
<item id="ch2" href="text/ch2.html" media-type="application/xhtml+xml"/>
<item id="css" href="css/style.css" media-type="text/css"/>
<item id="ncx" href="toc.ncx" media-type="application/x-dtbncx+xml"/>
</manifest>
<spine toc="ncx"><itemref idref="coverpage"/><itemref idref="ch1"/><itemref idref="ch2"/></spine>
</package>`);
    zip.file('OPS/images/cover.png', await window.__png(60, 90, '#dc2626'));
    zip.file('OPS/images/fig.png', await window.__png(40, 40, '#16a34a'));
    zip.file('OPS/css/style.css', 'p { text-indent: 1em; } .fig { background: url(../images/fig.png); }');
    zip.file('OPS/cover.xhtml', `<?xml version="1.0"?><html xmlns="http://www.w3.org/1999/xhtml"><head><title>Cover</title></head><body><img src="images/cover.png" alt="cover"/></body></html>`);
    zip.file('OPS/text/ch1.xhtml', `<?xml version="1.0"?><html xmlns="http://www.w3.org/1999/xhtml"><head><title>One</title><link rel="stylesheet" href="../css/style.css" type="text/css"/></head>
<body><h1>Chapter One</h1><p>It was a dark night.</p><p><img src="../images/fig.png" alt="figure"/></p><p>See <a href="ch2.html#later">later</a>.</p><p>Missing <img src="../images/nope.png" alt="gone"/></p></body></html>`);
    // Not well-formed: no xmlns, unclosed <p> and <br>, an HTML entity, a prefixed tag.
    zip.file('OPS/text/ch2.html', `<html><head><title>Two</title></head><body><h1>Chapter Two</h1><p>Unclosed&nbsp;paragraph<br><p id="later">Later on<mbp:pagebreak/> things <b>happened</p></body></html>`);
    zip.file('OPS/toc.ncx', `<?xml version="1.0"?><ncx xmlns="http://www.daisy.org/z3986/2005/ncx/" version="2005-1"><head/><docTitle><text>Broken Book</text></docTitle><navMap>
<navPoint id="n1" playOrder="1"><navLabel><text>The First</text></navLabel><content src="text/ch1.xhtml"/></navPoint>
<navPoint id="n2" playOrder="2"><navLabel><text>The Second</text></navLabel><content src="text/ch2.html"/></navPoint>
</navMap></ncx>`);
    const blob = await zip.generateAsync({ type: 'blob' });
    window.__attach([blob], 'broken.epub', 'application/epub+zip');
  }, { drm });
}

// Minimal uncompressed MOBI 6 (PalmDB + MOBI header + EXTH), with one image
// record that is both an inline image and the cover, and a filepos link.
async function attachMobi(page) {
  await page.evaluate(async () => {
    const enc = new TextEncoder();
    const title = 'Mobi Tale', author = 'Kay Kindle';
    let html = '<html><head></head><body><h2>Opening</h2><p>The first part of the tale.</p>'
      + '<p><img recindex="00001"/></p><p>Jump <a filepos=XXXXXXXXXX>ahead</a>.</p>'
      + '<mbp:pagebreak/><h2>Closing</h2><p>The end of the tale.</p></body></html>';
    const target = enc.encode(html.slice(0, html.indexOf('<h2>Closing'))).length;
    html = html.replace('XXXXXXXXXX', String(target).padStart(10, '0'));
    const text = enc.encode(html);
    const textRecs = [];
    for (let i = 0; i < text.length; i += 4096) textRecs.push(text.slice(i, i + 4096));
    const img = await window.__png(30, 45, '#9333ea');

    const u32 = (n) => { const b = new Uint8Array(4); new DataView(b.buffer).setUint32(0, n); return b; };
    const exthRecs = [[100, enc.encode(author)], [503, enc.encode(title)], [201, u32(0)]];
    const exthLen = 12 + exthRecs.reduce((s, [, d]) => s + 8 + d.length, 0);
    const exthPad = (4 - (exthLen % 4)) % 4;
    const titleBytes = enc.encode(title);
    const titleOff = 16 + 232 + exthLen + exthPad;
    const r0 = new Uint8Array(titleOff + titleBytes.length + 4);
    const dv = new DataView(r0.buffer);
    dv.setUint16(0, 1);                    // compression: none
    dv.setUint32(4, text.length);
    dv.setUint16(8, textRecs.length);
    dv.setUint16(10, 4096);
    r0.set(enc.encode('MOBI'), 16);
    dv.setUint32(20, 232); dv.setUint32(24, 2); dv.setUint32(28, 65001); dv.setUint32(32, 4242); dv.setUint32(36, 6);
    dv.setUint32(84, titleOff); dv.setUint32(88, titleBytes.length);
    dv.setUint8(95, 9);                    // language: English
    dv.setUint32(108, textRecs.length + 1); // first resource record
    dv.setUint32(128, 0x40);               // has EXTH
    dv.setUint32(240, 0);                  // no trailing entries
    dv.setUint32(244, 0xffffffff);         // no NCX index
    let o = 248;
    r0.set(enc.encode('EXTH'), o); dv.setUint32(o + 4, exthLen); dv.setUint32(o + 8, exthRecs.length); o += 12;
    for (const [t, d] of exthRecs) { dv.setUint32(o, t); dv.setUint32(o + 4, 8 + d.length); r0.set(d, o + 8); o += 8 + d.length; }
    r0.set(titleBytes, titleOff);

    const records = [r0, ...textRecs, img];
    const header = new Uint8Array(78 + records.length * 8 + 2);
    const hv = new DataView(header.buffer);
    header.set(enc.encode('Mobi_Tale'), 0);
    header.set(enc.encode('BOOKMOBI'), 60);
    hv.setUint16(76, records.length);
    let off = header.length;
    records.forEach((r, i) => { hv.setUint32(78 + i * 8, off); hv.setUint32(78 + i * 8 + 4, i * 2); off += r.length; });
    window.__attach([header, ...records], 'tale.mobi', 'application/x-mobipocket-ebook');
  });
}

async function attachDocx(page) {
  await page.evaluate(async () => {
    const zip = new JSZip();
    const W = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"';
    zip.file('[Content_Types].xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/><Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/></Types>`);
    zip.file('_rels/.rels', `<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/></Relationships>`);
    zip.file('word/_rels/document.xml.rels', `<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`);
    zip.file('word/styles.xml', `<?xml version="1.0" encoding="UTF-8"?><w:styles ${W}><w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/></w:style></w:styles>`);
    const h = (t) => `<w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr><w:r><w:t>${t}</w:t></w:r></w:p>`;
    const p = (t) => `<w:p><w:r><w:t>${t}</w:t></w:r></w:p>`;
    zip.file('word/document.xml', `<?xml version="1.0" encoding="UTF-8"?><w:document ${W}><w:body>${h('Part Alpha')}${p('Alpha text here.')}${h('Part Beta')}${p('Beta text here.')}</w:body></w:document>`);
    zip.file('docProps/core.xml', `<?xml version="1.0" encoding="UTF-8"?><cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:title>Word Book</dc:title><dc:creator>Wendy Word</dc:creator></cp:coreProperties>`);
    window.__attach([await zip.generateAsync({ type: 'blob' })], 'report.docx');
  });
}

async function attachPdfBook(page) {
  await page.evaluate(async () => {
    const { PDFDocument, StandardFonts } = window.PDFLib;
    const doc = await PDFDocument.create();
    doc.setTitle('Pdf Story');
    doc.setAuthor('Pat Pdf');
    const font = await doc.embedFont(StandardFonts.TimesRoman);
    const chapters = [
      ['Chapter One', ['The quick brown fox jumped over the', 'lazy dog and kept on running until', 'night fell.', 'A second paragraph starts here and', 'ends here.']],
      ['Chapter Two', ['Another chapter with its own text', 'that wraps onto a second line.']],
    ];
    for (const [title, lines] of chapters) {
      const pg = doc.addPage([400, 500]);
      pg.drawText(title, { x: 40, y: 440, size: 22, font });
      let y = 400;
      lines.forEach((l, i) => {
        // An indented first line starts a new paragraph.
        const indent = i === 3 ? 20 : 0;
        pg.drawText(l, { x: 40 + indent, y, size: 12, font });
        y -= 15;
      });
    }
    window.__attach([await doc.save()], 'story.pdf', 'application/pdf');
  });
}

// ---- Helpers ----------------------------------------------------------------

async function waitForBook(page) {
  await page.waitForFunction(() => !document.getElementById('book-section').hidden || !document.getElementById('load-error').hidden);
  const err = page.locator('#load-error');
  if (await err.isVisible()) throw new Error('load failed: ' + (await err.textContent()));
}

async function convert(page, fmt) {
  if (fmt) await page.click(`#format-selector .opt-btn[data-fmt="${fmt}"]`);
  await page.click('#convert-btn');
  await page.waitForFunction(() => !document.getElementById('output-section').hidden || /Error/.test(document.getElementById('status-msg').textContent));
  await expect(page.locator('#output-section')).toBeVisible();
  const [dl] = await Promise.all([page.waitForEvent('download'), page.click('#download-link')]);
  return { name: dl.suggestedFilename(), buf: fs.readFileSync(await dl.path()) };
}

async function openEpub(buf) {
  // The mimetype entry must be first and stored uncompressed.
  expect(buf.slice(30, 38).toString()).toBe('mimetype');
  expect(buf.readUInt16LE(8)).toBe(0);
  const zip = await JSZip.loadAsync(buf);
  const opf = await zip.file('OEBPS/content.opf').async('string');
  const xhtml = {};
  for (const name of Object.keys(zip.files).filter((n) => n.endsWith('.xhtml'))) xhtml[name] = await zip.file(name).async('string');
  return { zip, opf, xhtml };
}

// Every XHTML file must parse as XML — the main reason Kindle rejects EPUBs.
async function expectWellFormed(page, xhtml) {
  const bad = await page.evaluate((files) => Object.entries(files)
    .filter(([, s]) => new DOMParser().parseFromString(s, 'application/xhtml+xml').getElementsByTagName('parsererror').length)
    .map(([n]) => n), xhtml);
  expect(bad).toEqual([]);
}

// Every manifest href must exist in the zip, and every file must be listed.
function expectCompleteManifest(zip, opf) {
  const hrefs = [...opf.matchAll(/<item [^>]*href="([^"]+)"/g)].map((m) => 'OEBPS/' + m[1]);
  for (const h of hrefs) expect(zip.file(h), h).toBeTruthy();
  const files = Object.keys(zip.files).filter((n) => n.startsWith('OEBPS/') && !zip.files[n].dir && n !== 'OEBPS/content.opf');
  expect(files.sort()).toEqual([...hrefs].sort());
}

test.beforeEach(async ({ page }) => {
  await page.goto('/book-convert.html');
  await expect(page.locator('#drop-zone')).toBeVisible();
  await loadLibs(page);
});

// ---- Tests ------------------------------------------------------------------

const GUTENBERG = `Title: The Little Test
Author: Tess Writer
Language: English

CHAPTER I

It was the best of tests, it was the worst of tests, and it went on
for rather a long time across several hard-wrapped lines of prose.

A second paragraph.

CHAPTER II

The middle part.

CHAPTER III

The end.
`;

test('TXT → EPUB: detects chapters and metadata, builds a valid EPUB', async ({ page }) => {
  await attachText(page, GUTENBERG, 'little_test.txt');
  await waitForBook(page);
  // The Gutenberg-style header block is kept as a short front-matter section.
  await expect(page.locator('#source-meta')).toContainText('4 chapters');
  await expect(page.locator('#title-input')).toHaveValue('The Little Test');
  await expect(page.locator('#author-input')).toHaveValue('Tess Writer');
  await expect(page.locator('#toc-list > li')).toHaveCount(3);

  const { name, buf } = await convert(page, 'epub');
  expect(name).toBe('The Little Test - Tess Writer.epub');
  await expect(page.locator('#kindle-note')).toContainText('Send to Kindle');
  const { zip, opf, xhtml } = await openEpub(buf);
  expect(opf).toContain('<dc:title>The Little Test</dc:title>');
  expect(opf).toContain('<dc:creator id="creator1">Tess Writer</dc:creator>');
  expect(opf).toContain('<dc:language>en</dc:language>');
  expect(opf.match(/<itemref /g)).toHaveLength(4);
  await expectWellFormed(page, xhtml);
  expectCompleteManifest(zip, opf);
  const c1 = xhtml['OEBPS/text/c002.xhtml'];
  // Hard-wrapped lines are rejoined into one paragraph.
  expect(c1).toContain('worst of tests, and it went on for rather a long time');
  const nav = xhtml['OEBPS/nav.xhtml'];
  expect(nav).toContain('CHAPTER II');
  expect(await zip.file('OEBPS/toc.ncx').async('string')).toContain('playOrder="3"');
});

test('rename the download; extension stays fixed', async ({ page }) => {
  await attachText(page, GUTENBERG, 'little_test.txt');
  await waitForBook(page);
  await page.click('#format-selector .opt-btn[data-fmt="epub"]');
  await page.click('#convert-btn');
  await expect(page.locator('#output-section')).toBeVisible();
  await expect(page.locator('#filename-ext')).toHaveText('.epub');
  await page.fill('#filename-input', 'my: kindle/book');
  await expect(page.locator('#download-link')).toHaveAttribute('download', 'my kindlebook.epub');
  const [dl] = await Promise.all([page.waitForEvent('download'), page.click('#download-link')]);
  expect(dl.suggestedFilename()).toBe('my kindlebook.epub');
});

test('edited title and author go into the book; editing hides stale output', async ({ page }) => {
  await attachText(page, GUTENBERG, 'little_test.txt');
  await waitForBook(page);
  await page.click('#convert-btn');
  await expect(page.locator('#output-section')).toBeVisible();
  await page.fill('#title-input', 'Renamed & Improved');
  await expect(page.locator('#output-section')).toBeHidden();
  await page.fill('#author-input', 'One Person & Another Person');
  await page.fill('#lang-input', 'en-GB');
  const { name, buf } = await convert(page);
  expect(name).toBe('Renamed & Improved - One Person.epub');
  const { opf } = await openEpub(buf);
  expect(opf).toContain('<dc:title>Renamed &amp; Improved</dc:title>');
  expect(opf).toContain('<dc:creator id="creator2">Another Person</dc:creator>');
  expect(opf).toContain('<dc:language>en-GB</dc:language>');
});

test('EPUB → EPUB repairs a broken book for Send to Kindle', async ({ page }) => {
  await attachBrokenEpub(page);
  await waitForBook(page);
  await expect(page.locator('#convert-btn')).toHaveText('Rebuild EPUB');
  await expect(page.locator('#title-input')).toHaveValue('Broken Book');
  await expect(page.locator('#cover-img')).toBeVisible();
  // The cover page in the spine is dropped — the writer makes its own.
  await expect(page.locator('#source-meta')).toContainText('2 chapters');
  await expect(page.locator('#warnings')).toContainText('1 image');
  await expect(page.locator('#toc-list > li')).toHaveText(['The First', 'The Second']);

  const { buf } = await convert(page);
  const { zip, opf, xhtml } = await openEpub(buf);
  await expectWellFormed(page, xhtml);
  expectCompleteManifest(zip, opf);
  expect(opf).toContain('<dc:language>en</dc:language>');
  expect(opf).toContain('properties="cover-image"');
  expect(opf).toContain('urn:uuid:1b4e28ba-2fa1-11d2-883f-0016d3cca427');
  const c1 = xhtml['OEBPS/text/c001.xhtml'];
  expect(c1).toContain('href="c002.xhtml#later"');
  expect(c1).toMatch(/<img src="\.\.\/images\/i\d+\.png" alt="figure"\s*\/>/);
  // Only the figure and the cover are packed: the dropped cover page's copy isn't.
  expect(Object.keys(zip.files).filter((n) => n.endsWith('.png'))).toHaveLength(2);
  expect(c1).toContain('[gone]');
  expect(c1).toContain('href="../styles/s001.css"');
  const css = await zip.file('OEBPS/styles/s001.css').async('string');
  expect(css).toMatch(/url\("\.\.\/images\/i\d+\.png"\)/);
  const c2 = xhtml['OEBPS/text/c002.xhtml'];
  expect(c2).toContain('id="later"');
  expect(c2).not.toContain('mbp:');
  expect(c2).toContain('things <b>happened</b>');
});

test('DRM-protected EPUB is refused with a clear message', async ({ page }) => {
  await attachBrokenEpub(page, { drm: true });
  await expect(page.locator('#load-error')).toContainText('DRM');
  await expect(page.locator('#book-section')).toBeHidden();
});

test('MOBI → EPUB: metadata, chapters, images and links', async ({ page }) => {
  await attachMobi(page);
  await waitForBook(page);
  await expect(page.locator('#title-input')).toHaveValue('Mobi Tale');
  await expect(page.locator('#author-input')).toHaveValue('Kay Kindle');
  await expect(page.locator('#source-meta')).toContainText('2 chapters');
  await expect(page.locator('#cover-img')).toBeVisible();
  const { buf } = await convert(page);
  const { zip, opf, xhtml } = await openEpub(buf);
  await expectWellFormed(page, xhtml);
  expectCompleteManifest(zip, opf);
  const c1 = xhtml['OEBPS/text/c001.xhtml'];
  expect(c1).toContain('The first part of the tale.');
  expect(c1).toMatch(/<img src="\.\.\/images\/i001\.png"/);
  expect(c1).toMatch(/href="c002\.xhtml#filepos\d+"/);
  expect(xhtml['OEBPS/text/c002.xhtml']).toContain('The end of the tale.');
  expect(xhtml['OEBPS/nav.xhtml']).toContain('Closing');
});

test('Markdown → HTML: single self-contained page with contents', async ({ page }) => {
  const md = `---\ntitle: Notes Book\nauthor: Mark Down\n---\n\n# First\n\nSome *emphasis* here.\n\n# Second\n\nA [link](#first) and ![dot](data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==).\n`;
  await attachText(page, md, 'notes.md', 'text/markdown');
  await waitForBook(page);
  await expect(page.locator('#title-input')).toHaveValue('Notes Book');
  await expect(page.locator('#source-meta')).toContainText('2 chapters · 1 image');
  const { name, buf } = await convert(page, 'html');
  expect(name).toBe('Notes Book - Mark Down.html');
  const html = buf.toString();
  expect(html).toContain('<title>Notes Book</title>');
  expect(html).toContain('<em>emphasis</em>');
  expect(html).toContain('<section id="c2" class="chapter">');
  expect(html).toContain('href="#c1-first"');
  expect(html).toContain('src="data:image/png;base64,');
});

test('DOCX → EPUB: Word headings become chapters', async ({ page }) => {
  await attachDocx(page);
  await waitForBook(page);
  await expect(page.locator('#title-input')).toHaveValue('Word Book');
  await expect(page.locator('#author-input')).toHaveValue('Wendy Word');
  await expect(page.locator('#toc-list > li')).toHaveText(['Part Alpha', 'Part Beta']);
  const { buf } = await convert(page);
  const { xhtml } = await openEpub(buf);
  await expectWellFormed(page, xhtml);
  expect(xhtml['OEBPS/text/c002.xhtml']).toContain('Beta text here.');
});

test('PDF → TXT: text reflowed into paragraphs by chapter', async ({ page }) => {
  await attachPdfBook(page);
  await waitForBook(page);
  await expect(page.locator('#title-input')).toHaveValue('Pdf Story');
  await expect(page.locator('#warnings')).toContainText('text only');
  await expect(page.locator('#toc-list > li')).toHaveText(['Chapter One', 'Chapter Two']);
  const { name, buf } = await convert(page, 'txt');
  expect(name).toBe('Pdf Story - Pat Pdf.txt');
  const txt = buf.toString();
  expect(txt).toContain('The quick brown fox jumped over the lazy dog and kept on running until night fell.');
  expect(txt).toContain('\n\nA second paragraph starts here and ends here.');
  expect(txt).toContain('Another chapter with its own text that wraps onto a second line.');
});

test('EPUB → Markdown and TXT', async ({ page }) => {
  await attachBrokenEpub(page);
  await waitForBook(page);
  const md = (await convert(page, 'md')).buf.toString();
  expect(md).toContain('title: "Broken Book"');
  expect(md).toContain('# Chapter One');
  await expect(page.locator('#kindle-note')).toContainText('isn’t accepted');
  const txt = (await convert(page, 'txt')).buf.toString();
  expect(txt.startsWith('Broken Book\nby Ada Author')).toBe(true);
  expect(txt).toContain('It was a dark night.');
});

test('replacing the cover', async ({ page }) => {
  await attachText(page, GUTENBERG, 'little_test.txt');
  await waitForBook(page);
  await expect(page.locator('#cover-none')).toBeVisible();
  await page.evaluate(async () => {
    const dt = new DataTransfer();
    dt.items.add(new File([await window.__png(50, 75)], 'c.png', { type: 'image/png' }));
    const input = document.getElementById('cover-input');
    input.files = dt.files;
    input.dispatchEvent(new Event('change'));
  });
  await expect(page.locator('#cover-img')).toBeVisible();
  const { zip, opf } = await openEpub((await convert(page)).buf);
  expect(opf).toContain('<meta name="cover" content="cover-image"/>');
  expect(zip.file('OEBPS/images/cover.png')).toBeTruthy();
  expect(zip.file('OEBPS/text/cover.xhtml')).toBeTruthy();
});

test('unsupported files show an inline error', async ({ page }) => {
  await page.evaluate(() => window.__attach([new Uint8Array([1, 2, 3, 4])], 'thing.xyz'));
  await expect(page.locator('#load-error')).toContainText('.xyz files aren’t supported');
  await expect(page.locator('#drop-zone')).toBeVisible();
});

test.describe('on iPad Safari', () => {
  // iPadOS Safari presents itself as desktop Safari on a Mac with touch.
  test.use({
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15',
    hasTouch: true,
  });
  test('the file picker has no type filter, so .mobi files can be chosen', async ({ page }) => {
    await page.addInitScript(() => Object.defineProperty(Navigator.prototype, 'maxTouchPoints', { get: () => 5 }));
    await page.goto('/book-convert.html');
    await expect(page.locator('#file-input')).not.toHaveAttribute('accept', /.*/);
  });
});

test('desktop keeps the file type filter', async ({ page }) => {
  await expect(page.locator('#file-input')).toHaveAttribute('accept', /\.mobi/);
});
