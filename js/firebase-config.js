// ============================================================
// FIREBASE CONFIG
// ============================================================
const firebaseConfig = {
  apiKey: "AIzaSyCZrWmBl8KrEHqUwJnotJdfBY5llBp_9wk",
  authDomain: "webtool-76d54.firebaseapp.com",
  projectId: "webtool-76d54",
  storageBucket: "webtool-76d54.firebasestorage.app",
  messagingSenderId: "389382347584",
  appId: "1:389382347584:web:8cad8025f3897d24d1f8a5"
};

firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db   = firebase.firestore();

// ── Set Admin Role (run once in console) ──────────────────────
async function setAdminRole(email) {
  const snap = await db.collection('users').get();
  for (const doc of snap.docs) {
    if (doc.id === email || doc.data().email === email) {
      await db.collection('users').doc(doc.id).update({ role: 'admin' });
      console.log('✅ Admin role set for', email);
      return;
    }
  }
  await db.collection('users').doc(email).set({ role: 'admin', email }, { merge: true });
  console.log('✅ Admin role set for', email);
}
