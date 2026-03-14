// ============================================================
// AUTH.JS
// ============================================================
let currentUser = null;
let currentRole = 'user';

// ── Theme ─────────────────────────────────────────────────────
function applyTheme() {
  if (localStorage.getItem('theme') === 'light') {
    document.body.classList.add('light-mode');
    const btn = document.getElementById('themeBtn');
    if (btn) btn.textContent = '☀️';
  }
}
function toggleTheme() {
  const isLight = document.body.classList.toggle('light-mode');
  localStorage.setItem('theme', isLight ? 'light' : 'dark');
  document.getElementById('themeBtn').textContent = isLight ? '☀️' : '🌙';
  const m = document.getElementById('mobileThemeBtn');
  if (m) m.textContent = isLight ? '☀️ Light Mode' : '🌙 Dark Mode';
}
applyTheme();

// ── Check Email Link on Page Load ─────────────────────────────
window.addEventListener('load', async () => {
  if (auth.isSignInWithEmailLink(window.location.href)) {
    let email = localStorage.getItem('adminEmailForSignIn');
    if (!email) {
      email = window.prompt('Please enter your email to confirm:');
    }
    try {
      const result = await auth.signInWithEmailLink(email, window.location.href);
      localStorage.removeItem('adminEmailForSignIn');
      window.history.replaceState({}, document.title, window.location.pathname);
    } catch(e) {
      console.error('Email link sign-in error:', e);
    }
  }
});

// ── Auth State ────────────────────────────────────────────────
auth.onAuthStateChanged(async (user) => {
  if (user) {
    let doc = await db.collection('users').doc(user.uid).get();
    const isAdmin   = doc.exists && doc.data().role === 'admin';
    const isPending = doc.exists && doc.data().status === 'pending';

    // Block pending users
    if (isPending && !isAdmin) {
      await auth.signOut();
      const err = document.getElementById('authError');
      if (err) {
        err.style.color = 'var(--danger)';
        err.textContent = '⏳ Your account is pending admin approval. Please wait.';
      }
      return;
    }

    currentUser = user;
    await loadUserRole(user.uid, user.email);
    showApp();
  } else {
    currentUser = null;
    currentRole = 'user';
    showLogin();
  }
});

// ── Load Role ─────────────────────────────────────────────────
async function loadUserRole(uid, email) {
  try {
    let doc = await db.collection('users').doc(uid).get();
    if (!doc.exists) doc = await db.collection('users').doc(email).get();
    currentRole = doc.exists ? (doc.data().role || 'user') : 'user';
  } catch(e) { currentRole = 'user'; }
}

// ── Show/Hide Pages ───────────────────────────────────────────
function showLogin() {
  document.getElementById('loginPage').style.display = 'flex';
  document.getElementById('appPage').style.display   = 'none';
  document.getElementById('loginFormSection').style.display = 'block';
  document.getElementById('magicLinkSection').style.display = 'none';
}

function showApp() {
  document.getElementById('loginPage').style.display = 'none';
  document.getElementById('appPage').style.display   = 'block';
  const emailEl = document.getElementById('navEmail');
  if (emailEl) emailEl.textContent = currentUser.email;
  const mEmail = document.getElementById('mobileEmail');
  if (mEmail) mEmail.textContent = currentUser.email;
  if (currentRole === 'admin') {
    ['navAdminBadge','navUploadBtn','navAdminBtn'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.style.display = 'inline-flex';
    });
    ['mobileAdminBadge','mobileUploadBtn','mobileAdminBtn'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.style.display = 'block';
    });
  }
  loadBooks();
}

// ── Sign In (Password) ────────────────────────────────────────
async function handleSignIn() {
  const email = document.getElementById('emailInput').value.trim();
  const pass  = document.getElementById('passwordInput').value;
  const err   = document.getElementById('authError');
  err.textContent = '';
  if (!email || !pass) { err.textContent = 'Please enter email and password.'; return; }
  try {
    await auth.signInWithEmailAndPassword(email, pass);
  } catch(e) { err.textContent = getAuthError(e.code); }
}

// ── Admin Magic Link ──────────────────────────────────────────
async function sendAdminMagicLink() {
  const email = document.getElementById('emailInput').value.trim();
  const err   = document.getElementById('authError');
  err.textContent = '';
  if (!email) { err.textContent = 'Please enter your admin email first.'; return; }

  // Check if admin
  const snap = await db.collection('users').where('email', '==', email).get();
  let isAdmin = false;
  snap.forEach(doc => { if (doc.data().role === 'admin') isAdmin = true; });
  if (!isAdmin) { err.textContent = 'This email is not an admin account.'; return; }

  try {
    const actionCodeSettings = {
      url: 'https://death-luck.github.io/webtool/',
      handleCodeInApp: true,
    };
    await auth.sendSignInLinkToEmail(email, actionCodeSettings);
    localStorage.setItem('adminEmailForSignIn', email);
    document.getElementById('loginFormSection').style.display = 'none';
    document.getElementById('magicLinkSection').style.display = 'block';
    document.getElementById('magicLinkEmail').textContent = email;
  } catch(e) {
    err.textContent = 'Error: ' + e.message;
  }
}

// ── Sign Up ───────────────────────────────────────────────────
async function handleSignUp() {
  const email = document.getElementById('emailInput').value.trim();
  const pass  = document.getElementById('passwordInput').value;
  const err   = document.getElementById('authError');
  err.textContent = '';
  if (!email || !pass) { err.textContent = 'Please enter email and password.'; return; }
  if (pass.length < 6) { err.textContent = 'Password must be at least 6 characters.'; return; }
  try {
    const cred = await auth.createUserWithEmailAndPassword(email, pass);
    await db.collection('users').doc(cred.user.uid).set({
      email, role: 'user', status: 'pending',
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    });
    await auth.signOut();
    err.style.color   = 'var(--success)';
    err.textContent   = '✅ Account created! Wait for admin approval.';
  } catch(e) { err.textContent = getAuthError(e.code); }
}

async function handleLogout() {
  await auth.signOut();
  closeMobileMenu();
}

function getAuthError(code) {
  const map = {
    'auth/user-not-found':       'No account found with this email.',
    'auth/wrong-password':       'Incorrect password.',
    'auth/email-already-in-use': 'Email already registered.',
    'auth/invalid-email':        'Invalid email address.',
    'auth/weak-password':        'Password is too weak.',
    'auth/too-many-requests':    'Too many attempts. Try again later.',
  };
  return map[code] || 'Something went wrong. Please try again.';
}

// ── Mobile Menu ───────────────────────────────────────────────
function toggleMobileMenu() { document.getElementById('mobileMenu').classList.toggle('open'); }
function closeMobileMenu()  { document.getElementById('mobileMenu').classList.remove('open'); }
document.addEventListener('click', (e) => {
  const menu = document.getElementById('mobileMenu');
  const btn  = document.getElementById('hamburgerBtn');
  if (menu && btn && !menu.contains(e.target) && !btn.contains(e.target)) {
    menu.classList.remove('open');
  }
});
