// ============================================================
// AUTH.JS
// ============================================================
let currentUser = null;
let currentRole = 'user';

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

auth.onAuthStateChanged(async (user) => {
  if (user) {
    currentUser = user;
    await loadUserRole(user.uid, user.email);
    showApp();
  } else {
    currentUser = null;
    currentRole = 'user';
    showLogin();
  }
});

async function loadUserRole(uid, email) {
  try {
    let doc = await db.collection('users').doc(uid).get();
    if (!doc.exists) doc = await db.collection('users').doc(email).get();
    currentRole = doc.exists ? (doc.data().role || 'user') : 'user';
  } catch(e) { currentRole = 'user'; }
}

function showLogin() {
  document.getElementById('loginPage').style.display = 'flex';
  document.getElementById('appPage').style.display   = 'none';
}

function showApp() {
  document.getElementById('loginPage').style.display = 'none';
  document.getElementById('appPage').style.display   = 'block';

  // Sync email display — desktop and mobile
  const emailEl   = document.getElementById('navEmail');
  const mEmailEl  = document.getElementById('mobileEmail');
  if (emailEl  && currentUser) emailEl.textContent  = currentUser.email;
  if (mEmailEl && currentUser) mEmailEl.textContent = currentUser.email;

  if (currentRole === 'admin') {
    ['navAdminBadge','navUploadBtn','navAdminBtn','navBulkBtn'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.style.display = 'inline-flex';
    });
    ['mobileAdminBadge','mobileUploadBtn','mobileAdminBtn','mobileBulkBtn'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.style.display = 'block';
    });
    const btBtn = document.getElementById('bulkToggleBtn');
    if (btBtn) btBtn.style.display = 'inline-flex';
  }
  loadBooks();
}

async function handleSignIn() {
  const email = document.getElementById('emailInput').value.trim();
  const pass  = document.getElementById('passwordInput').value;
  const err   = document.getElementById('authError');
  err.textContent = '';
  if (!email || !pass) { err.textContent = 'Please enter email and password.'; return; }
  try { await auth.signInWithEmailAndPassword(email, pass); }
  catch(e) { err.textContent = getAuthError(e.code); }
}

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
      email, role: 'user',
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    });
  } catch(e) { err.textContent = getAuthError(e.code); }
}

async function handleLogout() {
  await auth.signOut();
  closeMobileMenu();
}

function getAuthError(code) {
  const map = {
    'auth/user-not-found':     'No account found with this email.',
    'auth/wrong-password':     'Incorrect password.',
    'auth/email-already-in-use': 'Email already registered.',
    'auth/invalid-email':      'Invalid email address.',
    'auth/weak-password':      'Password is too weak.',
    'auth/too-many-requests':  'Too many attempts. Try again later.',
    'auth/invalid-credential': 'Invalid email or password.',
  };
  return map[code] || 'Something went wrong. Please try again.';
}

function toggleMobileMenu() {
  document.getElementById('mobileMenu').classList.toggle('open');
}
function closeMobileMenu() {
  document.getElementById('mobileMenu').classList.remove('open');
}
document.addEventListener('click', (e) => {
  const menu = document.getElementById('mobileMenu');
  const btn  = document.getElementById('hamburgerBtn');
  if (menu && btn && !menu.contains(e.target) && !btn.contains(e.target)) {
    menu.classList.remove('open');
  }
});
