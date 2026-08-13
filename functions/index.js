const {onRequest} = require('firebase-functions/v2/https');
const {initializeApp} = require('firebase-admin/app');
const {getFirestore} = require('firebase-admin/firestore');
const {Readable} = require('node:stream');

initializeApp();
const db = getFirestore();

exports.libraryFile = onRequest({cors: false, invoker: 'public', timeoutSeconds: 540, memory: '512MiB'}, async (req, res) => {
  try {
    const itemId = String(req.query.item || '').trim();
    if (!itemId || !/^[A-Za-z0-9_-]{8,150}$/.test(itemId)) return res.status(400).send('Invalid library item.');

    const doc = await db.collection('books').doc(itemId).get();
    if (!doc.exists || doc.data().libraryScope !== 'library') return res.status(404).send('Library item not found.');
    const fileId = String(doc.data().fileId || '').trim();
    if (!fileId) return res.status(404).send('File is not available.');

    const headers = {};
    if (req.headers.range) headers.Range = req.headers.range;
    const driveUrl = `https://drive.usercontent.google.com/download?id=${encodeURIComponent(fileId)}&export=download&confirm=t`;
    const upstream = await fetch(driveUrl, {headers, redirect:'follow'});
    if (!upstream.ok && upstream.status !== 206) return res.status(upstream.status).send('File could not be fetched.');

    const passthrough = ['content-type','content-length','content-range','accept-ranges','etag','last-modified','cache-control'];
    passthrough.forEach(h => { const v=upstream.headers.get(h); if(v) res.set(h,v); });
    res.set('Content-Disposition', `inline; filename="${encodeURIComponent(doc.data().title || 'library-file')}"`);
    res.status(upstream.status);
    if (!upstream.body) return res.end();
    Readable.fromWeb(upstream.body).pipe(res);
  } catch (err) {
    console.error('libraryFile proxy error', err);
    res.status(500).send('Library file service error.');
  }
});
