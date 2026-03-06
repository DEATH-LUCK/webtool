// ============================================================
// 🔥 FIREBASE CONFIGURATION
// ============================================================
// SETUP INSTRUCTIONS:
// 1. Go to https://console.firebase.google.com
// 2. Create new project → "My Cloud Library"
// 3. Add Web App → Copy config below
// 4. Enable Authentication → Email/Password
// 5. Enable Firestore Database → Start in production mode
// 6. Enable Storage → Start in production mode
// 7. Replace the firebaseConfig values below with yours
// ============================================================

const firebaseConfig = {
  apiKey: "AIzaSyCZrWmBl8KrEHqUwJnotJdfBY5llBp_9wk",
  authDomain: "webtool-76d54.firebaseapp.com",
  projectId: "webtool-76d54",
  storageBucket: "webtool-76d54.firebasestorage.app",
  messagingSenderId: "389382347584",
  appId: "1:389382347584:web:8cad8025f3897d24d1f8a5"
};

// Initialize Firebase
firebase.initializeApp(firebaseConfig);

const auth = firebase.auth();
const db = firebase.firestore();
const storage = firebase.storage();

// ============================================================
// FIRESTORE SECURITY RULES (paste in Firebase Console):
// ============================================================
/*
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /books/{bookId} {
      allow read: if request.auth != null;
      allow write: if request.auth != null && 
        get(/databases/$(database)/documents/users/$(request.auth.uid)).data.role == 'admin';
    }
    match /users/{userId} {
      allow read: if request.auth != null && request.auth.uid == userId;
      allow write: if request.auth != null && request.auth.uid == userId;
    }
  }
}
*/

// ============================================================
// STORAGE SECURITY RULES (paste in Firebase Console):
// ============================================================
/*
rules_version = '2';
service firebase.storage {
  match /b/{bucket}/o {
    match /books/{allPaths=**} {
      allow read: if request.auth != null;
      allow write: if request.auth != null && 
        firestore.get(/databases/(default)/documents/users/$(request.auth.uid)).data.role == 'admin';
    }
    match /covers/{allPaths=**} {
      allow read: if request.auth != null;
      allow write: if request.auth != null && 
        firestore.get(/databases/(default)/documents/users/$(request.auth.uid)).data.role == 'admin';
    }
  }
}
*/

// ============================================================
// ADMIN SETUP:
// After first login, run this in browser console ONCE:
// setAdminRole('your-email@gmail.com')
// ============================================================
async function setAdminRole(email) {
  const user = auth.currentUser;
  if (user && user.email === email) {
    await db.collection('users').doc(user.uid).set({
      email: user.email,
      role: 'admin',
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    }, { merge: true });
    console.log('✅ Admin role set for', email);
  }
}

async function getCurrentUserRole() {
  const user = auth.currentUser;
  if (!user) return null;
  const doc = await db.collection('users').doc(user.uid).get();
  if (doc.exists) return doc.data().role || 'user';
  // Create user doc if not exists
  await db.collection('users').doc(user.uid).set({
    email: user.email,
    role: 'user',
    createdAt: firebase.firestore.FieldValue.serverTimestamp()
  });
  return 'user';
}
