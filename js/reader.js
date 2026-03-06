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


// ── EPUB Reader ───────────────────────────────────────────────
let epubBook = null;
let epubRendition = null;

async function openEPUB(url) {
  try {
    document.getElementById('readerLoading').style.display = 'none';
    const epubEl = document.getElementById('epubReader');
    epubEl.style.display = 'block';
    epubEl.style.padding = '0';
    epubEl.style.background = 'transparent';
    epubEl.style.width = '100%';
    epubEl.style.height = 'calc(100vh - 120px)';
    epubEl.style.overflowY = 'auto';
    epubEl.style.webkitOverflowScrolling = 'touch';

    // Destroy previous instance
    if (epubRendition) { epubRendition.destroy(); epubRendition = null; }
    if (epubBook) { epubBook.destroy(); epubBook = null; }

    epubBook = ePub(url);
    const readerH = window.innerHeight - (isMobile ? 140 : 120);
    epubRendition = epubBook.renderTo('epubReader', {
      width: '100%',
      height: readerH,
      spread: 'none',
      flow: 'scrolled-doc',
      allowScriptedContent: true,
      manager: 'continuous',
    });

    await epubRendition.display();

    // Style the epub content
    epubRendition.themes.default({
      body: {
        'font-family': "'DM Sans', sans-serif !important",
        'line-height': '1.8 !important',
        'font-size': isMobile ? '1rem !important' : '0.95rem !important',
        'color': document.body.classList.contains('light-mode') ? '#1a1612 !important' : '#e8e0d0 !important',
        'background': document.body.classList.contains('light-mode') ? '#f5f0e8 !important' : '#141210 !important',
        'padding': '20px !important',
      }
    });

    // Page tracking
    epubBook.ready.then(() => {
      totalPages = epubBook.spine ? epubBook.spine.length : 1;
      document.getElementById('pageInfo').textContent = `Chapter 1 / ${totalPages}`;
      document.getElementById('mobilePageInfo').textContent = `1/${totalPages}`;
      updateNavButtons();
    });

    epubRendition.on('relocated', (location) => {
      const current = location.start.index + 1;
      document.getElementById('pageInfo').textContent = `Chapter ${current} / ${totalPages}`;
      document.getElementById('mobilePageInfo').textContent = `${current}/${totalPages}`;
      currentPage = current;
      updateNavButtons();
    });

    // Override changePage for EPUB — works for ALL buttons
    window.changePage = async (delta) => {
      if (!epubRendition) return;
      if (delta > 0) await epubRendition.next();
      else await epubRendition.prev();
    };

    // Also wire mobile buttons directly
    const mPrev = document.getElementById('mobilePrevBtn');
    const mNext = document.getElementById('mobileNextBtn');
    if (mPrev) mPrev.onclick = () => epubRendition?.prev();
    if (mNext) mNext.onclick = () => epubRendition?.next();

    // Enable nav buttons for EPUB
    if (mPrev) mPrev.disabled = false;
    if (mNext) mNext.disabled = false;
    document.getElementById('prevPage').disabled = false;
    document.getElementById('nextPage').disabled = false;

    document.getElementById('pageInfo').textContent = 'EPUB Loading...';

  } catch(err) {
    console.error('EPUB error:', err);
    showDownloadOption(url);
  }
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
