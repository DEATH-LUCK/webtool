const {onRequest} = require('firebase-functions/v2/https');
const {initializeApp} = require('firebase-admin/app');
const {getFirestore} = require('firebase-admin/firestore');
const {Readable} = require('node:stream');

initializeApp();
const db = getFirestore();

function safeFilename(name, fallback='library-file') {
  const clean = String(name || fallback).replace(/[\\/:*?"<>|\r\n]+/g, '_').trim();
  return clean || fallback;
}

async function fetchDriveFile(fileId, range) {
  const headers = {};
  if (range) headers.Range = range;

  const urls = [
    `https://drive.usercontent.google.com/download?export=download&id=${encodeURIComponent(fileId)}`,
    `https://drive.google.com/uc?export=download&id=${encodeURIComponent(fileId)}`
  ];

  for (const url of urls) {
    const upstream = await fetch(url, {headers, redirect:'follow'});
    const type = (upstream.headers.get('content-type') || '').toLowerCase();
    if (upstream.ok || upstream.status === 206) {
      // Never pass a Google Drive HTML page through to the browser as if it were the file.
      if (!type.includes('text/html')) return upstream;
    }
  }
  throw new Error('Google Drive returned a web page instead of the requested file. Make sure the uploaded file is publicly readable.');
}

exports.libraryFile = onRequest({cors: false, invoker: 'public', timeoutSeconds: 540, memory: '512MiB'}, async (req, res) => {
  try {
    const itemId = String(req.query.item || '').trim();
    const mode = String(req.query.mode || 'inline').toLowerCase() === 'download' ? 'download' : 'inline';
    if (!itemId || !/^[A-Za-z0-9_-]{8,150}$/.test(itemId)) return res.status(400).send('Invalid library item.');

    const doc = await db.collection('books').doc(itemId).get();
    if (!doc.exists || doc.data().libraryScope !== 'library') return res.status(404).send('Library item not found.');
    const data = doc.data();
    const fileId = String(data.fileId || '').trim();
    if (!fileId) return res.status(404).send('File is not available.');

    const upstream = await fetchDriveFile(fileId, req.headers.range);
    const passthrough = ['content-type','content-length','content-range','accept-ranges','etag','last-modified'];
    passthrough.forEach(h => { const v=upstream.headers.get(h); if(v) res.set(h,v); });
    if (!upstream.headers.get('content-type') && data.mimeType) res.set('Content-Type', data.mimeType);

    const ext = String(data.fileType || '').trim().replace(/[^A-Za-z0-9]+/g, '');
    const baseName = data.fileName || data.title || 'library-file';
    const filename = safeFilename(baseName + (ext && !String(baseName).toLowerCase().endsWith('.' + ext.toLowerCase()) ? '.' + ext : ''));
    const disposition = mode === 'download' ? 'attachment' : 'inline';
    res.set('Content-Disposition', `${disposition}; filename="${filename.replace(/"/g, '')}"`);
    res.set('X-Content-Type-Options', 'nosniff');
    res.set('Cache-Control', 'private, max-age=300');
    res.status(upstream.status);
    if (!upstream.body) return res.end();
    Readable.fromWeb(upstream.body).pipe(res);
  } catch (err) {
    console.error('libraryFile proxy error', err);
    res.status(502).send('The file could not be streamed from storage.');
  }
});
