// ============================================================
// LIBRARY-PAGE.JS — Separate Library hub (not the Book Library)
// ============================================================
let libraryHubFolders = [];
let libraryHubItems = [];
let libraryHubCurrent = null;
let libraryHubSearch = '';
let libraryHubSort = 'name'; // 'name' | 'newest' | 'size'

const LIBRARY_DEFAULT_TREE = [
  { id:'Software', icon:'💻', children:[
    { id:'Windows', icon:'🪟', children:[{id:'Apps',icon:'📱'},{id:'Games',icon:'🎮'}] },
    { id:'Android', icon:'🤖', children:[{id:'Apps',icon:'📱'},{id:'Games',icon:'🎮'}] }
  ]},
  { id:'Entertainment', icon:'🎬', children:[{id:'Music',icon:'🎵'},{id:'Videos',icon:'🎬'}] },
  { id:'Archive', icon:'📦', children:[] }
];

function libraryFolderDocId(path) { return 'lib_' + path.map(x=>x.toLowerCase().replace(/[^a-z0-9]+/g,'_')).join('__'); }
function libraryVirtualDefaults(){
  const out=[];
  const walk=(nodes,parent=null,path=[])=>nodes.forEach(n=>{const next=[...path,n.id],id=libraryFolderDocId(next);out.push({id,name:n.id,icon:n.icon||'📁',parent,scope:'library',path:next});walk(n.children||[],id,next);});
  walk(LIBRARY_DEFAULT_TREE); return out;
}
async function ensureLibraryDefaults() {
  const snap = await db.collection('folders').where('scope','==','library').get();
  const existing = new Set(snap.docs.map(d=>d.id));
  const batch = db.batch(); let writes = 0;
  const walk = (nodes,parent=null,path=[]) => nodes.forEach(n=>{
    const next=[...path,n.id],id=libraryFolderDocId(next);
    if(!existing.has(id)){batch.set(db.collection('folders').doc(id),{id,name:n.id,icon:n.icon||'📁',parent,scope:'library',path:next,createdAt:firebase.firestore.FieldValue.serverTimestamp()});writes++;}
    walk(n.children||[],id,next);
  });
  walk(LIBRARY_DEFAULT_TREE); if(writes) await batch.commit();
}

async function loadLibraryHub() {
  try {
    await ensureLibraryDefaults();
    const fSnap=await db.collection('folders').where('scope','==','library').get();
    libraryHubFolders=fSnap.docs.map(d=>({id:d.id,...d.data()}));
    const bSnap=await db.collection('books').where('libraryScope','==','library').get();
    libraryHubItems=bSnap.docs.map(d=>{const x=d.data(); return {id:d.id,title:x.title,author:x.author,category:x.category,fileType:x.fileType,fileSize:x.fileSize,coverUrl:x.coverUrl,fileName:x.fileName,mimeType:x.mimeType,uploadedAt:x.uploadedAt,libraryScope:x.libraryScope};});
  } catch(e) {
    console.error('Library hub load error:',e);
    // Keep the public Library navigable even if Firestore rules temporarily block writes/reads.
    libraryHubFolders=libraryVirtualDefaults();
    libraryHubItems=[];
    showToast('Library categories loaded locally. Admin changes need Firestore permission.','error');
  }
  renderLibraryHub();
}
function openLibraryHub(){
  if(typeof closeReader==='function') closeReader();
  const hub=document.getElementById('libraryHubPage'),app=document.getElementById('appPage'); if(!hub)return;
  if(app)app.style.display='none'; hub.style.display='block'; closeSidebarMobileSafe();
  libraryHubCurrent=null; libraryHubSearch=''; libraryHubSort='name';
  loadLibraryHub();
}
function closeLibraryHub(){const hub=document.getElementById('libraryHubPage'),app=document.getElementById('appPage');if(hub)hub.style.display='none';if(app)app.style.display='block';if(typeof loadBooks==='function')loadBooks();}
function closeSidebarMobileSafe(){try{if(typeof closeSidebarMobile==='function')closeSidebarMobile();}catch(e){}}
function libraryChildren(parent){return libraryHubFolders.filter(f=>(f.parent||null)===(parent||null)).sort((a,b)=>(a.name||a.id).localeCompare(b.name||b.id));}
function libraryFolder(id){return libraryHubFolders.find(f=>f.id===id);}
function libraryDescendants(id){const out=[],q=[id];while(q.length){const p=q.shift();libraryChildren(p).forEach(k=>{out.push(k.id);q.push(k.id);});}return out;}
function libraryItemCount(folderId){const ids=new Set([folderId,...libraryDescendants(folderId)]);return libraryHubItems.filter(x=>ids.has(x.category)).length;}
function librarySafe(text){return typeof escapeHtml==='function'?escapeHtml(String(text)):String(text).replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));}

// ── Breadcrumb ancestry chain (root → current) ──────────────────
function libraryAncestryChain(id){
  const chain=[]; let f=libraryFolder(id);
  while(f){ chain.unshift(f); f=f.parent?libraryFolder(f.parent):null; }
  return chain;
}
function libraryBreadcrumbHtml(){
  const chain = libraryHubCurrent ? libraryAncestryChain(libraryHubCurrent) : [];
  let html = `<button class="lib-crumb${!libraryHubCurrent?' active':''}" onclick="libraryGoTo(null)">📚 All</button>`;
  chain.forEach((f,i)=>{
    const isLast = i===chain.length-1;
    html += `<span class="lib-crumb-sep">/</span><button class="lib-crumb${isLast?' active':''}" onclick="libraryGoTo('${f.id}')">${librarySafe(f.icon||'📁')} ${librarySafe(f.name||f.id)}</button>`;
  });
  return html;
}
function libraryGoTo(id){ libraryHubCurrent=id; libraryHubSearch=''; renderLibraryHub(); }

// ── Search + Sort toolbar ────────────────────────────────────────
function libraryToolbarHtml(){
  return `
    <div class="library-hub-toolbar">
      <div class="lib-search-wrap">
        <span class="lib-search-icon">🔍</span>
        <input type="text" id="libraryHubSearchInput" placeholder="Search this library..." value="${librarySafe(libraryHubSearch)}" oninput="libraryOnSearch(this.value)">
      </div>
      <select id="libraryHubSortSelect" class="lib-sort-select" onchange="libraryOnSort(this.value)">
        <option value="name"  ${libraryHubSort==='name'?'selected':''}>Sort: Name</option>
        <option value="newest" ${libraryHubSort==='newest'?'selected':''}>Sort: Newest</option>
        <option value="size"  ${libraryHubSort==='size'?'selected':''}>Sort: Size</option>
      </select>
    </div>`;
}
function libraryOnSearch(val){ libraryHubSearch = val; renderLibraryHub({keepFocus:'libraryHubSearchInput'}); }
function libraryOnSort(val){ libraryHubSort = val; renderLibraryHub(); }
function librarySortItems(items){
  const arr = [...items];
  if (libraryHubSort === 'newest') arr.sort((a,b)=> (b.uploadedAt?.toMillis?.()||0) - (a.uploadedAt?.toMillis?.()||0));
  else if (libraryHubSort === 'size') arr.sort((a,b)=> (b.fileSize||0) - (a.fileSize||0));
  else arr.sort((a,b)=> (a.title||'').localeCompare(b.title||''));
  return arr;
}

// ── Main render ───────────────────────────────────────────────
function renderLibraryHub(opts){
  const root=document.getElementById('libraryHubRoot'); if(!root)return;

  // Global search — active any time the search box has text, regardless of folder depth
  if (libraryHubSearch.trim()) {
    renderLibrarySearchResults();
  } else if (libraryHubCurrent) {
    renderLibraryFolder(libraryHubCurrent);
  } else {
    renderLibraryTop();
  }

  if (opts?.keepFocus) {
    const el = document.getElementById(opts.keepFocus);
    if (el) { el.focus(); const v = el.value; el.value=''; el.value=v; }
  }
}

function libraryStatsHtml(){
  const totalItems = libraryHubItems.length;
  const totalCats   = libraryHubFolders.length;
  const totalSize   = libraryHubItems.reduce((s,x)=>s+(x.fileSize||0),0);
  return `<div class="library-hub-stats">
    <div class="lib-stat"><span class="lib-stat-num">${totalItems}</span><span class="lib-stat-label">Items</span></div>
    <div class="lib-stat"><span class="lib-stat-num">${totalCats}</span><span class="lib-stat-label">Categories</span></div>
    <div class="lib-stat"><span class="lib-stat-num">${formatSize(totalSize)}</span><span class="lib-stat-label">Total Size</span></div>
  </div>`;
}

function renderLibraryTop(){
  const root=document.getElementById('libraryHubRoot');
  const tops=libraryChildren(null);
  root.innerHTML=`
    <div class="library-hub-header">
      <div>
        <div class="library-hub-kicker">📚 LIBRARY</div>
        <h1>Library</h1>
        <p>Software, entertainment and archived resources.</p>
      </div>
    </div>
    ${libraryStatsHtml()}
    <div class="library-hub-breadcrumbs">${libraryBreadcrumbHtml()}</div>
    ${libraryToolbarHtml()}
    <div class="library-hub-grid">${tops.map(libraryHubCard).join('') || '<div class="library-hub-empty">No categories yet.</div>'}</div>`;
}

function libraryHubCard(f){const kids=libraryChildren(f.id);return `<button class="library-hub-card" onclick="openLibraryFolder('${f.id}')"><span class="library-hub-icon">${librarySafe(f.icon||'📁')}</span><span class="library-hub-card-title">${librarySafe(f.name||f.id)}</span><span class="library-hub-card-meta">${kids.length?kids.length+' categories · ':''}${libraryItemCount(f.id)} items</span></button>`;}
function openLibraryFolder(id){libraryHubCurrent=id;libraryHubSearch='';renderLibraryHub();}
function libraryItemUrl(item,mode='inline'){return (typeof LIBRARY_PROXY_BASE!=='undefined'&&LIBRARY_PROXY_BASE)?`${LIBRARY_PROXY_BASE}?item=${encodeURIComponent(item.id)}&mode=${mode}`:'';}

function renderLibraryFolder(id){
  const root=document.getElementById('libraryHubRoot'),f=libraryFolder(id);
  if(!root||!f)return;
  const kids=libraryChildren(id);
  const items=librarySortItems(libraryHubItems.filter(x=>x.category===id));
  root.innerHTML=`
    <div class="library-hub-header">
      <button class="btn btn-ghost" onclick="libraryGoTo(${f.parent?`'${f.parent}'`:'null'})">← Back</button>
      <div style="flex:1">
        <div class="library-hub-kicker">📚 LIBRARY</div>
        <h1>${librarySafe(f.icon||'📁')} ${librarySafe(f.name||f.id)}</h1>
        <p>${librarySafe(f.path?.join(' / ')||'')}</p>
      </div>
    </div>
    <div class="library-hub-breadcrumbs">${libraryBreadcrumbHtml()}</div>
    ${libraryToolbarHtml()}
    ${kids.length ? `<div class="library-hub-grid">${kids.map(libraryHubCard).join('')}</div>` : ''}
    ${items.length
      ? `<div class="library-hub-items"><h2>Items <span class="lib-item-count">${items.length}</span></h2><div class="library-hub-item-list">${items.map(x=>libraryItemCard(x)).join('')}</div></div>`
      : (kids.length ? '' : '<div class="library-hub-empty">No items in this category yet.</div>')}`;
}

function renderLibrarySearchResults(){
  const root=document.getElementById('libraryHubRoot');
  const q = libraryHubSearch.trim().toLowerCase();
  const scopeIds = libraryHubCurrent ? new Set([libraryHubCurrent, ...libraryDescendants(libraryHubCurrent)]) : null;
  let results = libraryHubItems.filter(x =>
    (!scopeIds || scopeIds.has(x.category)) &&
    ((x.title||'').toLowerCase().includes(q) || (x.author||'').toLowerCase().includes(q))
  );
  results = librarySortItems(results);

  root.innerHTML=`
    <div class="library-hub-header">
      <div>
        <div class="library-hub-kicker">📚 LIBRARY</div>
        <h1>Search results</h1>
        <p>${results.length} match${results.length===1?'':'es'} for "${librarySafe(libraryHubSearch)}"</p>
      </div>
    </div>
    <div class="library-hub-breadcrumbs">${libraryBreadcrumbHtml()}</div>
    ${libraryToolbarHtml()}
    ${results.length
      ? `<div class="library-hub-items"><div class="library-hub-item-list">${results.map(x=>libraryItemCard(x,true)).join('')}</div></div>`
      : `<div class="library-hub-empty">No items match "${librarySafe(libraryHubSearch)}".</div>`}`;
}

// ── Item card — file icon, size, upload date ────────────────────
function libraryFileIcon(type){
  const icons = {
    pdf:'📕', epub:'📗', txt:'📄', doc:'📝', docx:'📝',
    apk:'📱', exe:'💻', zip:'🗜️', rar:'🗜️', '7z':'🗜️',
    mp3:'🎵', wav:'🎵', ogg:'🎵', m4a:'🎵', aac:'🎵', flac:'🎵',
    mp4:'🎬', mkv:'🎬', avi:'🎬', mov:'🎬', m4v:'🎬', webm:'🎬'
  };
  return icons[type] || '📦';
}
function libraryDateLabel(item){
  return item.uploadedAt?.toDate
    ? item.uploadedAt.toDate().toLocaleDateString('en-US',{day:'2-digit',month:'short',year:'numeric'})
    : '';
}
function libraryItemCard(item, showCategory){
  const title=librarySafe(item.title||'Untitled'),
        type=(item.fileType||'').toLowerCase(),
        canRead=['pdf','epub','txt'].includes(type),
        isAudio=['mp3','wav','ogg','m4a','aac','flac'].includes(type),
        isVideo=['mp4','webm','ogg','mov','m4v'].includes(type),
        url=librarySafe(libraryItemUrl(item)),
        safeItem=JSON.stringify(item).replace(/</g,'\\u003c'),
        metaBits=[item.author, showCategory?libraryFolder(item.category)?.name:null, formatSize(item.fileSize||0), libraryDateLabel(item)].filter(Boolean);

  let media='';
  if(isAudio)media=`<div class="library-media"><audio controls preload="metadata" src="${url}" onerror="this.insertAdjacentHTML('afterend','<div class=&quot;library-media-error&quot;>⚠ Could not load audio — try Download instead.</div>')"></audio></div>`;
  if(isVideo)media=`<div class="library-media library-video"><video controls preload="metadata" src="${url}" onerror="this.insertAdjacentHTML('afterend','<div class=&quot;library-media-error&quot;>⚠ Could not load video — try Download instead.</div>')"></video></div>`;

  return `<div class="library-hub-item library-item-${isAudio?'audio':isVideo?'video':'file'}">
    <div class="library-item-icon">${libraryFileIcon(type)}</div>
    <div class="library-item-main">
      <div><strong>${title}</strong><span>${librarySafe(metaBits.join(' · '))}</span></div>
      ${media}
    </div>
    <div class="library-hub-item-actions">
      ${canRead?`<button class="btn btn-primary btn-sm" onclick='openLibraryItemReader(${safeItem})'>Open</button>`:''}
      <button class="btn btn-ghost btn-sm" onclick='downloadLibraryItem(${safeItem})'>⬇ Download</button>
    </div>
  </div>`;
}
function openLibraryItemReader(item){if(typeof openReader==='function')openReader({...item,downloadUrl:libraryItemUrl(item),viewUrl:libraryItemUrl(item)});}
async function downloadLibraryItem(item){const url=libraryItemUrl(item,'download');if(!url){showToast('Download link unavailable.','error');return;}try{const res=await fetch(url,{credentials:'same-origin'});if(!res.ok)throw new Error('Download request failed ('+res.status+')');const ct=(res.headers.get('content-type')||'').toLowerCase();if(ct.includes('text/html'))throw new Error('Server returned a web page instead of the file.');const blob=await res.blob(),objectUrl=URL.createObjectURL(blob),a=document.createElement('a');a.href=objectUrl;a.download=item.fileName||((item.title||'download')+'.'+(item.fileType||''));document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(objectUrl),3000);}catch(e){console.error('Library download error:',e);showToast('Download failed: '+e.message,'error');}}
