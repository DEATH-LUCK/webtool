// ============================================================
// LIBRARY-PAGE.JS — Separate Library hub (not the Book Library)
// ============================================================
let libraryHubFolders = [];
let libraryHubItems = [];
let libraryHubCurrent = null;

const LIBRARY_DEFAULT_TREE = [
  { id:'Software', icon:'💻', children:[
    { id:'Windows', icon:'🪟', children:[{id:'Apps',icon:'📱'},{id:'Games',icon:'🎮'}] },
    { id:'Android', icon:'🤖', children:[{id:'Apps',icon:'📱'},{id:'Games',icon:'🎮'}] }
  ]},
  { id:'Entertainment', icon:'🎬', children:[{id:'Music',icon:'🎵'},{id:'Videos',icon:'🎬'}] },
  { id:'Archive', icon:'📦', children:[] }
];

function libraryFolderDocId(path) { return 'lib_' + path.map(x=>x.toLowerCase().replace(/[^a-z0-9]+/g,'_')).join('__'); }

async function ensureLibraryDefaults() {
  const snap = await db.collection('folders').where('scope','==','library').get();
  const existing = new Set(snap.docs.map(d=>d.id));
  const batch = db.batch();
  let writes = 0;
  const walk = (nodes, parent=null, path=[]) => {
    nodes.forEach(n=>{
      const next = [...path, n.id];
      const id = libraryFolderDocId(next);
      if (!existing.has(id)) {
        batch.set(db.collection('folders').doc(id), { id, name:n.id, icon:n.icon||'📁', parent, scope:'library', path:next, createdAt:firebase.firestore.FieldValue.serverTimestamp() });
        writes++;
      }
      walk(n.children||[], id, next);
    });
  };
  walk(LIBRARY_DEFAULT_TREE);
  if (writes) await batch.commit();
}

async function loadLibraryHub() {
  try {
    await ensureLibraryDefaults();
    const fSnap = await db.collection('folders').where('scope','==','library').get();
    libraryHubFolders = fSnap.docs.map(d=>({id:d.id,...d.data()}));
    const bSnap = await db.collection('books').where('libraryScope','==','library').get();
    libraryHubItems = bSnap.docs.map(d=>({id:d.id,...d.data()}));
  } catch(e) {
    console.error('Library hub load error:',e);
    showToast('Library could not be loaded: '+e.message,'error');
  }
  renderLibraryHub();
}

function openLibraryHub() {
  if (typeof closeReader==='function') closeReader();
  const hub=document.getElementById('libraryHubPage');
  const app=document.getElementById('appPage');
  if (!hub) return;
  if (app) app.style.display='none';
  hub.style.display='block';
  closeSidebarMobileSafe();
  libraryHubCurrent=null;
  loadLibraryHub();
}
function closeLibraryHub() {
  const hub=document.getElementById('libraryHubPage');
  const app=document.getElementById('appPage');
  if (hub) hub.style.display='none';
  if (app) app.style.display='block';
  if (typeof loadBooks==='function') loadBooks();
}
function closeSidebarMobileSafe(){ try{ if(typeof closeSidebarMobile==='function') closeSidebarMobile(); }catch(e){} }

function libraryChildren(parent) { return libraryHubFolders.filter(f=>(f.parent||null)===(parent||null)).sort((a,b)=>(a.path?.length||0)-(b.path?.length||0) || (a.name||a.id).localeCompare(b.name||b.id)); }
function libraryFolder(id){ return libraryHubFolders.find(f=>f.id===id); }
function libraryDescendants(id){
  const out=[]; const q=[id];
  while(q.length){ const p=q.shift(); const kids=libraryChildren(p); kids.forEach(k=>{out.push(k.id);q.push(k.id);}); }
  return out;
}
function libraryItemCount(folderId){ const ids=new Set([folderId,...libraryDescendants(folderId)]); return libraryHubItems.filter(x=>ids.has(x.category)).length; }
function librarySafe(text){ return typeof escapeHtml==='function'?escapeHtml(String(text)):String(text).replace(/[&<>\"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;',"'":'&#39;'}[m])); }

function renderLibraryHub(){
  const root=document.getElementById('libraryHubRoot'); if(!root) return;
  if(libraryHubCurrent){ renderLibraryFolder(libraryHubCurrent); return; }
  const tops=libraryChildren(null);
  root.innerHTML=`<div class="library-hub-header"><div><div class="library-hub-kicker">📚 LIBRARY</div><h1>Library</h1><p>Software, entertainment and archived resources.</p></div></div><div class="library-hub-grid">${tops.map(f=>libraryHubCard(f)).join('')}</div>`;
}
function libraryHubCard(f){
  const kids=libraryChildren(f.id);
  return `<button class="library-hub-card" onclick="openLibraryFolder('${f.id}')"><span class="library-hub-icon">${librarySafe(f.icon||'📁')}</span><span class="library-hub-card-title">${librarySafe(f.name||f.id)}</span><span class="library-hub-card-meta">${kids.length?kids.length+' categories · ':''}${libraryItemCount(f.id)} items</span></button>`;
}
function openLibraryFolder(id){ libraryHubCurrent=id; renderLibraryHub(); }
function renderLibraryFolder(id){
  const root=document.getElementById('libraryHubRoot'); const f=libraryFolder(id); if(!root||!f)return;
  const kids=libraryChildren(id); const items=libraryHubItems.filter(x=>x.category===id);
  const parent=f.parent?libraryFolder(f.parent):null;
  root.innerHTML=`<div class="library-hub-header"><button class="btn btn-ghost" onclick="${parent?`openLibraryFolder('${parent.id}')`:'renderLibraryHub()'}">← Back</button><div style="flex:1"><div class="library-hub-kicker">📚 LIBRARY</div><h1>${librarySafe(f.icon||'📁')} ${librarySafe(f.name||f.id)}</h1><p>${librarySafe(f.path?.join(' / ')||'')}</p></div></div><div class="library-hub-grid">${kids.map(k=>libraryHubCard(k)).join('')}</div>${items.length?`<div class="library-hub-items"><h2>Items</h2><div class="library-hub-item-list">${items.map(libraryItemCard).join('')}</div></div>`:'<div class="library-hub-empty">No items in this category yet.</div>'}`;
}
function libraryItemCard(item){
  const title=librarySafe(item.title||'Untitled');
  const canRead=['pdf','epub','txt'].includes((item.fileType||'').toLowerCase());
  return `<div class="library-hub-item"><div><strong>${title}</strong><span>${librarySafe(item.author||item.fileType||'')}</span></div><div class="library-hub-item-actions">${canRead?`<button class="btn btn-primary btn-sm" onclick='openLibraryItemReader(${JSON.stringify(item).replace(/</g,'\\u003c')})'>Open</button>`:''}<a class="btn btn-ghost btn-sm" href="${librarySafe(item.downloadUrl||'#')}" target="_blank" rel="noopener">Download</a></div></div>`;
}
function openLibraryItemReader(item){ if(typeof openReader==='function') openReader(item); }
