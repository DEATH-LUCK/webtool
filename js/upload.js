// ============================================================
// UPLOAD.JS — File Upload (Google Drive)
// ============================================================

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
  document.getElementById('newFolderName').style.display  = 'none';
  document.getElementById('newFolderName').value = '';
  document.getElementById('fileChosen').style.display    = 'none';
  document.getElementById('uploadProgress').style.display = 'none';
  document.getElementById('progressBar').style.width     = '0%';
  const btn = document.getElementById('uploadSubmitBtn');
  btn.disabled = false;
  btn.textContent = 'Upload';
}

async function loadFoldersIntoSelect() {
  const select   = document.getElementById('bookFolder');
  const defaults = ['General','Fiction','Non-Fiction','Science','History','Technology','Education','Religion'];
  select.innerHTML = defaults.map(f => `<option value="${f}">📁 ${f}</option>`).join('');
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
  const input = document.getElementById('newFolderName');
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

// ── Main Upload ───────────────────────────────────────────────
async function uploadBook() {
  if (!selectedFile) { showToast('Please select a file.', 'error'); return; }
  const title = document.getElementById('bookTitle').value.trim();
  if (!title)  { showToast('Please enter a title.', 'error'); return; }

  const author       = document.getElementById('bookAuthor').value.trim();
  const folderSelect = document.getElementById('bookFolder').value;
  const newFolderVal = document.getElementById('newFolderName').value.trim();
  const category     = folderSelect === '__new__' ? (newFolderVal || 'General') : folderSelect;
  const fileType     = selectedFile.name.split('.').pop().toLowerCase();
  const btn          = document.getElementById('uploadSubmitBtn');

  btn.disabled    = true;
  btn.textContent = 'Connecting to Google Drive...';
  document.getElementById('uploadProgress').style.display = 'block';
  document.getElementById('progressText').textContent     = 'Connecting to Google Drive...';

  try {
    // Step 1: Get Google Drive token
    const token = await getGDriveToken();
    document.getElementById('progressText').textContent = 'Getting folder...';

    // Step 2: Get root MyLibrary folder
    const rootFolderId = await getOrCreateRootFolder(token);

    // Step 3: Get or create category subfolder
    const subFolderId = await getOrCreateSubFolder(token, rootFolderId, category);

    // Step 4: Upload file
    document.getElementById('progressText').textContent = 'Uploading file...';
    btn.textContent = 'Uploading...';

    const result = await uploadToGDrive(selectedFile, subFolderId, token, (pct) => {
      document.getElementById('progressBar').style.width = pct + '%';
      document.getElementById('progressPercent').textContent = pct + '%';
    });

    // Step 5: Save folder to Firestore
    document.getElementById('progressText').textContent = 'Saving...';
    document.getElementById('progressBar').style.width = '95%';

    if (folderSelect === '__new__' && newFolderVal) {
      await db.collection('folders').doc(newFolderVal).set({
        name: newFolderVal,
        createdAt: firebase.firestore.FieldValue.serverTimestamp()
      }).catch(() => {});
    }

    // Step 6: Save to Firestore
    await db.collection('books').add({
      title,
      author:      author || null,
      category,
      fileType,
      fileSize:    selectedFile.size,
      downloadUrl: result.downloadUrl,
      viewUrl:     result.viewUrl,
      fileId:      result.fileId,
      coverUrl:    null,
      uploadedBy:  currentUser.uid,
      uploadedAt:  firebase.firestore.FieldValue.serverTimestamp(),
    });

    document.getElementById('progressBar').style.width = '100%';
    showToast('"' + title + '" uploaded to Google Drive!', 'success');
    closeUploadModal();
    await loadBooks();

  } catch(err) {
    console.error('Upload error:', err);
    showToast('Upload failed: ' + err.message, 'error');
    btn.disabled    = false;
    btn.textContent = 'Upload';
  }
}

// ── Helpers ───────────────────────────────────────────────────
function formatSize(b) {
  if (b < 1024) return b + ' B';
  if (b < 1048576) return (b/1024).toFixed(1) + ' KB';
  return (b/1048576).toFixed(1) + ' MB';
}
function capitalizeWords(s) { return s.replace(/\b\w/g, c => c.toUpperCase()); }
