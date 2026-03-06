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
  document.getElementById('bookTitle').value  = '';
  document.getElementById('bookAuthor').value = '';
  document.getElementById('bookFolder').value = 'General';
  document.getElementById('newFolderInput').style.display = 'none';
  document.getElementById('newFolderInput').value = '';
  document.getElementById('fileChosen').style.display = 'none';
  document.getElementById('uploadProgress').style.display = 'none';
  document.getElementById('progressBar').style.width = '0%';
  const btn = document.getElementById('uploadSubmitBtn');
  btn.disabled = false;
  btn.textContent = 'Upload';
}

async function loadFoldersIntoSelect() {
  const select = document.getElementById('bookFolder');
  const defaults = ['General','Fiction','Non-Fiction','Science','History','Technology','Education','Religion'];

  // Reset
  select.innerHTML = defaults.map(f => '<option value="' + f + '">📁 ' + f + '</option>').join('');

  try {
    // Add custom folders
    const snap = await db.collection('folders').get();
    snap.docs.forEach(doc => {
      if (!defaults.includes(doc.id)) {
        const opt = document.createElement('option');
        opt.value = doc.id;
        opt.textContent = '📁 ' + doc.id;
        select.appendChild(opt);
      }
    });

    // Custom folders from books too
    const bSnap = await db.collection('books').get();
    const bookFolders = [...new Set(bSnap.docs.map(d => d.data().category).filter(Boolean))];
    bookFolders.forEach(f => {
      if (!defaults.includes(f) && !Array.from(select.options).some(o => o.value === f)) {
        const opt = document.createElement('option');
        opt.value = f;
        opt.textContent = '📁 ' + f;
        select.appendChild(opt);
      }
    });
  } catch(e) {}

  // Add "New folder..." option
  const newOpt = document.createElement('option');
  newOpt.value = '__new__';
  newOpt.textContent = '➕ New Folder...';
  select.appendChild(newOpt);
}

function onFolderChange(select) {
  const input = document.getElementById('newFolderInput');
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
  fc.textContent = '✅ ' + file.name + ' (' + formatSize(file.size) + ')';
  fc.style.display = 'block';
  if (!document.getElementById('bookTitle').value) {
    document.getElementById('bookTitle').value = capitalizeWords(
      file.name.replace(/\.[^/.]+$/, '').replace(/[-_]/g, ' ')
    );
  }
}

// ── Upload ────────────────────────────────────────────────────
async function uploadBook() {
  if (!selectedFile) { showToast('Please select a file.', 'error'); return; }
  const title = document.getElementById('bookTitle').value.trim();
  if (!title) { showToast('Please enter a title.', 'error'); return; }

  const author = document.getElementById('bookAuthor').value.trim();
  const folderSelect = document.getElementById('bookFolder').value;
  const newFolderVal = document.getElementById('newFolderInput').value.trim();
  const category = folderSelect === '__new__' ? (newFolderVal || 'General') : folderSelect;
  const fileType = selectedFile.name.split('.').pop().toLowerCase();
  const btn = document.getElementById('uploadSubmitBtn');

  btn.disabled = true;
  btn.textContent = 'Uploading...';
  document.getElementById('uploadProgress').style.display = 'block';
  document.getElementById('progressText').textContent = 'Uploading file...';

  try {
    // Upload file
    const fileUrl = await uploadToCloudinary(selectedFile, 'books', (pct) => {
      document.getElementById('progressBar').style.width = pct + '%';
      document.getElementById('progressPercent').textContent = pct + '%';
    });

    document.getElementById('progressText').textContent = 'Saving to database...';

    // Generate PDF cover locally as dataURL (stored in Firestore)
    let coverUrl = null;
    if (fileType === 'pdf') {
      try { coverUrl = await generatePDFCover(selectedFile); } catch(e) {}
    }

    // Save new folder if needed
    if (folderSelect === '__new__' && newFolderVal) {
      await db.collection('folders').doc(newFolderVal).set({
        name: newFolderVal,
        createdAt: firebase.firestore.FieldValue.serverTimestamp()
      }).catch(() => {});
    }

    // Save to Firestore
    await db.collection('books').add({
      title, author: author || null, category, fileType,
      fileSize: selectedFile.size, downloadUrl: fileUrl,
      coverUrl: coverUrl || null, uploadedBy: currentUser.uid,
      uploadedAt: firebase.firestore.FieldValue.serverTimestamp(),
    });

    document.getElementById('progressBar').style.width = '100%';
    showToast('"' + title + '" uploaded successfully!', 'success');
    closeUploadModal();
    await loadBooks();
  } catch(err) {
    showToast('Upload failed: ' + err.message, 'error');
    btn.disabled = false;
    btn.textContent = 'Upload';
  }
}

function uploadToCloudinary(file, folder, onProgress) {
  return new Promise((resolve, reject) => {
    const fd = new FormData();
    fd.append('file', file);
    fd.append('upload_preset', CLOUDINARY_PRESET);
    fd.append('folder', folder);
    const resourceType = 'raw';
    const xhr = new XMLHttpRequest();
    xhr.open('POST', 'https://api.cloudinary.com/v1_1/' + CLOUDINARY_CLOUD + '/' + resourceType + '/upload');
    xhr.upload.onprogress = (e) => { if (e.lengthComputable) onProgress(Math.round(e.loaded/e.total*90)); };
    xhr.onload = () => {
      if (xhr.status === 200) resolve(JSON.parse(xhr.responseText).secure_url);
      else reject(new Error(JSON.parse(xhr.responseText).error?.message || 'Upload failed'));
    };
    xhr.onerror = () => reject(new Error('Network error'));
    xhr.send(fd);
  });
}

async function generatePDFCover(file) {
  try {
    pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
    const pdf = await pdfjsLib.getDocument({ data: await file.arrayBuffer() }).promise;
    const page = await pdf.getPage(1);
    const viewport = page.getViewport({ scale: 0.5 });
    const canvas = document.createElement('canvas');
    canvas.width = viewport.width; canvas.height = viewport.height;
    await page.render({ canvasContext: canvas.getContext('2d'), viewport }).promise;
    return canvas.toDataURL('image/jpeg', 0.7);
  } catch(e) { return null; }
}

function formatSize(b) {
  if (b < 1024) return b + ' B';
  if (b < 1048576) return (b/1024).toFixed(1) + ' KB';
  return (b/1048576).toFixed(1) + ' MB';
}
function capitalizeWords(s) { return s.replace(/\b\w/g, c => c.toUpperCase()); }
