// ============================================================
// AUTH.JS — Login, Signup, Logout, Role Management
// ============================================================

let currentUser = null;
let currentRole = null;

// ── Auth State Observer ───────────────────────────────────────
auth.onAuthStateChanged(async (user) => {
  if (user) {
    currentUser = user;
    currentRole = await getCurrentUserRole();
    showApp();
  } else {
    currentUser = null;
    currentRole = null;
    showLogin();
  }
});

function showApp() {
  document.getElementById('loginPage').style.display = 'none';
  document.getElementById('appPage').style.display = 'block';

  // Set navbar info
  document.getElementById('navUserEmail').textContent = currentUser.email;

  if (currentRole === 'admin') {
    document.getElementById('navAdminBadge').style.display = 'inline-block';
    document.getElementById('uploadNavBtn').style.display = 'inline-flex';
    const apBtn = document.getElementById('adminPanelBtn');
    const mapBtn = document.getElementById('mobileAdminPanelBtn');
    if (apBtn) apBtn.style.display = 'inline-flex';
    if (mapBtn) mapBtn.style.display = 'block';
  }

  showLibrary();
  loadBooks();
  setTimeout(syncMobileMenu, 300);
}

function showLogin() {
  document.getElementById('loginPage').style.display = 'flex';
  document.getElementById('appPage').style.display = 'none';
}

// ── Login ─────────────────────────────────────────────────────
async function handleLogin() {
  const email = document.getElementById('loginEmail').value.trim();
  const password = document.getElementById('loginPassword').value;
  const btn = document.getElementById('loginBtn');
  const errorEl = document.getElementById('loginError');

  if (!email || !password) {
    showLoginError('Please enter email and password');
    return;
  }

  btn.disabled = true;
  btn.textContent = 'Signing in...';
  errorEl.classList.remove('show');

  try {
    await auth.signInWithEmailAndPassword(email, password);
    // onAuthStateChanged handles the rest
  } catch (err) {
    showLoginError(getFriendlyAuthError(err.code));
    btn.disabled = false;
    btn.textContent = 'Sign In';
  }
}

// ── Signup ────────────────────────────────────────────────────
async function handleSignup() {
  const email = document.getElementById('loginEmail').value.trim();
  const password = document.getElementById('loginPassword').value;
  const btn = document.getElementById('signupBtn');
  const errorEl = document.getElementById('loginError');

  if (!email || !password) {
    showLoginError('Please enter email and password');
    return;
  }
  if (password.length < 6) {
    showLoginError('Password must be at least 6 characters');
    return;
  }

  btn.disabled = true;
  btn.textContent = 'Creating account...';
  errorEl.classList.remove('show');

  try {
    await auth.createUserWithEmailAndPassword(email, password);
    // Role 'user' is set in getCurrentUserRole() on first load
    showToast('Account created! Welcome.', 'success');
  } catch (err) {
    showLoginError(getFriendlyAuthError(err.code));
    btn.disabled = false;
    btn.textContent = 'Create Account';
  }
}

// ── Logout ────────────────────────────────────────────────────
async function handleLogout() {
  await auth.signOut();
  currentUser = null;
  currentRole = null;
  // Reset admin UI
  document.getElementById('navAdminBadge').style.display = 'none';
  document.getElementById('uploadNavBtn').style.display = 'none';
}

// ── Helpers ───────────────────────────────────────────────────
function showLoginError(msg) {
  const el = document.getElementById('loginError');
  el.textContent = msg;
  el.classList.add('show');
}

function getFriendlyAuthError(code) {
  const errors = {
    'auth/invalid-email':       'Invalid email address.',
    'auth/user-not-found':      'No account found with this email.',
    'auth/wrong-password':      'Incorrect password.',
    'auth/email-already-in-use':'This email is already registered.',
    'auth/weak-password':       'Password is too weak.',
    'auth/too-many-requests':   'Too many attempts. Try later.',
    'auth/invalid-credential':  'Incorrect email or password.',
  };
  return errors[code] || 'Something went wrong. Please try again.';
}

// ── Enter key submit ──────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('loginPassword')?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') handleLogin();
  });
});

// ── Toast Utility ─────────────────────────────────────────────
function showToast(message, type = 'info', duration = 3500) {
  const container = document.getElementById('toastContainer');
  const icons = { success: '✅', error: '❌', info: 'ℹ️' };
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.innerHTML = `<span>${icons[type] || 'ℹ️'}</span> ${message}`;
  container.appendChild(toast);
  setTimeout(() => {
    toast.classList.add('toast-out');
    setTimeout(() => toast.remove(), 350);
  }, duration);
}

// ── Theme Toggle ──────────────────────────────────────────────
function toggleTheme() {
  const isLight = document.body.classList.toggle('light-mode');
  localStorage.setItem('theme', isLight ? 'light' : 'dark');
  document.getElementById('themeToggleBtn').textContent = isLight ? '☀️' : '🌙';
}

// Apply saved theme on load
(function() {
  const saved = localStorage.getItem('theme');
  if (saved === 'light') {
    document.body.classList.add('light-mode');
    // Wait for DOM
    window.addEventListener('DOMContentLoaded', () => {
      const btn = document.getElementById('themeToggleBtn');
      if (btn) btn.textContent = '☀️';
    });
  }
})();

// ── Hamburger Menu ────────────────────────────────────────────
function toggleMobileMenu() {
  const menu = document.getElementById('mobileMenu');
  menu.classList.toggle('open');
}

// Close menu when clicking outside
document.addEventListener('click', (e) => {
  const menu = document.getElementById('mobileMenu');
  const btn = document.getElementById('hamburgerBtn');
  if (menu && btn && !menu.contains(e.target) && !btn.contains(e.target)) {
    menu.classList.remove('open');
  }
});

// Sync mobile menu with admin role
function syncMobileMenu() {
  const email = document.getElementById('navUserEmail')?.textContent;
  const mobileEmail = document.getElementById('mobileUserEmail');
  const mobileAdmin = document.getElementById('mobileAdminBadge');
  const mobileUpload = document.getElementById('mobileUploadBtn');

  if (mobileEmail) mobileEmail.textContent = email || '';
  if (currentRole === 'admin') {
    if (mobileAdmin) mobileAdmin.style.display = 'block';
    if (mobileUpload) mobileUpload.style.display = 'block';
  }
}

// Update theme button text in mobile menu
const _origToggle = window.toggleTheme;
window.toggleTheme = function() {
  _origToggle && _origToggle();
  const isLight = document.body.classList.contains('light-mode');
  const mobileBtn = document.getElementById('mobileThemeBtn');
  if (mobileBtn) mobileBtn.textContent = isLight ? '☀️ Dark / Light Mode' : '🌙 Dark / Light Mode';
};
