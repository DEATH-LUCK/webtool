// ============================================================
// UPLOAD.JS — File Upload (Google Drive)
// ============================================================

let selectedFile = null;
const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB Limit

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
  document.getElementById('fileChosen').style.display    = 'none';
  document.getElementById('uploadProgress').style.display = 'none';
  document.getElementById('progressBar').style.width     = '0%';
  const btn = document.getElementById('uploadSubmitBtn');
  btn.disabled = false;
  btn.textContent = 'Upload';
}

async function loadFoldersIntoSelect() {
  const select   = document.getElementById('bookFolder');
  // टेम्पलेट हटा दिया गया है, अब सिर्फ 'General' डिफॉल्ट रहेगा
  select.innerHTML = '<option value="General">📁 General</option>';
  try {
    const snap = await db.collection('folders').get();
    snap.docs.forEach(doc => {
      if (doc.id !== 'General') {
        const opt = document.createElement('option');
        opt.value = doc.id; opt.textContent = '📁 ' + doc.id;
        select.appendChild(opt);
      }
    });
  } catch(e) {}
}

// नया फोल्डर बनाने का सीधा फंक्शन
async function createFolderInUpload() {
  const name = await showPrompt("Create New Archive", "Enter archive/folder name...");
  if (!name) return;
  const folderName = name.trim();
  if (!folderName) return;

  try {
    await db.collection('folders').doc(folderName).set({
      name: folderName,
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    });
    showToast(`📁 "${folderName}" created!`, 'success');
    await loadFoldersIntoSelect(); // लिस्ट रिफ्रेश करें
    document.getElementById('bookFolder').value = folderName; // नए फोल्डर को ऑटो-सेलेक्ट करें
  } catch(e) {
    showToast('Error: ' + e.message, 'error');
  }
}

// फोल्डर का नाम बदलने (Rename) का फंक्शन
async function renameSelectedFolder() {
  const select = document.getElementById('bookFolder');
  const oldName = select.value;

  if (!oldName || oldName === 'General' || oldName === '__new__') {
    showToast('This folder cannot be renamed.', 'error');
    return;
  }

  const newName = await showPrompt("Rename Archive", "Enter new name...", oldName);
  if (!newName || newName.trim() === oldName) return;
  const trimmedNew = newName.trim();

  try {
    const batch = db.batch();
    
    // 1. नई फोल्डर एंट्री बनाएँ
    batch.set(db.collection('folders').doc(trimmedNew), {
      name: trimmedNew, createdAt: firebase.firestore.FieldValue.serverTimestamp()
    });
    
    // 2. पुराने फोल्डर को डिलीट करें
    batch.delete(db.collection('folders').doc(oldName));
    
    // 3. इस फोल्डर की सभी किताबों को नए फोल्डर में अपडेट करें
    const booksSnap = await db.collection('books').where('category', '==', oldName).get();
    booksSnap.forEach(doc => {
      batch.update(doc.ref, { category: trimmedNew });
    });

    await batch.commit();
    showToast(`Folder renamed to "${trimmedNew}" and library updated.`, 'success');
    await loadFoldersIntoSelect();
    if (typeof loadBooks === 'function') await loadBooks(); // रिफ्रेश लाइब्रेरी डेटा
    setTimeout(() => { document.getElementById('bookFolder').value = trimmedNew; }, 50);
  } catch(e) { showToast('Error: ' + e.message, 'error'); }
}

// चुने हुए फोल्डर को डिलीट करने का फंक्शन
async function deleteSelectedFolder() {
  const select = document.getElementById('bookFolder');
  const folder = select.value;

  if (!folder || folder === 'General' || folder === '__new__') {
    showToast('Default folder cannot be deleted.', 'error');
    return;
  }

  if (!await showConfirm("Delete Archive", `Delete folder "${folder}"? Existing books will be moved to "General".`)) return;

  try {
    const batch = db.batch();
    
    // 1. फोल्डर डिलीट करें
    batch.delete(db.collection('folders').doc(folder));
    
    // 2. किताबों को 'General' में मूव करें
    const booksSnap = await db.collection('books').where('category', '==', folder).get();
    booksSnap.forEach(doc => {
      batch.update(doc.ref, { category: 'General' });
    });

    await batch.commit();
    showToast(`Folder deleted. Books moved to General archive.`, 'success');
    await loadFoldersIntoSelect(); // लिस्ट रिफ्रेश करें
    if (typeof loadBooks === 'function') await loadBooks(); // लाइब्रेरी सिंक करें
  } catch(e) { showToast('Error: ' + e.message, 'error'); }
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

async function processFile(file) {
  if (!file.name.match(/\.(pdf|epub|txt|doc|docx)$/i)) { showToast('Unsupported file type.', 'error'); return; }
  
  if (file.size > MAX_FILE_SIZE) {
    showToast('File too large. Max 50MB allowed.', 'error');
    return;
  }

  selectedFile = file;
  
  // UI Updates
  document.getElementById('fileChosen').style.display = 'block';
  document.getElementById('selectedFileName').textContent = file.name;
  document.getElementById('selectedFileMeta').textContent = formatSize(file.size) + ' · ' + file.name.split('.').pop().toUpperCase();
  
  if (!document.getElementById('bookTitle').value) {
    document.getElementById('bookTitle').value = capitalizeWords(
      file.name.replace(/\.[^/.]+$/, '').replace(/[-_]/g, ' ')
    );
  }

  // Auto-Extract Metadata & Preview
  if (file.type === 'application/pdf') {
    extractPDFMetadata(file);
  } else if (file.name.endsWith('.epub')) {
    extractEPUBMetadata(file);
  }
}

async function extractPDFMetadata(file) {
  const reader = new FileReader();
  reader.onload = async function() {
    try {
      const typedarray = new Uint8Array(this.result);
      const pdf = await pdfjsLib.getDocument(typedarray).promise;
      const meta = await pdf.getMetadata();
      
      if (meta.info.Title) document.getElementById('bookTitle').value = meta.info.Title;
      if (meta.info.Author) document.getElementById('bookAuthor').value = meta.info.Author;

      // Generate Thumbnail
      const page = await pdf.getPage(1);
      const viewport = page.getViewport({ scale: 0.2 });
      const canvas = document.createElement('canvas');
      const context = canvas.getContext('2d');
      canvas.height = viewport.height;
      canvas.width = viewport.width;
      
      await page.render({ canvasContext: context, viewport: viewport }).promise;
      const thumb = document.getElementById('uploadThumb');
      thumb.innerHTML = '';
      thumb.appendChild(canvas);
    } catch (e) { console.warn("Metadata extraction failed", e); }
  };
  reader.readAsArrayBuffer(file);
}

async function extractEPUBMetadata(file) {
  try {
    const zip = await JSZip.loadAsync(file);
    const containerXml = await zip.file('META-INF/container.xml').async('text');
    const parser = new DOMParser();
    const containerDoc = parser.parseFromString(containerXml, 'text/xml');
    const opfPath = containerDoc.querySelector('rootfile').getAttribute('full-path');
    const opfXml = await zip.file(opfPath).async('text');
    const opfDoc = parser.parseFromString(opfXml, 'text/xml');

    const title = opfDoc.querySelector('title')?.textContent;
    const creator = opfDoc.querySelector('creator')?.textContent;

    if (title) document.getElementById('bookTitle').value = title;
    if (creator) document.getElementById('bookAuthor').value = creator;
    
    // Default icon for epub preview as image extraction is heavy
    document.getElementById('uploadThumb').textContent = '📗';
  } catch (e) { console.warn("EPUB metadata extraction failed", e); }
}

// ── Main Upload ───────────────────────────────────────────────
async function uploadBook() {
  if (!selectedFile) { showToast('Please select a file.', 'error'); return; }
  const title = document.getElementById('bookTitle').value.trim();
  if (!title)  { showToast('Please enter a title.', 'error'); return; }

  const author       = document.getElementById('bookAuthor').value.trim();
  const folderSelect = document.getElementById('bookFolder').value;
  const category     = folderSelect || 'General';
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
