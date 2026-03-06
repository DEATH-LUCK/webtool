// ============================================================
// ADMIN.JS — Admin Panel: Users, Folders, Move Books
// ============================================================

// ── Show/Hide Admin Panel ─────────────────────────────────────
function openAdminPanel() {
  document.getElementById('adminPanel').classList.add('open');
  loadAdminPanel();
}
function closeAdminPanel() {
  document.getElementById('adminPanel').classList.remove('open');
}

async function loadAdminPanel() {
  await loadUsersTab();
  await loadFoldersTab();
}

// ── USERS TAB ─────────────────────────────────────────────────
async function loadUsersTab() {
  const container = document.getElementById('adminUsersList');
  container.innerHTML = '<p style="color:var(--text2)">Loading...</p>';
  try {
    const snapshot = await db.collection('users').get();
    container.innerHTML = '';
    if (snapshot.empty) { container.innerHTML = '<p style="color:var(--text2)">No users found.</p>'; return; }

    snapshot.docs.forEach(doc => {
      const data = doc.data();
      const isAdmin = data.role === 'admin';
      const div = document.createElement('div');
      div.className = 'admin-user-row';
      div.innerHTML = `
        <div class="admin-user-info">
          <div class="admin-user-email">${doc.id}</div>
          <div class="admin-user-role ${isAdmin ? 'role-admin' : 'role-user'}">${isAdmin ? '👑 Admin' : '👤 User'}</div>
        </div>
        <div class="admin-user-actions">
          ${doc.id !== currentUser.email ? `
            <button class="btn btn-ghost btn-sm" onclick="toggleAdminRole('${doc.id}', ${isAdmin})">
              ${isAdmin ? '⬇️ Make User' : '⬆️ Make Admin'}
            </button>
          ` : '<span style="color:var(--text2); font-size:0.75rem;">You</span>'}
        </div>`;
      container.appendChild(div);
    });
  } catch(e) {
    container.innerHTML = `<p style="color:var(--danger)">Error: ${e.message}</p>`;
  }
}

async function toggleAdminRole(email, isCurrentlyAdmin) {
  try {
    // Find user by email
    const snapshot = await db.collection('users').where('email', '==', email).get();
    let userId = null;

    if (!snapshot.empty) {
      userId = snapshot.docs[0].id;
    } else {
      // Try using email as doc ID
      userId = email;
    }

    const newRole = isCurrentlyAdmin ? 'user' : 'admin';
    await db.collection('users').doc(userId).update({ role: newRole });
    showToast(`${email} is now ${newRole}! ✅`, 'success');
    await loadUsersTab();
  } catch(e) {
    showToast('Error: ' + e.message, 'error');
  }
}

// Add new admin by email
async function addNewAdmin() {
  const email = document.getElementById('newAdminEmail').value.trim();
  if (!email) { showToast('Email daalo', 'error'); return; }

  try {
    // Check if user exists
    const snapshot = await db.collection('users').get();
    let found = false;
    for (const doc of snapshot.docs) {
      if (doc.id === email || doc.data().email === email) {
        await db.collection('users').doc(doc.id).update({ role: 'admin' });
        found = true;
        break;
      }
    }
    if (!found) {
      // Create user doc with admin role (they'll get it on next login)
      await db.collection('users').doc(email).set({ role: 'admin', email: email }, { merge: true });
    }
    showToast(`${email} ko admin bana diya! ✅`, 'success');
    document.getElementById('newAdminEmail').value = '';
    await loadUsersTab();
  } catch(e) {
    showToast('Error: ' + e.message, 'error');
  }
}

// ── FOLDERS TAB ───────────────────────────────────────────────
async function loadFoldersTab() {
  const container = document.getElementById('adminFoldersList');
  container.innerHTML = '<p style="color:var(--text2)">Loading...</p>';
  try {
    const snapshot = await db.collection('books').get();
    const folderMap = {};
    snapshot.docs.forEach(doc => {
      const cat = doc.data().category || 'General';
      if (!folderMap[cat]) folderMap[cat] = [];
      folderMap[cat].push({ id: doc.id, ...doc.data() });
    });

    container.innerHTML = '';

    // Add new folder button
    const addDiv = document.createElement('div');
    addDiv.className = 'admin-new-folder';
    addDiv.innerHTML = `
      <input type="text" id="newFolderNameInput" class="form-input" placeholder="New folder name..." style="flex:1;">
      <button class="btn btn-primary btn-sm" onclick="createNewFolder()">➕ Create</button>`;
    container.appendChild(addDiv);

    Object.entries(folderMap).forEach(([folder, books]) => {
      const div = document.createElement('div');
      div.className = 'admin-folder-row';
      div.innerHTML = `
        <div class="admin-folder-header">
          <span>📁 <strong>${folder}</strong> <span style="color:var(--text2); font-size:0.8rem;">(${books.length} books)</span></span>
          <button class="btn btn-danger btn-sm" onclick="deleteFolder('${folder}', ${books.length})">🗑 Delete Folder</button>
        </div>
        <div class="admin-folder-books">
          ${books.map(b => `
            <div class="admin-book-row">
              <span class="admin-book-title">${b.title}</span>
              <select class="form-input admin-move-select" style="width:130px; padding:4px 8px; font-size:0.78rem;" onchange="moveBook('${b.id}', this.value, '${folder}')">
                <option value="">📂 Move to...</option>
                ${Object.keys(folderMap).filter(f => f !== folder).map(f => `<option value="${f}">${f}</option>`).join('')}
              </select>
            </div>`).join('')}
        </div>`;
      container.appendChild(div);
    });
  } catch(e) {
    container.innerHTML = `<p style="color:var(--danger)">Error: ${e.message}</p>`;
  }
}

// Create new empty folder (just a placeholder — real folder created on upload)
async function createNewFolder() {
  const name = document.getElementById('newFolderNameInput').value.trim();
  if (!name) { showToast('Folder ka naam daalo', 'error'); return; }

  // Store folder in a folders collection
  try {
    await db.collection('folders').doc(name).set({ name, createdAt: firebase.firestore.FieldValue.serverTimestamp() });
    showToast(`📁 "${name}" folder bana diya!`, 'success');
    document.getElementById('newFolderNameInput').value = '';
    addFolderToDropdown(name);
    await loadAllFolders(); // Refresh folder cache
    await loadFoldersTab();
    await loadBooks();
  } catch(e) {
    showToast('Error: ' + e.message, 'error');
  }
}

function addFolderToDropdown(name) {
  const select = document.getElementById('bookCategory');
  if (!select) return;
  const exists = Array.from(select.options).some(o => o.value === name);
  if (!exists) {
    const opt = document.createElement('option');
    opt.value = name;
    opt.textContent = '📁 ' + name;
    const lastOpt = select.querySelector('option[value="__new__"]');
    select.insertBefore(opt, lastOpt);
  }
}

// Move book to another folder
async function moveBook(bookId, newFolder, oldFolder) {
  if (!newFolder) return;
  try {
    await db.collection('books').doc(bookId).update({ category: newFolder });
    showToast(`Book moved to "${newFolder}"! ✅`, 'success');
    await loadFoldersTab();
    await loadBooks();
  } catch(e) {
    showToast('Error: ' + e.message, 'error');
  }
}

// Delete folder and all its books
async function deleteFolder(folder, bookCount) {
  if (!confirm(`"${folder}" folder aur uski ${bookCount} books DELETE hongi. Pakka?`)) return;
  try {
    const snapshot = await db.collection('books').where('category', '==', folder).get();
    const batch = db.batch();
    snapshot.docs.forEach(doc => batch.delete(doc.ref));
    await batch.commit();

    // Also delete folder doc if exists
    await db.collection('folders').doc(folder).delete().catch(() => {});

    showToast(`"${folder}" folder delete ho gaya! 🗑`, 'success');
    await loadFoldersTab();
    await loadBooks();
  } catch(e) {
    showToast('Error: ' + e.message, 'error');
  }
}

// Switch admin panel tabs
function switchAdminTab(tab) {
  document.querySelectorAll('.admin-tab-btn').forEach(b => b.classList.remove('active'));
  document.querySelectorAll('.admin-tab-content').forEach(c => c.style.display = 'none');
  document.getElementById(`adminTab_${tab}`).style.display = 'block';
  event.target.classList.add('active');
}
