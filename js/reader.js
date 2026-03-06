// ============================================================
// READER.JS — PDF & EPUB Reader with Page Navigation & Zoom
// ============================================================

let pdfDoc       = null;
let currentPage  = 1;
let totalPages   = 1;
let currentZoom  = 1.0;
let isRendering  = false;
let currentBook  = null;

// ── Open Reader ───────────────────────────────────────────────
async function openReader(book) {
  currentBook = book;
  currentPage = 1;
  currentZoom = 1.0;

  document.getElementById('readerTitle').textContent = book.title;
  document.getElementById('readerLoading').style.display = 'flex';
  document.getElementById('pdfCanvas').style.display = 'none';
  document.getElementById('epubReader').style.display = 'none';
  document.getElementById('pageInfo').textContent = 'Loading...';

  if (book.fileType === 'pdf') {
    await openPDF(book.downloadUrl);
  } else if (book.fileType === 'epub') {
    await openEPUB(book.downloadUrl);
  } else if (book.fileType === 'txt') {
    await openTXT(book.downloadUrl);
  } else {
    // For unsupported types, offer download
    document.getElementById('readerLoading').innerHTML = `
      <div style="text-align:center">
        <div style="font-size:3rem; margin-bottom:16px">📁</div>
        <h3 style="margin-bottom:8px">Preview not available</h3>
        <p style="color:var(--text2); margin-bottom:20px">This file type cannot be previewed in the browser.</p>
        <a href="${book.downloadUrl}" target="_blank" class="btn btn-primary" download>
          ⬇️ Download File
        </a>
      </div>`;
    document.getElementById('readerLoading').style.display = 'flex';
  }
}

// ── PDF Reader ────────────────────────────────────────────────
async function openPDF(url) {
  try {
    pdfjsLib.GlobalWorkerOptions.workerSrc =
      'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

    pdfDoc = await pdfjsLib.getDocument(url).promise;
    totalPages = pdfDoc.numPages;

    document.getElementById('readerLoading').style.display = 'none';
    document.getElementById('pdfCanvas').style.display = 'block';

    await renderPage(currentPage);
    updateNavButtons();
  } catch (err) {
    console.error('PDF load error:', err);
    document.getElementById('readerLoading').innerHTML = `
      <div style="text-align:center; color:var(--danger)">
        <div style="font-size:2.5rem; margin-bottom:12px">⚠️</div>
        <p>Failed to load PDF. <a href="${currentBook?.downloadUrl}" target="_blank" style="color:var(--amber)">Download instead?</a></p>
      </div>`;
  }
}

async function renderPage(pageNum) {
  if (isRendering || !pdfDoc) return;
  isRendering = true;

  try {
    const page = await pdfDoc.getPage(pageNum);
    const canvas = document.getElementById('pdfCanvas');
    const ctx = canvas.getContext('2d');

    // Calculate scale to fit container width
    const container = document.getElementById('readerContainer');
    const maxWidth = Math.min(container.clientWidth - 48, 900);
    const baseViewport = page.getViewport({ scale: 1 });
    const scale = Math.min(currentZoom, (maxWidth / baseViewport.width) * currentZoom);
    const viewport = page.getViewport({ scale });

    canvas.width = viewport.width;
    canvas.height = viewport.height;

    await page.render({ canvasContext: ctx, viewport }).promise;

    currentPage = pageNum;
    document.getElementById('pageInfo').textContent = `Page ${currentPage} / ${totalPages}`;
    document.getElementById('zoomInfo').textContent = `${Math.round(currentZoom * 100)}%`;
    updateNavButtons();

    // Scroll to top of reader
    document.getElementById('readerContainer').scrollTo({ top: 0, behavior: 'smooth' });

  } finally {
    isRendering = false;
  }
}

// ── Page Navigation ───────────────────────────────────────────
async function changePage(delta) {
  const newPage = currentPage + delta;
  if (newPage < 1 || newPage > totalPages) return;
  await renderPage(newPage);
}

function updateNavButtons() {
  document.getElementById('prevPage').disabled = currentPage <= 1;
  document.getElementById('nextPage').disabled = currentPage >= totalPages;
}

// ── Zoom ──────────────────────────────────────────────────────
async function changeZoom(delta) {
  currentZoom = Math.max(0.4, Math.min(3.0, currentZoom + delta));
  if (pdfDoc) await renderPage(currentPage);
}

// ── EPUB Reader (basic) ───────────────────────────────────────
async function openEPUB(url) {
  const epubEl = document.getElementById('epubReader');
  document.getElementById('readerLoading').style.display = 'none';
  epubEl.style.display = 'block';

  epubEl.innerHTML = `
    <div style="text-align:center; color:var(--text2);">
      <div style="font-size:2.5rem; margin-bottom:12px">📗</div>
      <h3 style="margin-bottom:8px; color:var(--text)">EPUB Reader</h3>
      <p style="margin-bottom:20px;">
        For the best EPUB reading experience, download the file and open it in your preferred reader app.
      </p>
      <a href="${url}" target="_blank" class="btn btn-primary" download>
        ⬇️ Download EPUB
      </a>
    </div>`;
  document.getElementById('pageInfo').textContent = 'EPUB';
}

// ── TXT Reader ────────────────────────────────────────────────
async function openTXT(url) {
  try {
    const response = await fetch(url);
    const text = await response.text();

    document.getElementById('readerLoading').style.display = 'none';
    const epubEl = document.getElementById('epubReader');
    epubEl.style.display = 'block';

    // Split into chunks of ~3000 chars per "page"
    const chunkSize = 3000;
    const chunks = [];
    for (let i = 0; i < text.length; i += chunkSize) {
      chunks.push(text.slice(i, i + chunkSize));
    }

    totalPages = chunks.length || 1;
    currentPage = 1;

    function renderChunk() {
      epubEl.innerHTML = `<pre style="white-space:pre-wrap; font-family:var(--font-body); line-height:1.8; font-size:0.95rem; color:var(--text);">${escapeHtml(chunks[currentPage - 1] || '')}</pre>`;
      document.getElementById('pageInfo').textContent = `Page ${currentPage} / ${totalPages}`;
      updateNavButtons();
    }

    // Override changePage for TXT
    window._originalChangePage = changePage;
    window.changePage = async (delta) => {
      const newPage = currentPage + delta;
      if (newPage < 1 || newPage > totalPages) return;
      currentPage = newPage;
      renderChunk();
      document.getElementById('readerContainer').scrollTo({ top: 0, behavior: 'smooth' });
    };

    renderChunk();
    updateNavButtons();

  } catch (err) {
    document.getElementById('readerLoading').innerHTML = `<p style="color:var(--danger)">Error loading text file.</p>`;
  }
}

// ── Close Reader ──────────────────────────────────────────────
function closeReader() {
  // Cleanup
  pdfDoc = null;
  currentPage = 1;
  totalPages = 1;
  currentBook = null;
  isRendering = false;

  // Reset canvas
  const canvas = document.getElementById('pdfCanvas');
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // Reset epub reader
  document.getElementById('epubReader').innerHTML = '';
  document.getElementById('epubReader').style.display = 'none';

  // Restore original changePage if overridden
  if (window._originalChangePage) {
    window.changePage = window._originalChangePage;
    delete window._originalChangePage;
  }

  showLibrary();
}

// ── Keyboard Shortcuts ────────────────────────────────────────
document.addEventListener('keydown', (e) => {
  if (document.getElementById('readerView').style.display === 'none') return;
  if (e.key === 'ArrowRight' || e.key === 'ArrowDown') changePage(1);
  if (e.key === 'ArrowLeft'  || e.key === 'ArrowUp')   changePage(-1);
  if (e.key === 'Escape') closeReader();
  if (e.key === '+' || e.key === '=') changeZoom(0.15);
  if (e.key === '-') changeZoom(-0.15);
});
