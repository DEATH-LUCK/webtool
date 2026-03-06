// ============================================================
// READER.JS — PDF & EPUB Reader (Cloudinary compatible)
// ============================================================

let pdfDoc       = null;
let currentPage  = 1;
let totalPages   = 1;
let currentZoom  = 1.0;
let isRendering  = false;
let currentBook  = null;

async function openReader(book) {
  currentBook = book;
  currentPage = 1;
  currentZoom = 1.0;

  document.getElementById('readerTitle').textContent = book.title;
  document.getElementById('readerLoading').style.display = 'flex';
  document.getElementById('readerLoading').innerHTML = '<div class="spinner"></div><p>Loading document...</p>';
  document.getElementById('pdfCanvas').style.display = 'none';
  document.getElementById('epubReader').style.display = 'none';
  document.getElementById('pageInfo').textContent = 'Loading...';

  if (book.fileType === 'pdf') {
    await openPDF(book.downloadUrl);
  } else if (book.fileType === 'txt') {
    await openTXT(book.downloadUrl);
  } else {
    document.getElementById('readerLoading').innerHTML = `
      <div style="text-align:center">
        <div style="font-size:3rem; margin-bottom:16px">📁</div>
        <h3 style="margin-bottom:8px">Preview not available</h3>
        <p style="color:var(--text2); margin-bottom:20px">This file type cannot be previewed.</p>
        <a href="${book.downloadUrl}" target="_blank" class="btn btn-primary">⬇️ Download File</a>
      </div>`;
  }
}

async function openPDF(url) {
  try {
    pdfjsLib.GlobalWorkerOptions.workerSrc =
      'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

    // Use Google's PDF proxy to bypass CORS
    const proxyUrl = 'https://corsproxy.io/?' + encodeURIComponent(url);

    const loadingTask = pdfjsLib.getDocument({
      url: proxyUrl,
      withCredentials: false,
    });

    pdfDoc = await loadingTask.promise;
    totalPages = pdfDoc.numPages;

    document.getElementById('readerLoading').style.display = 'none';
    document.getElementById('pdfCanvas').style.display = 'block';

    await renderPage(currentPage);
    updateNavButtons();
  } catch (err) {
    console.error('PDF load error:', err);
    // Try direct URL as fallback
    try {
      pdfDoc = await pdfjsLib.getDocument(url).promise;
      totalPages = pdfDoc.numPages;
      document.getElementById('readerLoading').style.display = 'none';
      document.getElementById('pdfCanvas').style.display = 'block';
      await renderPage(currentPage);
      updateNavButtons();
    } catch(err2) {
      document.getElementById('readerLoading').innerHTML = `
        <div style="text-align:center">
          <div style="font-size:2.5rem; margin-bottom:12px">⚠️</div>
          <p style="margin-bottom:16px; color:var(--text2)">PDF browser mein load nahi ho saka.</p>
          <a href="${currentBook?.downloadUrl}" target="_blank" class="btn btn-primary">⬇️ Download PDF</a>
        </div>`;
    }
  }
}

async function renderPage(pageNum) {
  if (isRendering || !pdfDoc) return;
  isRendering = true;

  try {
    const page = await pdfDoc.getPage(pageNum);
    const canvas = document.getElementById('pdfCanvas');
    const ctx = canvas.getContext('2d');

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
    document.getElementById('readerContainer').scrollTo({ top: 0, behavior: 'smooth' });
  } finally {
    isRendering = false;
  }
}

async function changePage(delta) {
  const newPage = currentPage + delta;
  if (newPage < 1 || newPage > totalPages) return;
  await renderPage(newPage);
}

function updateNavButtons() {
  document.getElementById('prevPage').disabled = currentPage <= 1;
  document.getElementById('nextPage').disabled = currentPage >= totalPages;
}

async function changeZoom(delta) {
  currentZoom = Math.max(0.4, Math.min(3.0, currentZoom + delta));
  if (pdfDoc) await renderPage(currentPage);
}

async function openTXT(url) {
  try {
    const proxyUrl = 'https://corsproxy.io/?' + encodeURIComponent(url);
    let text = '';
    try {
      const r = await fetch(proxyUrl);
      text = await r.text();
    } catch(e) {
      const r = await fetch(url);
      text = await r.text();
    }

    document.getElementById('readerLoading').style.display = 'none';
    const epubEl = document.getElementById('epubReader');
    epubEl.style.display = 'block';

    const chunkSize = 3000;
    const chunks = [];
    for (let i = 0; i < text.length; i += chunkSize) chunks.push(text.slice(i, i + chunkSize));
    totalPages = chunks.length || 1;
    currentPage = 1;

    function renderChunk() {
      epubEl.innerHTML = `<pre style="white-space:pre-wrap; font-family:var(--font-body); line-height:1.8; font-size:0.95rem; color:var(--text);">${escapeHtmlReader(chunks[currentPage-1] || '')}</pre>`;
      document.getElementById('pageInfo').textContent = `Page ${currentPage} / ${totalPages}`;
      updateNavButtons();
    }

    window.changePage = async (delta) => {
      const newPage = currentPage + delta;
      if (newPage < 1 || newPage > totalPages) return;
      currentPage = newPage;
      renderChunk();
      document.getElementById('readerContainer').scrollTo({ top: 0, behavior: 'smooth' });
    };
    renderChunk();
  } catch(err) {
    document.getElementById('readerLoading').innerHTML = `<p style="color:var(--danger)">Error loading file.</p>`;
  }
}

function escapeHtmlReader(str) {
  return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

function closeReader() {
  pdfDoc = null; currentPage = 1; totalPages = 1; currentBook = null; isRendering = false;
  const canvas = document.getElementById('pdfCanvas');
  canvas.getContext('2d').clearRect(0, 0, canvas.width, canvas.height);
  document.getElementById('epubReader').innerHTML = '';
  document.getElementById('epubReader').style.display = 'none';
  showLibrary();
}

document.addEventListener('keydown', (e) => {
  if (document.getElementById('readerView').style.display === 'none') return;
  if (e.key === 'ArrowRight' || e.key === 'ArrowDown') changePage(1);
  if (e.key === 'ArrowLeft'  || e.key === 'ArrowUp')   changePage(-1);
  if (e.key === 'Escape') closeReader();
  if (e.key === '+' || e.key === '=') changeZoom(0.15);
  if (e.key === '-') changeZoom(-0.15);
});
