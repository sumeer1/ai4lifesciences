const FACETS = { type: "facet-type", domain: "facet-domain", modality: "facet-modality", system: "facet-system", task: "facet-task" };
let ALL = []; let ACTIVE = { search: "", year: "", type: [], domain: [], modality: [], system: [], task: [] };
const els = { results: document.getElementById("results"), search: document.getElementById("search"), year: document.getElementById("year"),
  count: document.getElementById("count"), clear: document.getElementById("clear"), share: document.getElementById("share"), sort: document.getElementById("sort"),
  add: document.getElementById("addPaperBtn"), repo: document.getElementById("repoLink") };

(async function init() {
  ALL = await (await fetch("data/papers.json", { cache: "no-store" })).json();
  const years = Array.from(new Set(ALL.map(p => p.year))).sort((a,b)=>b-a);
  for (const y of years) { const o = document.createElement("option"); o.value = y; o.textContent = y; els.year.appendChild(o); }
  for (const [key, id] of Object.entries(FACETS)) { const c = document.getElementById(id); const set = new Set(); ALL.forEach(p => (p[key]||[]).forEach(v => set.add(v)));
    [...set].sort((a,b)=>a.localeCompare(b)).forEach(v => c.appendChild(makeChip(key, v))); }
  els.search.addEventListener("input", ()=>{ ACTIVE.search = els.search.value.trim().toLowerCase(); render(); syncURL(); });
  els.year.addEventListener("change", ()=>{ ACTIVE.year = els.year.value; render(); syncURL(); });
  els.clear.addEventListener("click", ()=>{ resetFilters(); render(); syncURL(); });
  els.share.addEventListener("click", copyShareLink);
  document.getElementById("sort").addEventListener("change", ()=>{ render(); syncURL(); });
  hydrateFromURL(); render();
  try{ const cfg = await (await fetch("data/config.json")).json(); els.repo.href = `https://github.com/${cfg.owner}/${cfg.repo}`;
    if(els.add){ els.add.addEventListener('click', ()=>{ const title=encodeURIComponent('Add paper: <paste title or URL>');
      const body=encodeURIComponent('**URL**:\n\n**Type** (optional):\n**Domain** (optional):\n**Modality** (optional):\n**System** (optional):\n**Task** (optional):\n**Notes** (optional):');
      const labels=encodeURIComponent(cfg.label||'add-paper'); const link=`https://github.com/${cfg.owner}/${cfg.repo}/issues/new?labels=${labels}&title=${title}&body=${body}`; window.open(link,'_blank'); }); } }catch(e){} })();
function makeChip(k,v){ const el=document.createElement("span"); el.className="chip"; el.textContent=v; el.dataset.key=k; el.dataset.value=v; el.addEventListener("click",()=>{ const arr=ACTIVE[k]; const i=arr.indexOf(v); if(i===-1) arr.push(v); else arr.splice(i,1); el.classList.toggle("on", i===-1); render(); syncURL(); }); return el; }
function resetFilters(){ ACTIVE={ search:"", year:"", type:[], domain:[], modality:[], system:[], task:[] }; els.search.value=""; els.year.value=""; document.querySelectorAll(".chip").forEach(c=>c.classList.remove("on")); }
function hydrateFromURL(){ const p=new URLSearchParams(location.search); els.search.value=ACTIVE.search=(p.get("q")||""); els.year.value=ACTIVE.year=(p.get("year")||""); const srt=p.get("sort"); if(srt) document.getElementById("sort").value=srt;
  for(const k of Object.keys(FACETS)){ const v=p.get(k); ACTIVE[k]=v? v.split(",").filter(Boolean):[]; } document.querySelectorAll(".chip").forEach(c=>{ const k=c.dataset.key,v=c.dataset.value; if(ACTIVE[k].includes(v)) c.classList.add("on"); }); }
function syncURL(){ const p=new URLSearchParams(); if(ACTIVE.search) p.set("q",ACTIVE.search); if(ACTIVE.year) p.set("year",ACTIVE.year); for(const k of Object.keys(FACETS)) if(ACTIVE[k].length) p.set(k, ACTIVE[k].join(",")); const srt=document.getElementById("sort").value; if(srt && srt!=='year-desc') p.set('sort', srt); history.replaceState({}, "", p.toString()?`?${p}`:location.pathname); }
function matchesSearch(p){ if(!ACTIVE.search) return true; const hay=[p.title,(p.authors||[]).join(" "),p.venue,String(p.year),p.abstract].join(" ").toLowerCase(); return hay.includes(ACTIVE.search); }
function matchesFacets(p){ if(ACTIVE.year && String(p.year)!==String(ACTIVE.year)) return false; for(const k of Object.keys(FACETS)){ const need=ACTIVE[k]; if(!need.length) continue; const have=p[k]||[]; const ok=need.some(v=>have.includes(v)); if(!ok) return false; } return true; }
function render(){ let filtered=ALL.filter(p=>matchesSearch(p)&&matchesFacets(p)); const s=document.getElementById("sort").value; filtered.sort((a,b)=>{ if(s==='year-desc') return (b.year||0)-(a.year||0); if(s==='year-asc') return (a.year||0)-(b.year||0); if(s==='title-asc') return String(a.title).localeCompare(String(b.title)); return 0; }); els.count.textContent=`${filtered.length} result${filtered.length!==1?"s":""}`; els.results.innerHTML=""; for(const p of filtered) els.results.appendChild(card(p)); }
function card(p){ const d=document.createElement("div"); d.className="card"; const link=p.url?`<a href="${p.url}" target="_blank" rel="noopener">View</a>`:""; const code=p.code?` • <a href="${p.code}" target="_blank" rel="noopener">Code</a>`:""; d.innerHTML=`<h3>${escapeHTML(p.title)}</h3><div class="meta">${(p.authors||[]).join(", ")}${p.venue? " — "+escapeHTML(p.venue):""} ${p.year? " ("+p.year+")":""} ${link}${code}</div>${p.abstract?`<p>${escapeHTML(p.abstract)}</p>`:""}<div class="tags">${renderTags("Type",p.type)} ${renderTags("Domain",p.domain)} ${renderTags("Modality",p.modality)} ${renderTags("System",p.system)} ${renderTags("Task",p.task)}</div>`; return d; }
function renderTags(label,arr){ if(!arr||!arr.length) return ""; return `<span class="tag"><strong>${label}:</strong> ${arr.join(", ")}</span>`; }
function copyShareLink(){ navigator.clipboard.writeText(location.href).then(()=>{ document.getElementById("share").textContent="Link copied ✓"; setTimeout(()=> document.getElementById("share").textContent="Copy shareable link", 1200); }); }
function escapeHTML(s){ return (s||"").replace(/[&<>"']/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
