// ============================================================
// UPLOAD.JS — Cloudinary File Upload
// ============================================================
const CLOUDINARY_CLOUD  = 'dsnau7xlr';
const CLOUDINARY_PRESET = 'ml_library';

let selectedFile = null;

function openUploadModal() {
  if (currentRole !== 'admin') { showToast('Admins only.', 'error'); return; }
  resetUploadForm();
  loadFoldersIntoSelect();
  document.getElementById('uploadModal').classList.add('open');
}
function closeUploadModal() {
  document.getElementById('uploadModal').classList.remove('open');
  resetUploadForm();
}
function resetUploadForm() {
  selectedFile = null;

  // FIX: clear fileInput so same file can be re-selected after cancel
  const fi = document.getElementById('fileInput');
  if (fi) fi.value = '';

  document.getElementById('bookTitle').value  = '';
  document.getElementById('bookAuthor').value = '';
  document.getElementById('bookFolder').value = 'General';

  const nfi = document.getElementById('uploadNewFolderInput');
  if (nfi) { nfi.style.display = 'none'; nfi.value = ''; }

  const fc = document.getElementById('fileChosen');
  if (fc) { fc.style.display = 'none'; fc.textContent = ''; }

  const up = document.getElementById('uploadProgress');
  if (up) up.style.display = 'none';

  const pb = document.getElementById('progressBar');
  if (pb) pb.style.width = '0%';

  const btn = document.getElementById('uploadSubmitBtn');
  if (btn) { btn.disabled = false; btn.textContent = 'Upload'; }
}

async function loadFoldersIntoSelect() {
  const select   = document.getElementById('bookFolder');
  const defaults = ['General','Fiction','Non-Fiction','Science','History','Technology','Education','Religion'];

  select.innerHTML = defaults.map(f => '<option value="' + f + '">📁 ' + f + '</option>').join('');

  try {
    const snap = await db.collection('folders').get();
    snap.docs.forEach(doc => {
      if (!defaults.includes(doc.id)) {
        const opt = document.createElement('option');
        opt.value = doc.id; opt.textContent = '📁 ' + doc.id;
        select.appendChild(opt);
      }
    });
    const bSnap = await db.collection('books').get();
    const bookFolders = [...new Set(bSnap.docs.map(d => d.data().category).filter(Boolean))];
    bookFolders.forEach(f => {
      if (!defaults.includes(f) && !Array.from(select.options).some(o => o.value === f)) {
        const opt = document.createElement('option');
        opt.value = f; opt.textContent = '📁 ' + f;
        select.appendChild(opt);
      }
    });
  } catch(e) {}

  const newOpt = document.createElement('option');
  newOpt.value = '__new__'; newOpt.textContent = '➕ New Folder...';
  select.appendChild(newOpt);
}

function onFolderChange(select) {
  const input = document.getElementById('uploadNewFolderInput');
  if (!input) return;
  input.style.display = select.value === '__new__' ? 'block' : 'none';
  if (select.value === '__new__') input.focus();
}

// ── Drag & Drop ───────────────────────────────────────────────
function handleDragOver(e)  { e.preventDefault(); document.getElementById('dropzone').classList.add('drag-over'); }
function handleDragLeave(e) { document.getElementById('dropzone').classList.remove('drag-over'); }
function handleDrop(e) {
  e.preventDefault();
  document.getElementById('dropzone').classList.remove('drag-over');
  if (e.dataTransfer.files.length > 0) processFile(e.dataTransfer.files[0]);
}
function handleFileSelect(e) { if (e.target.files.length > 0) processFile(e.target.files[0]); }

function processFile(file) {
  if (!file.name.match(/\.(pdf|epub|txt|doc|docx)$/i)) { showToast('Unsupported file type.', 'error'); return; }
  if (file.size > 50 * 1024 * 1024) { showToast('File too large. Max 50MB.', 'error'); return; }
  selectedFile = file;
  const fc = document.getElementById('fileChosen');
  fc.textContent  = '✅ ' + file.name + ' (' + formatSize(file.size) + ')';
  fc.style.display = 'block';
  const titleEl = document.getElementById('bookTitle');
  if (!titleEl.value) {
    titleEl.value = capitalizeWords(file.name.replace(/\.[^/.]+$/, '').replace(/[-_]/g, ' '));
  }
}

// ── Upload ────────────────────────────────────────────────────
async function uploadBook() {
  if (!selectedFile) { showToast('Please select a file.', 'error'); return; }
  const title = document.getElementById('bookTitle').value.trim();
  if (!title) { showToast('Please enter a title.', 'error'); return; }

  const author       = document.getElementById('bookAuthor').value.trim();
  const folderSelect = document.getElementById('bookFolder').value;
  const newFolderVal = (document.getElementById('uploadNewFolderInput')?.value || '').trim();
  const category     = folderSelect === '__new__' ? (newFolderVal || 'General') : folderSelect;
  const fileType     = selectedFile.name.split('.').pop().toLowerCase();
  const btn          = document.getElementById('uploadSubmitBtn');

  btn.disabled = true; btn.textContent = 'Uploading...';
  document.getElementById('uploadProgress').style.display = 'block';
  document.getElementById('progressText').textContent     = 'Uploading file...';

  try {
    const fileUrl = await uploadToCloudinary(selectedFile, 'books', (pct) => {
      document.getElementById('progressBar').style.width     = pct + '%';
      document.getElementById('progressPercent').textContent = pct + '%';
    });

    // Generate thumbnail for PDF or EPUB
    let coverUrl = null;
    if (fileType === 'pdf' || fileType === 'epub') {
      document.getElementById('progressText').textContent = 'Generating cover...';
      document.getElementById('progressBar').style.width  = '93%';
      let thumbFile = null;
      if (fileType === 'pdf') {
        thumbFile = await generatePdfThumbnail(selectedFile);
      } else if (fileType === 'epub') {
        thumbFile = await generateEpubCover(selectedFile);
      }
      if (thumbFile) {
        document.getElementById('progressText').textContent = 'Uploading cover...';
        coverUrl = await uploadThumbnail(thumbFile);
      }
    }

    document.getElementById('progressText').textContent = 'Saving to database...';
    document.getElementById('progressBar').style.width  = '97%';

    if (folderSelect === '__new__' && newFolderVal) {
      await db.collection('folders').doc(newFolderVal).set({
        name: newFolderVal,
        createdAt: firebase.firestore.FieldValue.serverTimestamp()
      }).catch(() => {});
    }

    await db.collection('books').add({
      title,
      author:      author || null,
      category,
      fileType,
      fileSize:    selectedFile.size,
      downloadUrl: fileUrl,
      uploadedBy:  currentUser.uid,
      uploadedAt:  firebase.firestore.FieldValue.serverTimestamp(),
      coverUrl,
    });

    document.getElementById('progressBar').style.width = '100%';
    showToast('"' + title + '" uploaded successfully!', 'success');
    closeUploadModal();
    await loadBooks();
  } catch(err) {
    showToast('Upload failed: ' + err.message, 'error');
    btn.disabled = false; btn.textContent = 'Upload';
  }
}

// ── Thumbnail Generation ──────────────────────────────────────
async function generatePdfThumbnail(file) {
  try {
    if (typeof pdfjsLib === 'undefined') return null;
    pdfjsLib.GlobalWorkerOptions.workerSrc =
      'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

    const arrayBuffer = await file.arrayBuffer();
    const pdf         = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    const page        = await pdf.getPage(1);

    // Render at 200px wide (good thumbnail size)
    const viewport = page.getViewport({ scale: 1 });
    const scale    = 200 / viewport.width;
    const scaled   = page.getViewport({ scale });

    const canvas  = document.createElement('canvas');
    canvas.width  = scaled.width;
    canvas.height = scaled.height;
    const ctx     = canvas.getContext('2d');

    await page.render({ canvasContext: ctx, viewport: scaled }).promise;

    // Canvas → Blob → File
    return await new Promise(resolve => {
      canvas.toBlob(blob => {
        if (!blob) { resolve(null); return; }
        resolve(new File([blob], 'cover.jpg', { type: 'image/jpeg' }));
      }, 'image/jpeg', 0.85);
    });
  } catch(e) {
    console.warn('Thumbnail generation failed:', e.message);
    return null;
  }
}


// ── EPUB Cover Extraction ─────────────────────────────────────
async function generateEpubCover(file) {
  try {
    // Try to extract cover image from EPUB (which is a ZIP)
    if (typeof JSZip === 'undefined') return await _makeTextCover(file.name);

    const zip  = await JSZip.loadAsync(file);
    const files = Object.keys(zip.files);

    // Common cover image paths inside EPUBs
    const coverPatterns = [
      /cover\.(jpg|jpeg|png|webp)/i,
      /images\/cover/i,
      /OEBPS\/Images\/cover/i,
      /EPUB\/images\/cover/i,
    ];

    let coverEntry = null;
    for (const pattern of coverPatterns) {
      coverEntry = files.find(f => pattern.test(f));
      if (coverEntry) break;
    }

    // Fallback: find any image in the zip
    if (!coverEntry) {
      coverEntry = files.find(f => /\.(jpg|jpeg|png)$/i.test(f) && !/__MACOSX/.test(f));
    }

    if (coverEntry) {
      const blob = await zip.files[coverEntry].async('blob');
      return new File([blob], 'cover.jpg', { type: 'image/jpeg' });
    }

    // No image found → generate a text-based cover
    return await _makeTextCover(file.name);
  } catch(e) {
    console.warn('EPUB cover extraction failed:', e.message);
    return null;
  }
}

// Generate a stylish text-based cover when no image is available
async function _makeTextCover(fileName) {
  try {
    const canvas  = document.createElement('canvas');
    canvas.width  = 200;
    canvas.height = 280;
    const ctx     = canvas.getContext('2d');

    // Background gradient
    const grad = ctx.createLinearGradient(0, 0, 0, 280);
    grad.addColorStop(0, '#1a1208');
    grad.addColorStop(1, '#0d0a04');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 200, 280);

    // Amber spine line
    ctx.fillStyle = '#c8902a';
    ctx.fillRect(0, 0, 4, 280);

    // Title text
    const title = fileName.replace(/\.[^/.]+$/, '').replace(/[-_]/g, ' ');
    ctx.fillStyle = '#e8d5a3';
    ctx.font = 'bold 16px serif';
    ctx.textAlign = 'center';
    // Word wrap
    const words = title.split(' ');
    let line = '', y = 120, lines = [];
    for (const w of words) {
      const test = line + (line ? ' ' : '') + w;
      if (ctx.measureText(test).width > 160 && line) { lines.push(line); line = w; }
      else line = test;
    }
    lines.push(line);
    const startY = 140 - (lines.length * 20) / 2;
    lines.forEach((l, i) => ctx.fillText(l, 100, startY + i * 22));

    // Decorative line
    ctx.strokeStyle = '#c8902a';
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(30, startY - 14); ctx.lineTo(170, startY - 14); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(30, startY + lines.length * 22 + 4); ctx.lineTo(170, startY + lines.length * 22 + 4); ctx.stroke();

    return await new Promise(resolve => {
      canvas.toBlob(blob => resolve(blob ? new File([blob], 'cover.jpg', { type: 'image/jpeg' }) : null), 'image/jpeg', 0.85);
    });
  } catch(e) { return null; }
}

async function uploadThumbnail(imageFile) {
  if (!imageFile) return null;
  try {
    const fd = new FormData();
    fd.append('file', imageFile);
    fd.append('upload_preset', CLOUDINARY_PRESET);
    fd.append('folder', 'covers');
    const res  = await fetch('https://api.cloudinary.com/v1_1/' + CLOUDINARY_CLOUD + '/image/upload', {
      method: 'POST', body: fd
    });
    const data = await res.json();
    return data.secure_url || null;
  } catch(e) {
    console.warn('Cover upload failed:', e.message);
    return null;
  }
}

function uploadToCloudinary(file, folder, onProgress) {
  return new Promise((resolve, reject) => {
    const fd = new FormData();
    fd.append('file', file);
    fd.append('upload_preset', CLOUDINARY_PRESET);
    fd.append('folder', folder);
    const xhr = new XMLHttpRequest();
    xhr.open('POST', 'https://api.cloudinary.com/v1_1/' + CLOUDINARY_CLOUD + '/raw/upload');
    xhr.upload.onprogress = (e) => { if (e.lengthComputable) onProgress(Math.round(e.loaded/e.total*90)); };
    xhr.onload = () => {
      if (xhr.status === 200) {
        try { resolve(JSON.parse(xhr.responseText).secure_url); }
        catch(e) { reject(new Error('Invalid response from Cloudinary')); }
      } else {
        try { reject(new Error(JSON.parse(xhr.responseText).error?.message || 'Upload failed')); }
        catch(e) { reject(new Error('Upload failed (status ' + xhr.status + ')')); }
      }
    };
    xhr.onerror = () => reject(new Error('Network error'));
    xhr.send(fd);
  });
}

function formatSize(b) {
  if (b < 1024)    return b + ' B';
  if (b < 1048576) return (b/1024).toFixed(1) + ' KB';
  return (b/1048576).toFixed(1) + ' MB';
}
function capitalizeWords(s) { return s.replace(/\b\w/g, c => c.toUpperCase()); }

// ════════════════════════════════════════════════
// BULK UPLOAD
// ════════════════════════════════════════════════
let bulkFiles = [];

function openBulkUpload() {
  if (currentRole !== 'admin') { showToast('Admins only.', 'error'); return; }
  bulkFiles = [];
  document.getElementById('bulkModal').classList.add('open');
  document.getElementById('bulkFileInput').value = '';
  document.getElementById('bulkFileList').innerHTML = '';
  document.getElementById('bulkProgressWrap').style.display = 'none';
  loadFoldersIntoBulkSelect();
}
function closeBulkModal() {
  document.getElementById('bulkModal').classList.remove('open');
  bulkFiles = [];
}

async function loadFoldersIntoBulkSelect() {
  const sel = document.getElementById('bulkFolder');
  sel.innerHTML = '';
  const defaults = ['General','Fiction','Non-Fiction','Science','History','Technology','Education','Religion'];
  defaults.forEach(f => {
    const o = document.createElement('option'); o.value = f; o.textContent = '📁 ' + f; sel.appendChild(o);
  });
  try {
    const snap = await db.collection('folders').get();
    snap.docs.forEach(doc => {
      if (!defaults.includes(doc.id)) {
        const o = document.createElement('option'); o.value = doc.id; o.textContent = '📁 ' + doc.id; sel.appendChild(o);
      }
    });
  } catch(e) {}
}

function handleBulkFileSelect(e) {
  const files = Array.from(e.target.files);
  bulkFiles = files.filter(f => f.name.match(/\.(pdf|epub|txt|doc|docx)$/i) && f.size <= 50*1024*1024);
  const rejected = files.length - bulkFiles.length;
  renderBulkFileList();
  if (rejected) showToast(rejected + ' file(s) rejected (unsupported or >50MB)', 'error');
}

function renderBulkFileList() {
  const el = document.getElementById('bulkFileList');
  el.innerHTML = '';
  if (!bulkFiles.length) { el.innerHTML = '<p class="muted" style="font-size:.8rem">No files selected.</p>'; return; }
  bulkFiles.forEach((f, i) => {
    const row = document.createElement('div');
    row.className = 'bulk-file-row';
    row.innerHTML =
      '<span class="bulk-file-icon">' + _getIcon(f.name.split('.').pop().toLowerCase()) + '</span>' +
      '<div class="bulk-file-info">' +
        '<input type="text" class="bulk-title-input" value="' + escapeHtml(_cleanName(f.name)) + '" placeholder="Title">' +
        '<span class="bulk-file-size">' + formatSize(f.size) + '</span>' +
      '</div>' +
      '<button class="btn btn-sm btn-ghost bulk-remove-btn" onclick="removeBulkFile(' + i + ')">✕</button>';
    el.appendChild(row);
  });
  document.getElementById('bulkSubmitBtn').textContent = 'Upload ' + bulkFiles.length + ' File' + (bulkFiles.length !== 1 ? 's' : '');
}

function removeBulkFile(i) {
  bulkFiles.splice(i, 1);
  renderBulkFileList();
}

async function startBulkUpload() {
  if (!bulkFiles.length) { showToast('Select files first.', 'error'); return; }
  const folder  = document.getElementById('bulkFolder').value;
  const titles  = Array.from(document.querySelectorAll('.bulk-title-input')).map(i => i.value.trim());
  const progWrap = document.getElementById('bulkProgressWrap');
  const progBar  = document.getElementById('bulkProgressBar');
  const progText = document.getElementById('bulkProgressText');
  const btn      = document.getElementById('bulkSubmitBtn');

  btn.disabled = true;
  progWrap.style.display = 'block';

  let done = 0;
  const total = bulkFiles.length;
  const errors = [];

  for (let i = 0; i < total; i++) {
    const file = bulkFiles[i];
    const title = titles[i] || _cleanName(file.name);
    progText.textContent = 'Uploading ' + (i+1) + ' / ' + total + ': ' + title;
    progBar.style.width = Math.round((i / total) * 100) + '%';
    try {
      const url = await uploadToCloudinary(file, 'books', () => {});
      const ft2 = file.name.split('.').pop().toLowerCase();
      let coverUrl2 = null;
      if (ft2 === 'pdf') {
        progText.textContent = 'Generating cover for: ' + title;
        const thumbFile = await generatePdfThumbnail(file);
        if (thumbFile) coverUrl2 = await uploadThumbnail(thumbFile);
      }
      await db.collection('books').add({
        title, author: null, category: folder,
        fileType: ft2, fileSize: file.size, downloadUrl: url,
        uploadedBy: currentUser.uid,
        uploadedAt: firebase.firestore.FieldValue.serverTimestamp(),
        coverUrl: coverUrl2,
      });
      if (typeof logActivity === 'function') logActivity('book_uploaded', { title });
      done++;
    } catch(e) { errors.push(title + ': ' + e.message); }
  }

  progBar.style.width = '100%';
  progText.textContent = done + ' uploaded' + (errors.length ? ', ' + errors.length + ' failed' : '');
  if (errors.length) console.warn('Bulk upload errors:', errors);
  showToast(done + ' of ' + total + ' books uploaded!', done === total ? 'success' : 'error');
  await loadBooks();
  setTimeout(closeBulkModal, 1500);
}

function _getIcon(t) { return { pdf:'📕', epub:'📗', txt:'📄', doc:'📝', docx:'📝' }[t] || '📁'; }
function _cleanName(n) { return n.replace(/\.[^/.]+$/, '').replace(/[-_]/g, ' ').replace(/\b\w/g, c => c.toUpperCase()); }

// ── Generate Missing Covers (retroactive) ─────────────────────
async function generateMissingCovers() {
  const btn    = document.getElementById('fixCoversBtn');
  const status = document.getElementById('fixCoversStatus');
  if (btn) { btn.disabled = true; btn.textContent = 'Working…'; }

  try {
    const snap = await db.collection('books')
      .where('fileType', '==', 'pdf')
      .get();

    const missing = snap.docs.filter(d => !d.data().coverUrl);
    if (!missing.length) {
      if (status) status.textContent = '✅ All PDF books already have covers.';
      if (btn) { btn.disabled = false; btn.textContent = '🖼 Generate Missing Covers'; }
      return;
    }

    if (status) status.textContent = '0 / ' + missing.length + ' processed…';
    let done = 0, failed = 0;

    for (const doc of missing) {
      const data = doc.data();
      try {
        if (status) status.textContent = 'Fetching: ' + (data.title || doc.id) + '…';

        // Fetch the PDF via CORS proxy
        const pdfUrl = data.downloadUrl;
        const proxied = 'https://corsproxy.io/?' + encodeURIComponent(pdfUrl);
        const res  = await fetch(proxied);
        if (!res.ok) throw new Error('Fetch failed (' + res.status + ')');
        const buf  = await res.arrayBuffer();

        // Generate thumbnail from buffer
        if (typeof pdfjsLib === 'undefined') throw new Error('pdf.js not loaded');
        pdfjsLib.GlobalWorkerOptions.workerSrc =
          'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

        const pdf    = await pdfjsLib.getDocument({ data: buf }).promise;
        const page   = await pdf.getPage(1);
        const vp     = page.getViewport({ scale: 1 });
        const scale  = 200 / vp.width;
        const svp    = page.getViewport({ scale });
        const canvas = document.createElement('canvas');
        canvas.width = svp.width; canvas.height = svp.height;
        await page.render({ canvasContext: canvas.getContext('2d'), viewport: svp }).promise;

        const blob = await new Promise(r => canvas.toBlob(r, 'image/jpeg', 0.85));
        if (!blob) throw new Error('Canvas blob failed');

        const thumbFile = new File([blob], 'cover.jpg', { type: 'image/jpeg' });
        const coverUrl  = await uploadThumbnail(thumbFile);
        if (!coverUrl) throw new Error('Cover upload returned null');

        await db.collection('books').doc(doc.id).update({ coverUrl });
        // Update in-memory
        const book = allBooks.find(b => b.id === doc.id);
        if (book) book.coverUrl = coverUrl;
        done++;
      } catch(e) {
        console.warn('Cover failed for', data.title, ':', e.message);
        failed++;
      }
      if (status) status.textContent = done + ' done' + (failed ? ', ' + failed + ' failed' : '') + ' / ' + missing.length;
    }

    renderBooks();
    showToast(done + ' covers generated!', 'success');
    if (status) status.textContent = '✅ Done: ' + done + ' generated' + (failed ? ', ' + failed + ' failed (check console)' : '');
  } catch(e) {
    if (status) status.textContent = '❌ Error: ' + e.message;
    showToast('Error: ' + e.message, 'error');
  }
  if (btn) { btn.disabled = false; btn.textContent = '🖼 Generate Missing Covers'; }
}
