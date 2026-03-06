// ============================================================
// READER.JS — Mobile-first PDF Reader
// ============================================================

let pdfDoc       = null;
let currentPage  = 1;
let totalPages   = 1;
let currentZoom  = 1.0;
let isRendering  = false;
let currentBook  = null;
let isMobile     = window.innerWidth < 768;

// Touch tracking for swipe
let touchStartX = 0;
let touchStartY = 0;

async function openReader(book) {
  currentBook = book;
  currentPage = 1;
  currentZoom = 1.0;
  isMobile = window.innerWidth < 768;

  document.getElementById('readerTitle').textContent = book.title;
  document.getElementById('readerLoading').style.display = 'flex';
  document.getElementById('readerLoading').innerHTML = '<div class="spinner"></div><p>Loading...</p>';
  document.getElementById('pdfCanvas').style.display = 'none';
  document.getElementById('epubReader').style.display = 'none';
  document.getElementById('pageInfo').textContent = '';
  document.getElementById('mobilePageInfo').textContent = '';

  // Set download links
  ['readerDownloadBtn','mobileDownloadBtn'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.href = book.downloadUrl;
  });

  if (book.fileType === 'pdf') {
    await openPDF(book.downloadUrl);
  } else if (book.fileType === 'epub') {
    await openEPUB(book.downloadUrl);
  } else if (book.fileType === 'txt') {
    await openTXT(book.downloadUrl);
  } else {
    showDownloadOption(book.downloadUrl);
  }
}

async function openPDF(url) {
  try {
    pdfjsLib.GlobalWorkerOptions.workerSrc =
      'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

    const flUrl = url.replace('/upload/', '/upload/fl_attachment/');
    try {
      pdfDoc = await pdfjsLib.getDocument({ url: flUrl, withCredentials: false }).promise;
    } catch(e) {
      pdfDoc = await pdfjsLib.getDocument({ url: url, withCredentials: false }).promise;
    }

    totalPages = pdfDoc.numPages;
    document.getElementById('readerLoading').style.display = 'none';

    if (isMobile) {
      // Mobile: render ALL pages in scroll mode
      await renderAllPages();
    } else {
      // Desktop: single page mode
      document.getElementById('pdfCanvas').style.display = 'block';
      await renderPage(1);
    }
    updateNavButtons();
  } catch(err) {
    console.error(err);
    // Google Docs fallback
    document.getElementById('readerLoading').style.display = 'none';
    const epubEl = document.getElementById('epubReader');
    epubEl.style.display = 'block';
    epubEl.innerHTML = `
      <div style="width:100%; height:85vh; border-radius:8px; overflow:hidden;">
        <iframe src="https://docs.google.com/viewer?url=${encodeURIComponent(url)}&embedded=true"
          style="width:100%; height:100%; border:none;" allowfullscreen></iframe>
      </div>`;
    document.getElementById('mobilePageInfo').textContent = 'PDF';
    document.getElementById('pageInfo').textContent = 'PDF';
  }
}

// ── Mobile: Render all pages stacked (scroll mode) ────────────
async function renderAllPages() {
  const epubEl = document.getElementById('epubReader');
  epubEl.style.display = 'block';
  epubEl.style.padding = '0';
  epubEl.style.background = 'transparent';
  epubEl.innerHTML = '<div id="pdfScrollContainer" style="display:flex; flex-direction:column; gap:8px; align-items:center;"></div>';

  const container = document.getElementById('pdfScrollContainer');
  const screenW = window.innerWidth - 24;

  for (let i = 1; i <= totalPages; i++) {
    const page = await pdfDoc.getPage(i);
    const baseViewport = page.getViewport({ scale: 1 });
    const scale = (screenW / baseViewport.width) * currentZoom;
    const viewport = page.getViewport({ scale });

    const canvas = document.createElement('canvas');
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    canvas.style.cssText = `width:100%; border-radius:4px; display:block; box-shadow:0 4px 20px rgba(0,0,0,0.5);`;
    canvas.setAttribute('data-page', i);
    container.appendChild(canvas);

    await page.render({ canvasContext: canvas.getContext('2d'), viewport }).promise;

    // Update page indicator as user scrolls
    currentPage = i;
    document.getElementById('mobilePageInfo').textContent = `${i}/${totalPages}`;
  }
}

// ── Desktop: Single page render ───────────────────────────────
async function renderPage(pageNum) {
  if (isRendering || !pdfDoc) return;
  isRendering = true;
  const canvas = document.getElementById('pdfCanvas');
  canvas.style.opacity = '0.5';
  try {
    const page = await pdfDoc.getPage(pageNum);
    const ctx = canvas.getContext('2d');
    const container = document.getElementById('readerContainer');
    const maxWidth = Math.min(container.clientWidth - 48, 900);
    const baseViewport = page.getViewport({ scale: 1 });
    const scale = (maxWidth / baseViewport.width) * currentZoom;
    const viewport = page.getViewport({ scale });
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    await page.render({ canvasContext: ctx, viewport }).promise;
    canvas.style.opacity = '1';
    currentPage = pageNum;
    document.getElementById('pageInfo').textContent = `Page ${currentPage} / ${totalPages}`;
    document.getElementById('mobilePageInfo').textContent = `${currentPage}/${totalPages}`;
    document.getElementById('zoomInfo').textContent = `${Math.round(currentZoom * 100)}%`;
    updateNavButtons();
    document.getElementById('readerContainer').scrollTo({ top: 0, behavior: 'smooth' });
  } finally {
    isRendering = false;
    canvas.style.opacity = '1';
  }
}

async function changePage(delta) {
  if (isMobile) return; // Mobile uses scroll mode
  const newPage = currentPage + delta;
  if (newPage < 1 || newPage > totalPages) return;
  await renderPage(newPage);
}

function updateNavButtons() {
  ['prevPage','mobilePrevBtn'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.disabled = isMobile || currentPage <= 1;
  });
  ['nextPage','mobileNextBtn'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.disabled = isMobile || currentPage >= totalPages;
  });
}

async function changeZoom(delta) {
  currentZoom = Math.max(0.5, Math.min(3.0, currentZoom + delta));
  if (!pdfDoc) return;
  if (isMobile) {
    document.getElementById('epubReader').innerHTML = '<div id="pdfScrollContainer" style="display:flex; flex-direction:column; gap:8px; align-items:center;"></div>';
    await renderAllPages();
  } else {
    await renderPage(currentPage);
  }
}


// ── EPUB Reader — Text Extract Mode (works on all devices) ───
let epubChapters = [];
let epubCurrentChapter = 0;

async function openEPUB(url) {
  try {
    document.getElementById('readerLoading').style.display = 'flex';
    document.getElementById('readerLoading').innerHTML = '<div class="spinner"></div><p>Loading EPUB...</p>';

    const epubEl = document.getElementById('epubReader');
    epubEl.style.display = 'none';

    // Load EPUB using JSZip
    // Try multiple URLs to bypass CORS
    let response = null;
    const urls = [
      url.replace('/upload/', '/upload/fl_attachment/'),
      'https://corsproxy.io/?' + encodeURIComponent(url),
      url
    ];
    for (const tryUrl of urls) {
      try {
        response = await fetch(tryUrl);
        if (response.ok) break;
      } catch(e) { continue; }
    }
    if (!response || !response.ok) { showDownloadOption(url); return; }
    const arrayBuffer = await response.arrayBuffer();
    const zip = await JSZip.loadAsync(arrayBuffer);

    // Find OPF file
    const containerXml = await zip.file('META-INF/container.xml').async('text');
    const parser = new DOMParser();
    const containerDoc = parser.parseFromString(containerXml, 'text/xml');
    const opfPath = containerDoc.querySelector('rootfile').getAttribute('full-path');
    const opfDir = opfPath.includes('/') ? opfPath.substring(0, opfPath.lastIndexOf('/') + 1) : '';

    // Parse OPF
    const opfXml = await zip.file(opfPath).async('text');
    const opfDoc = parser.parseFromString(opfXml, 'text/xml');

    // Get spine order
    const spineItems = opfDoc.querySelectorAll('spine itemref');
    const manifestItems = opfDoc.querySelectorAll('manifest item');
    const manifest = {};
    manifestItems.forEach(item => {
      manifest[item.getAttribute('id')] = item.getAttribute('href');
    });

    // Pre-load all images as base64 blob URLs
    const imageCache = {};
    for (const [id, href] of Object.entries(manifest)) {
      if (/\.(jpg|jpeg|png|gif|svg|webp)$/i.test(href)) {
        const fullPath = opfDir + href;
        const imgFile = zip.file(fullPath) || zip.file(href);
        if (imgFile) {
          try {
            const blob = await imgFile.async('blob');
            imageCache[href] = URL.createObjectURL(blob);
            // Also store without directory
            const basename = href.split('/').pop();
            imageCache[basename] = imageCache[href];
          } catch(e) {}
        }
      }
    }

    // Extract text from each chapter
    epubChapters = [];
    for (const item of spineItems) {
      const idref = item.getAttribute('idref');
      const href = manifest[idref];
      if (!href) continue;
      const fullPath = opfDir + href;
      const file = zip.file(fullPath) || zip.file(href);
      if (!file) continue;
      try {
        const html = await file.async('text');
        const doc = parser.parseFromString(html, 'text/html');
        doc.querySelectorAll('script, style').forEach(el => el.remove());

        // Fix image src to use blob URLs
        doc.querySelectorAll('img, image').forEach(img => {
          const src = img.getAttribute('src') || img.getAttribute('xlink:href') || '';
          const basename = src.split('/').pop();
          if (imageCache[src]) img.setAttribute('src', imageCache[src]);
          else if (imageCache[basename]) img.setAttribute('src', imageCache[basename]);
        });

        const body = doc.body?.innerHTML || doc.documentElement?.innerHTML || '';
        if (body.trim()) epubChapters.push(body);
      } catch(e) {}
    }

    if (epubChapters.length === 0) {
      showDownloadOption(url);
      return;
    }

    totalPages = epubChapters.length;
    epubCurrentChapter = 0;

    document.getElementById('readerLoading').style.display = 'none';
    epubEl.style.display = 'block';
    epubEl.style.padding = '20px 24px';
    epubEl.style.overflowY = 'auto';
    epubEl.style.webkitOverflowScrolling = 'touch';
    epubEl.style.maxHeight = `calc(100vh - ${isMobile ? 130 : 110}px)`;
    epubEl.style.background = 'var(--bg2)';

    renderEpubChapter(0);

    // Override changePage
    window.changePage = async (delta) => {
      const next = epubCurrentChapter + delta;
      if (next < 0 || next >= epubChapters.length) return;
      epubCurrentChapter = next;
      renderEpubChapter(epubCurrentChapter);
      document.getElementById('readerContainer').scrollTo({ top: 0, behavior: 'smooth' });
      epubEl.scrollTo({ top: 0, behavior: 'smooth' });
    };

    // Wire mobile buttons
    const mPrev = document.getElementById('mobilePrevBtn');
    const mNext = document.getElementById('mobileNextBtn');
    if (mPrev) { mPrev.disabled = false; mPrev.onclick = () => changePage(-1); }
    if (mNext) { mNext.disabled = false; mNext.onclick = () => changePage(1); }
    document.getElementById('prevPage').disabled = false;
    document.getElementById('nextPage').disabled = false;

  } catch(err) {
    console.error('EPUB error:', err);
    showDownloadOption(url);
  }
}

function renderEpubChapter(index) {
  const epubEl = document.getElementById('epubReader');
  const isLight = document.body.classList.contains('light-mode');

  epubEl.innerHTML = `
    <div style="
      max-width: 680px;
      margin: 0 auto;
      font-family: var(--font-body);
      font-size: ${isMobile ? '1rem' : '0.95rem'};
      line-height: 1.9;
      color: var(--text);
    ">
      ${epubChapters[index]}
    </div>`;

  // Fix images inside epub
  epubEl.querySelectorAll('img').forEach(img => {
    img.style.maxWidth = '100%';
    img.style.height = 'auto';
    img.style.borderRadius = '6px';
  });

  currentPage = index + 1;
  const pageText = `${currentPage} / ${totalPages}`;
  document.getElementById('pageInfo').textContent = `Chapter ${pageText}`;
  document.getElementById('mobilePageInfo').textContent = pageText;

  // Update nav buttons
  document.getElementById('prevPage').disabled = index <= 0;
  document.getElementById('nextPage').disabled = index >= totalPages - 1;
  const mPrev = document.getElementById('mobilePrevBtn');
  const mNext = document.getElementById('mobileNextBtn');
  if (mPrev) mPrev.disabled = index <= 0;
  if (mNext) mNext.disabled = index >= totalPages - 1;
}

// ── TXT Reader ─────────────────────────────────────────────────
async function openTXT(url) {
  try {
    const r = await fetch(url);
    const text = await r.text();
    document.getElementById('readerLoading').style.display = 'none';
    const epubEl = document.getElementById('epubReader');
    epubEl.style.display = 'block';
    epubEl.innerHTML = `<pre style="white-space:pre-wrap; font-family:var(--font-body); line-height:1.9; font-size:1rem; color:var(--text);">${text.replace(/&/g,'&amp;').replace(/</g,'&lt;')}</pre>`;
    document.getElementById('mobilePageInfo').textContent = 'TXT';
    document.getElementById('pageInfo').textContent = 'Text File';
  } catch(err) {
    showDownloadOption(url);
  }
}

function showDownloadOption(url) {
  document.getElementById('readerLoading').style.display = 'flex';
  document.getElementById('readerLoading').innerHTML = `
    <div style="text-align:center">
      <div style="font-size:3rem; margin-bottom:16px">📄</div>
      <h3 style="margin-bottom:8px">Preview not available</h3>
      <p style="color:var(--text2); margin-bottom:20px">Download karke padho.</p>
      <a href="${url}" target="_blank" class="btn btn-primary">⬇️ Download</a>
    </div>`;
}

// ── Swipe Navigation ─────────────────────────────────────────
document.addEventListener('touchstart', e => {
  touchStartX = e.touches[0].clientX;
  touchStartY = e.touches[0].clientY;
}, { passive: true });

document.addEventListener('touchend', e => {
  if (document.getElementById('readerView').style.display === 'none') return;
  const dx = e.changedTouches[0].clientX - touchStartX;
  const dy = e.changedTouches[0].clientY - touchStartY;
  // Only horizontal swipe (not scroll)
  if (Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > 60) {
    if (dx < 0) changePage(1);   // swipe left = next
    else        changePage(-1);  // swipe right = prev
  }
}, { passive: true });

// ── Keyboard ──────────────────────────────────────────────────
document.addEventListener('keydown', e => {
  if (document.getElementById('readerView').style.display === 'none') return;
  if (e.key === 'ArrowRight' || e.key === 'ArrowDown') changePage(1);
  if (e.key === 'ArrowLeft'  || e.key === 'ArrowUp')   changePage(-1);
  if (e.key === 'Escape') closeReader();
  if (e.key === '+' || e.key === '=') changeZoom(0.15);
  if (e.key === '-') changeZoom(-0.15);
});

function closeReader() {
  pdfDoc = null; currentPage = 1; totalPages = 1; currentBook = null; isRendering = false;
  const canvas = document.getElementById('pdfCanvas');
  canvas.getContext('2d').clearRect(0, 0, canvas.width, canvas.height);
  document.getElementById('epubReader').innerHTML = '';
  document.getElementById('epubReader').style.display = 'none';
  showLibrary();
}
