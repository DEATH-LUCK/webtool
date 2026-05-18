// ============================================================
// AUTH.JS
// ============================================================
let currentUser = null;
let currentRole = 'user';
let isSuperAdmin = false;

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
      email = await showPrompt('Verify Identity', 'Please enter your email to confirm sign-in:');
    }
    try {
      const result = await auth.signInWithEmailLink(email, window.location.href);
      localStorage.removeItem('adminEmailForSignIn');
      window.history.replaceState({}, document.title, window.location.pathname);
    } catch(e) {
      console.error('Email link sign-in error:', e);
      const err = document.getElementById('authError');
      if (err) {
        err.textContent = getAuthError(e.code) || 'Something went wrong with email link sign-in. Please try again.';
        showLogin();
      }
    }
  }
});

// ── Auth State ────────────────────────────────────────────────
auth.onAuthStateChanged(async (user) => {
  try {
    if (user) {
      let doc = await db.collection('users').doc(user.uid).get();
      const userData = doc.exists ? doc.data() : null;

      // Blocks users who are not approved or are banned
      if (userData && (userData.status === 'pending' || userData.status === 'banned')) {
        await auth.signOut();
        const err = document.getElementById('authError');
        if (err) {
          err.style.color = 'var(--red)';
          if (userData.status === 'banned') {
            err.textContent = '🚫 Account banned. Please contact the administrator.';
          } else {
            err.textContent = '⏳ Your account is pending admin approval. Please wait.';
          }
        }
        return;
      }

      currentUser = user;
      await loadUserRole(user.uid, user.email);
      showApp();
    } else {
      currentUser = null;
      currentRole = 'user';
      isSuperAdmin = false;
      showLogin();
    }
  } catch (e) {
    console.error("Auth state error:", e);
    showLogin();
    const err = document.getElementById('authError');
    if (err) err.textContent = "Error: " + e.message;
  }
});

// ── Load Role ─────────────────────────────────────────────────
async function loadUserRole(uid, email) {
  try {
    // Try by UID first
    let doc = await db.collection('users').doc(uid).get();
    // Try by email if not found
    if (!doc.exists && email) {
      const snap = await db.collection('users').where('email','==',email).get();
      if (!snap.empty) doc = snap.docs[0];
    }
    if (doc && doc.exists) {
      const data = doc.data();
      currentRole = data.role || 'user';
      isSuperAdmin = data.superadmin === true;
    } else {
      currentRole = 'user';
      isSuperAdmin = false;
    }
    console.log('Role loaded:', currentRole, '(Super:', isSuperAdmin, ') for', email);
  } catch(e) {
    console.error('loadUserRole error:', e);
    currentRole = 'user';
    isSuperAdmin = false;
  }
}

// ── Show/Hide Pages ───────────────────────────────────────────
function showLogin() {
  document.getElementById('loginPage').style.display = 'flex';
  document.getElementById('appPage').style.display   = 'none';
  document.getElementById('loginFormSection').style.display = 'block';
  document.getElementById('magicLinkSection').style.display = 'none';
  switchTab('signIn', document.querySelector('.tab-btn'));
}

function showApp() {
  document.getElementById('loginPage').style.display = 'none';
  document.getElementById('appPage').style.display   = 'block';

  // Update email in navbar
  const emailEl = document.getElementById('navEmail');
  if (emailEl) emailEl.textContent = currentUser.email;
  const mEmail = document.getElementById('mobileEmail');
  if (mEmail) mEmail.textContent = currentUser.email;

  // Hide all admin elements first
  ['navUploadBtn', 'navAdminBtn'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.style.display = 'none';
  });
  ['mobileUploadBtn', 'mobileAdminBtn'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.style.display = 'none';
  });

  // Show admin elements if admin
  if (currentRole === 'admin') {
    ['navUploadBtn', 'navAdminBtn'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.style.display = 'inline-flex';
    });
    ['mobileUploadBtn', 'mobileAdminBtn'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.style.display = 'block';
    });
    ['bulkToggleBtn'].forEach(id => { // Bulk select button for desktop
      const el = document.getElementById(id);
      if (el) el.style.display = 'block';
    });
  }

  loadBooks();
}

// ── Sign In (Password) ────────────────────────────────────────
async function handleSignIn() {
  const email = document.getElementById('signInEmail').value.trim();
  const pass  = document.getElementById('signInPassword').value;
  const err   = document.getElementById('authError');
  err.style.color = 'var(--cream)';
  err.textContent = '';
  if (!email || !pass) { err.style.color = 'var(--red)'; err.textContent = 'Please enter email and password.'; return; }

  try {
    await auth.signInWithEmailAndPassword(email, pass);
  } catch(e) {
    console.error('Sign-in error:', e);
    const message = getAuthError(e.code) || e.message || 'Something went wrong. Please try again.';
    err.style.color = 'var(--red)';
    err.textContent = message;
  }
}

// ── Forgot Password ───────────────────────────────────────────
async function handleForgotPassword() {
  const email = document.getElementById('signInEmail').value.trim();
  const err   = document.getElementById('authError');
  err.textContent = '';
  if (!email) { err.textContent = 'Please enter your email first.'; return; }
  try {
    await auth.sendPasswordResetEmail(email);
    err.style.color = 'var(--success)';
    err.textContent = '✅ Password reset email sent! Check your inbox.';
  } catch(e) {
    err.textContent = getAuthError(e.code);
  }
}

// ── Admin Magic Link ──────────────────────────────────────────
async function sendAdminMagicLink() {
  const email = document.getElementById('adminEmail').value.trim();
  const err   = document.getElementById('authError');
  err.style.color = 'var(--cream)';
  err.textContent = '';
  if (!email) { err.style.color = 'var(--red)'; err.textContent = 'Please enter your admin email.'; return; }

  // Check if admin
  const snap = await db.collection('users').where('email', '==', email).get();
  let isAdmin = false;
  snap.forEach(doc => { if (doc.data().role === 'admin') isAdmin = true; });
  if (!isAdmin) { err.style.color = 'var(--red)'; err.textContent = 'This email is not registered as an admin account.'; return; }

  try {
    const actionCodeSettings = {
      url: window.location.origin + window.location.pathname,
      handleCodeInApp: true,
    };
    await auth.sendSignInLinkToEmail(email, actionCodeSettings);
    localStorage.setItem('adminEmailForSignIn', email);
    err.style.color = 'var(--success)';
    err.textContent = '✅ Login link sent. Check your email.';
    document.getElementById('loginFormSection').style.display = 'none';
    document.getElementById('magicLinkSection').style.display = 'block';
    document.getElementById('magicLinkEmail').textContent = email;
  } catch(e) {
    err.style.color = 'var(--red)';
    err.textContent = 'Error sending login link: ' + e.message;
  }
}

// ── Sign Up ───────────────────────────────────────────────────
async function handleSignUp() {
  const email = document.getElementById('signUpEmail').value.trim();
  const pass  = document.getElementById('signUpPassword').value;
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
    'auth/user-not-found':             'No account found with this email.',
    'auth/wrong-password':             'Incorrect password.',
    'auth/email-already-in-use':       'Email already registered.',
    'auth/invalid-email':              'Invalid email address.',
    'auth/weak-password':              'Password is too weak.',
    'auth/too-many-requests':          'Too many attempts. Try again later.',
    'auth/network-request-failed':     'Network error. Check your internet connection.',
    'auth/user-disabled':              'This account has been disabled.',
    'auth/operation-not-allowed':      'Email/password sign-in is not enabled.',
    'auth/invalid-login-credentials':  'Invalid login credentials. Please check your email and password.',
  };
  return map[code] || null;
}

// ── Tab Switching ──────────────────────────────────────────────
function switchTab(tab, btn) {
  // Hide all tab contents
  document.querySelectorAll('.tab-content').forEach(content => content.style.display = 'none');
  // Remove active class from all buttons
  document.querySelectorAll('.tab-btn').forEach(button => button.classList.remove('active'));

  // Show selected tab
  const pane = document.getElementById(tab + 'Tab');
  if (pane) pane.style.display = 'block';
  // Add active class to clicked button
  if (btn && btn.classList) btn.classList.add('active');

  // Clear any previous errors
  const err = document.getElementById('authError');
  if (err) err.textContent = '';
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
