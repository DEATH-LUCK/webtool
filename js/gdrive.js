// ============================================================
// GDRIVE.JS — Google Drive Integration
// ============================================================

const GDRIVE_CLIENT_ID = '1065303708935-qfj6q4kqr1jm61u02be5rhu67imunvmp.apps.googleusercontent.com';
const GDRIVE_SCOPES    = 'https://www.googleapis.com/auth/drive.file';
const GDRIVE_FOLDER_NAME = 'MyLibrary';

let gdriveAccessToken = null;
let gdriveRootFolderId = null;

// ── Init Google Identity Services ─────────────────────────────
function initGoogleAuth() {
  return new Promise((resolve) => {
    if (typeof google === 'undefined') {
      const script = document.createElement('script');
      script.src = 'https://accounts.google.com/gsi/client';
      script.onload = () => resolve();
      document.head.appendChild(script);
    } else {
      resolve();
    }
  });
}

// ── Get Access Token ──────────────────────────────────────────
async function getGDriveToken() {
  await initGoogleAuth();
  return new Promise((resolve, reject) => {
    const client = google.accounts.oauth2.initTokenClient({
      client_id: GDRIVE_CLIENT_ID,
      scope: GDRIVE_SCOPES,
      callback: (response) => {
        if (response.error) {
          reject(new Error(response.error));
          return;
        }
        gdriveAccessToken = response.access_token;
        resolve(response.access_token);
      },
    });
    client.requestAccessToken();
  });
}

// ── Get or Create Root Folder ─────────────────────────────────
async function getOrCreateRootFolder(token) {
  // Search for existing MyLibrary folder
  const searchRes = await fetch(
    `https://www.googleapis.com/drive/v3/files?q=name='${GDRIVE_FOLDER_NAME}' and mimeType='application/vnd.google-apps.folder' and trashed=false&fields=files(id,name)`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  const searchData = await searchRes.json();
  if (searchData.files && searchData.files.length > 0) {
    return searchData.files[0].id;
  }
  // Create new folder
  const createRes = await fetch('https://www.googleapis.com/drive/v3/files', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      name: GDRIVE_FOLDER_NAME,
      mimeType: 'application/vnd.google-apps.folder'
    })
  });
  const folder = await createRes.json();
  return folder.id;
}

// ── Get or Create Sub Folder ──────────────────────────────────
async function getOrCreateSubFolder(token, parentId, folderName) {
  const searchRes = await fetch(
    `https://www.googleapis.com/drive/v3/files?q=name='${folderName}' and '${parentId}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false&fields=files(id,name)`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  const searchData = await searchRes.json();
  if (searchData.files && searchData.files.length > 0) {
    return searchData.files[0].id;
  }
  const createRes = await fetch('https://www.googleapis.com/drive/v3/files', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      name: folderName,
      mimeType: 'application/vnd.google-apps.folder',
      parents: [parentId]
    })
  });
  const folder = await createRes.json();
  return folder.id;
}

// ── Upload File to Drive ──────────────────────────────────────
async function uploadToGDrive(file, folderId, token, onProgress) {
  // Use resumable upload for large files
  const metadata = {
    name: file.name,
    parents: [folderId]
  };

  // Initiate resumable upload
  const initRes = await fetch(
    'https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable',
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        'X-Upload-Content-Type': file.type || 'application/octet-stream',
        'X-Upload-Content-Length': file.size
      },
      body: JSON.stringify(metadata)
    }
  );

  const uploadUrl = initRes.headers.get('Location');
  if (!uploadUrl) throw new Error('Could not initiate upload');

  // Upload file with progress
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('PUT', uploadUrl);
    xhr.setRequestHeader('Content-Type', file.type || 'application/octet-stream');
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress(Math.round(e.loaded / e.total * 90));
    };
    xhr.onload = async () => {
      if (xhr.status === 200 || xhr.status === 201) {
        const fileData = JSON.parse(xhr.responseText);
        // Make file publicly readable
        await makeFilePublic(fileData.id, token);
        const downloadUrl = `https://drive.google.com/uc?export=download&id=${fileData.id}`;
        const viewUrl     = `https://drive.google.com/file/d/${fileData.id}/view`;
        resolve({ downloadUrl, viewUrl, fileId: fileData.id });
      } else {
        reject(new Error('Upload failed: ' + xhr.responseText));
      }
    };
    xhr.onerror = () => reject(new Error('Network error'));
    xhr.send(file);
  });
}

// ── Make File Public ──────────────────────────────────────────
async function makeFilePublic(fileId, token) {
  await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}/permissions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ role: 'reader', type: 'anyone' })
  });
}
