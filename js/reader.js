// ============================================================
// READER.JS — PDF, EPUB, TXT Reader
// ============================================================
let pdfDoc      = null;
let currentPage = 1;
let totalPages  = 1;
let currentZoom = 1.0;
let isRendering = false;
let currentBook = null;
let isMobile    = window.innerWidth < 768;

// EPUB state
let epubChapters       = [];
let epubCurrentChapter = 0;

// Touch
let touchStartX = 0;

async function openReader(book) {
  currentBook  = book;
  currentPage  = 1;
  currentZoom  = 1.0;
  isMobile     = window.innerWidth < 768;

  document.getElementById('readerView').style.display = 'block';
  document.getElementById('appPage').style.display    = 'none';
  document.getElementById('readerBookTitle').textContent = book.title;
  document.getElementById('pdfCanvas').style.display  = 'none';
  document.getElementById('epubContainer').style.display = 'none';
  document.getElementById('readerLoading').style.display = 'flex';
  document.getElementById('readerLoading').innerHTML = '<div class="spinner"></div><p>Loading...</p>';

  // Set download links
  document.querySelectorAll('.reader-download-btn').forEach(el => { el.href = book.downloadUrl; });

  if (book.fileType === 'pdf') {
    await openPDF(book.downloadUrl);
  } else if (book.fileType === 'epub') {
    await openEPUB(book.downloadUrl);
  } else if (book.fileType === 'txt') {
    await openTXT(book.downloadUrl);
  } else {
    showReaderDownload(book.downloadUrl);
  }
}

function closeReader() {
  document.getElementById('readerView').style.display = 'none';
  document.getElementById('appPage').style.display    = 'block';
  pdfDoc = null; isRendering = false;
  epubChapters = []; epubCurrentChapter = 0;
  const canvas = document.getElementById('pdfCanvas');
  canvas.getContext('2d').clearRect(0,0,canvas.width,canvas.height);
  document.getElementById('epubContainer').innerHTML = '';
}

// ── PDF ───────────────────────────────────────────────────────
async function openPDF(url) {
  try {
    pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
    const flUrl = url.replace('/upload/', '/upload/fl_attachment/');
    try { pdfDoc = await pdfjsLib.getDocument({ url: flUrl }).promise; }
    catch(e) { pdfDoc = await pdfjsLib.getDocument({ url }).promise; }
    totalPages = pdfDoc.numPages;
    document.getElementById('readerLoading').style.display = 'none';
    if (isMobile) {
      await renderAllPDFPages();
    } else {
      document.getElementById('pdfCanvas').style.display = 'block';
      await renderPDFPage(1);
    }
    updatePageInfo();
    updateNavBtns();
  } catch(e) {
    // Google Docs fallback
    document.getElementById('readerLoading').style.display = 'none';
    const c = document.getElementById('epubContainer');
    c.style.display = 'block';
    c.innerHTML = '<iframe src="https://docs.google.com/viewer?url=' + encodeURIComponent(url) + '&embedded=true" style="width:100%;height:80vh;border:none;border-radius:8px;"></iframe>';
  }
}

async function renderAllPDFPages() {
  const c = document.getElementById('epubContainer');
  c.style.display = 'block';
  c.style.padding = '0';
  c.style.background = 'transparent';
  c.innerHTML = '<div id="pdfPages" style="display:flex;flex-direction:column;gap:8px;align-items:center;"></div>';
  const container = document.getElementById('pdfPages');
  const w = window.innerWidth - 24;
  for (let i = 1; i <= totalPages; i++) {
    const page = await pdfDoc.getPage(i);
    const base = page.getViewport({ scale: 1 });
    const scale = (w / base.width) * currentZoom;
    const vp = page.getViewport({ scale });
    const canvas = document.createElement('canvas');
    canvas.width = vp.width; canvas.height = vp.height;
    canvas.style.cssText = 'width:100%;border-radius:4px;display:block;box-shadow:0 4px 20px rgba(0,0,0,0.4);';
    container.appendChild(canvas);
    await page.render({ canvasContext: canvas.getContext('2d'), viewport: vp }).promise;
    currentPage = i;
    updatePageInfo();
  }
  totalPages = pdfDoc.numPages;
  updatePageInfo();
  updateNavBtns();
}

async function renderPDFPage(num) {
  if (isRendering || !pdfDoc) return;
  isRendering = true;
  const canvas = document.getElementById('pdfCanvas');
  canvas.style.opacity = '0.5';
  try {
    const page = await pdfDoc.getPage(num);
    const maxW = Math.min(document.getElementById('readerBody').clientWidth - 48, 900);
    const base = page.getViewport({ scale: 1 });
    const scale = (maxW / base.width) * currentZoom;
    const vp = page.getViewport({ scale });
    canvas.width = vp.width; canvas.height = vp.height;
    await page.render({ canvasContext: canvas.getContext('2d'), viewport: vp }).promise;
    canvas.style.opacity = '1';
    currentPage = num;
    updatePageInfo();
    updateNavBtns();
    document.getElementById('readerBody').scrollTo({ top: 0, behavior: 'smooth' });
  } finally {
    isRendering = false;
    canvas.style.opacity = '1';
  }
}

async function changePage(delta) {
  if (currentBook?.fileType === 'epub') {
    const next = epubCurrentChapter + delta;
    if (next < 0 || next >= epubChapters.length) return;
    epubCurrentChapter = next;
    renderEPUBChapter(epubCurrentChapter);
    document.getElementById('readerBody').scrollTo({ top: 0, behavior: 'smooth' });
    return;
  }
  if (isMobile) return;
  const np = currentPage + delta;
  if (np < 1 || np > totalPages) return;
  await renderPDFPage(np);
}

async function changeZoom(delta) {
  currentZoom = Math.max(0.5, Math.min(3.0, currentZoom + delta));
  if (!pdfDoc) return;
  if (isMobile) {
    document.getElementById('epubContainer').innerHTML = '';
    await renderAllPDFPages();
  } else {
    await renderPDFPage(currentPage);
  }
}

function updatePageInfo() {
  const txt = currentPage + ' / ' + totalPages;
  document.getElementById('pageInfoDesktop').textContent = 'Page ' + txt;
  document.getElementById('pageInfoMobile').textContent = txt;
}

function updateNavBtns() {
  const onMobilePDF = isMobile && currentBook?.fileType === 'pdf';
  ['prevDesktop','prevMobile'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.disabled = onMobilePDF || currentPage <= 1;
  });
  ['nextDesktop','nextMobile'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.disabled = onMobilePDF || currentPage >= totalPages;
  });
}

// ── EPUB ──────────────────────────────────────────────────────
async function openEPUB(url) {
  try {
    document.getElementById('readerLoading').innerHTML = '<div class="spinner"></div><p>Loading EPUB...</p>';
    const urls = [
      url.replace('/upload/', '/upload/fl_attachment/'),
      'https://corsproxy.io/?' + encodeURIComponent(url),
      url
    ];
    let response = null;
    for (const u of urls) {
      try { response = await fetch(u); if (response.ok) break; } catch(e) {}
    }
    if (!response?.ok) { showReaderDownload(url); return; }

    const arrayBuffer = await response.arrayBuffer();
    const zip = await JSZip.loadAsync(arrayBuffer);
    const containerXml = await zip.file('META-INF/container.xml').async('text');
    const parser = new DOMParser();
    const containerDoc = parser.parseFromString(containerXml, 'text/xml');
    const opfPath = containerDoc.querySelector('rootfile').getAttribute('full-path');
    const opfDir = opfPath.includes('/') ? opfPath.substring(0, opfPath.lastIndexOf('/') + 1) : '';
    const opfXml = await zip.file(opfPath).async('text');
    const opfDoc = parser.parseFromString(opfXml, 'text/xml');

    const manifest = {};
    opfDoc.querySelectorAll('manifest item').forEach(item => {
      manifest[item.getAttribute('id')] = item.getAttribute('href');
    });

    // Pre-load images as blob URLs
    const imageCache = {};
    for (const [id, href] of Object.entries(manifest)) {
      if (/\.(jpg|jpeg|png|gif|svg|webp)$/i.test(href)) {
        const fullPath = opfDir + href;
        const imgFile = zip.file(fullPath) || zip.file(href);
        if (imgFile) {
          try {
            const blob = await imgFile.async('blob');
            const blobUrl = URL.createObjectURL(blob);
            imageCache[href] = blobUrl;
            imageCache[href.split('/').pop()] = blobUrl;
          } catch(e) {}
        }
      }
    }

    epubChapters = [];
    const spineItems = opfDoc.querySelectorAll('spine itemref');
    for (const item of spineItems) {
      const href = manifest[item.getAttribute('idref')];
      if (!href) continue;
      const fullPath = opfDir + href;
      const file = zip.file(fullPath) || zip.file(href);
      if (!file) continue;
      try {
        const html = await file.async('text');
        const doc = parser.parseFromString(html, 'text/html');
        doc.querySelectorAll('script,style').forEach(el => el.remove());
        doc.querySelectorAll('img,image').forEach(img => {
          const src = img.getAttribute('src') || img.getAttribute('xlink:href') || '';
          const base = src.split('/').pop();
          if (imageCache[src]) img.setAttribute('src', imageCache[src]);
          else if (imageCache[base]) img.setAttribute('src', imageCache[base]);
        });
        const body = doc.body?.innerHTML || '';
        if (body.trim()) epubChapters.push(body);
      } catch(e) {}
    }

    if (epubChapters.length === 0) { showReaderDownload(url); return; }

    totalPages = epubChapters.length;
    epubCurrentChapter = 0;
    document.getElementById('readerLoading').style.display = 'none';
    renderEPUBChapter(0);

  } catch(e) {
    showReaderDownload(url);
  }
}

function renderEPUBChapter(index) {
  const c = document.getElementById('epubContainer');
  c.style.display = 'block';
  c.innerHTML =
    '<div style="max-width:680px;margin:0 auto;font-family:var(--font-body);font-size:1rem;line-height:1.9;color:var(--text);">' +
    epubChapters[index] +
    '</div>';
  c.querySelectorAll('img').forEach(img => {
    img.style.maxWidth = '100%';
    img.style.height = 'auto';
    img.style.borderRadius = '6px';
  });
  currentPage = index + 1;
  updatePageInfo();
  updateNavBtns();
  document.getElementById('readerBody').scrollTo({ top: 0, behavior: 'smooth' });
}

// ── TXT ───────────────────────────────────────────────────────
async function openTXT(url) {
  try {
    const r = await fetch(url);
    const text = await r.text();
    document.getElementById('readerLoading').style.display = 'none';
    const c = document.getElementById('epubContainer');
    c.style.display = 'block';
    c.innerHTML = '<pre style="white-space:pre-wrap;font-family:var(--font-body);font-size:1rem;line-height:1.9;color:var(--text);">' +
      text.replace(/&/g,'&amp;').replace(/</g,'&lt;') + '</pre>';
    totalPages = 1; currentPage = 1;
    updatePageInfo(); updateNavBtns();
  } catch(e) { showReaderDownload(url); }
}

function showReaderDownload(url) {
  document.getElementById('readerLoading').style.display = 'flex';
  document.getElementById('readerLoading').innerHTML =
    '<div style="text-align:center">' +
    '<div style="font-size:3rem;margin-bottom:16px">📄</div>' +
    '<h3 style="margin-bottom:8px">Preview not available</h3>' +
    '<p style="color:var(--text2);margin-bottom:20px">Download to read this file.</p>' +
    '<a href="' + url + '" target="_blank" class="btn btn-primary">⬇ Download File</a>' +
    '</div>';
}

// ── Touch Swipe ───────────────────────────────────────────────
document.addEventListener('touchstart', e => {
  touchStartX = e.touches[0].clientX;
}, { passive: true });
document.addEventListener('touchend', e => {
  if (document.getElementById('readerView').style.display === 'none') return;
  const dx = e.changedTouches[0].clientX - touchStartX;
  if (Math.abs(dx) > 60) {
    if (dx < 0) changePage(1);
    else changePage(-1);
  }
}, { passive: true });

// ── Keyboard ──────────────────────────────────────────────────
document.addEventListener('keydown', e => {
  if (document.getElementById('readerView').style.display === 'none') return;
  if (e.key === 'ArrowRight' || e.key === 'ArrowDown') changePage(1);
  if (e.key === 'ArrowLeft'  || e.key === 'ArrowUp')   changePage(-1);
  if (e.key === 'Escape') closeReader();
  if (e.key === '+') changeZoom(0.15);
  if (e.key === '-') changeZoom(-0.15);
});
