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

  // Google Drive can't virus-scan large or unrecognized files (common for the
  // .apk/.exe/.zip/.mp4 etc. this Library stores) and returns an HTML
  // "can't scan this file" warning page instead of the file — even to a
  // public link. We have to follow that warning page's own confirm form to
  // get the real download, forwarding whatever cookie it sets us.
  let cookie = '';
  async function attempt(url) {
    const res = await fetch(url, {
      headers: { ...headers, ...(cookie ? { Cookie: cookie } : {}) },
      redirect: 'follow'
    });
    const setCookie = res.headers.get('set-cookie');
    if (setCookie) cookie = setCookie.split(',').map(c => c.split(';')[0]).join('; ');
    return res;
  }

  async function resolveInterstitial(html, fallbackUrl) {
    // The warning page is either an HTML <form> (older) or a plain link with
    // a confirm token in the query string (newer). Handle both.
    const actionMatch  = html.match(/action="([^"]+)"/);
    const idMatch      = html.match(/name="id" value="([^"]+)"/);
    const confirmMatch = html.match(/name="confirm" value="([^"]+)"/) || html.match(/confirm=([0-9A-Za-z_-]+)/);
    const uuidMatch    = html.match(/name="uuid" value="([^"]+)"/) || html.match(/uuid=([0-9A-Za-z_-]+)/);

    let confirmUrl;
    if (actionMatch) {
      const params = new URLSearchParams();
      params.set('id', idMatch ? idMatch[1] : fileId);
      params.set('export', 'download');
      if (confirmMatch) params.set('confirm', confirmMatch[1]);
      if (uuidMatch) params.set('uuid', uuidMatch[1]);
      confirmUrl = actionMatch[1].replace(/&amp;/g, '&') + '?' + params.toString();
    } else if (confirmMatch) {
      const params = new URLSearchParams();
      params.set('id', fileId);
      params.set('export', 'download');
      params.set('confirm', confirmMatch[1]);
      if (uuidMatch) params.set('uuid', uuidMatch[1]);
      confirmUrl = fallbackUrl.split('?')[0] + '?' + params.toString();
    }
    if (!confirmUrl) return null;
    return attempt(confirmUrl);
  }

  const baseUrls = [
    `https://drive.usercontent.google.com/download?export=download&confirm=t&id=${encodeURIComponent(fileId)}`,
    `https://drive.google.com/uc?export=download&id=${encodeURIComponent(fileId)}`
  ];

  for (const url of baseUrls) {
    let res = await attempt(url);
    let type = (res.headers.get('content-type') || '').toLowerCase();

    if ((res.ok || res.status === 206) && !type.includes('text/html')) return res;

    if (type.includes('text/html')) {
      try {
        const html = await res.text();
        const retried = await resolveInterstitial(html, url);
        if (retried) {
          const retryType = (retried.headers.get('content-type') || '').toLowerCase();
          if ((retried.ok || retried.status === 206) && !retryType.includes('text/html')) return retried;
        }
      } catch (e) { /* try next base URL */ }
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
