// Clean UI app (no System Class / Type). Domains are controlled by the topic rail.
const TOPICS = ["All","genomics","medicine","climate","environment","marine","plant"];
const FACETS = { modality: "facet-modality", task: "facet-task" };

let ALL = []; 
let ACTIVE = { search: "", year: "", domain: [], modality: [], task: [] };

const els = {
  topicRail: document.getElementById("topic-rail"),
  results: document.getElementById("results"),
  empty: document.getElementById("empty"),
  search: document.getElementById("search"),
  year: document.getElementById("year"),
  count: document.getElementById("count"),
  clear: document.getElementById("clear"),
  share: document.getElementById("share"),
  sort: document.getElementById("sort"),
  add: document.getElementById("addPaperBtn"),
  repo: document.getElementById("repoLink"),
};

(async function init() {
  ALL = await (await fetch("data/papers.json", { cache: "no-store" })).json();

  // Years
  const years = Array.from(new Set(ALL.map(p => p.year))).filter(Boolean).sort((a,b)=>b-a);
  for (const y of years) { const o = document.createElement("option"); o.value = y; o.textContent = y; els.year.appendChild(o); }

  // Facets
  for (const [key, containerId] of Object.entries(FACETS)) {
    const container = document.getElementById(containerId);
    const set = new Set(); ALL.forEach(p => (p[key] || []).forEach(v => set.add(v)));
    [...set].sort((a,b)=>a.localeCompare(b)).forEach(v => container.appendChild(makeChip(key, v)));
  }

  // Topics
  buildTopicRail();

  // Events
  els.search.addEventListener("input", () => { ACTIVE.search = els.search.value.trim().toLowerCase(); render(); syncURL(); });
  // shortcut: press "/" to focus search
  document.addEventListener("keydown", (e)=>{ if(e.key === "/" && document.activeElement !== els.search){ e.preventDefault(); els.search.focus(); }});
  els.year.addEventListener("change", () => { ACTIVE.year = els.year.value; render(); syncURL(); });
  els.clear.addEventListener("click", () => { resetFilters(); render(); syncURL(); });
  els.share.addEventListener("click", copyShareLink);
  els.sort.addEventListener("change", ()=>{ render(); syncURL(); });

  hydrateFromURL(); render(); updateTopicRailState();

  // Wire "+ Add paper" button to open a new Issue
  try{
    const cfg = await (await fetch("data/config.json")).json();
    els.repo.href = `https://github.com/${cfg.owner}/${cfg.repo}`;
    if (els.add){
      els.add.addEventListener('click', ()=>{
        const title = encodeURIComponent('Add paper: <paste title or URL>');
        const body = encodeURIComponent('**URL**:\n\n**Notes** (optional):');
        const labels = encodeURIComponent(cfg.label || 'add-paper');
        const link = `https://github.com/${cfg.owner}/${cfg.repo}/issues/new?labels=${labels}&title=${title}&body=${body}`;
        window.open(link, '_blank');
      });
    }
  }catch(e){}
})();

function buildTopicRail(){
  els.topicRail.innerHTML = "";
  for (const t of TOPICS){
    const label = t === "All" ? "All" : t;
    const count = t === "All" ? ALL.length : ALL.filter(p => (p.domain||[]).includes(t)).length;
    const chip = document.createElement("button");
    chip.className = "topic"; chip.dataset.topic = t;
    chip.textContent = count ? `${label} (${count})` : label;
    chip.addEventListener("click", () => {
      // toggle when clicking same chip; otherwise single-select
      if (ACTIVE.domain.length === 1 && ACTIVE.domain[0] === t) {
        ACTIVE.domain = []; // toggle off -> All
      } else {
        ACTIVE.domain = (t === "All") ? [] : [t];
      }
      render(); syncURL(); updateTopicRailState();
    });
    els.topicRail.appendChild(chip);
  }
}
function updateTopicRailState(){
  const sel = ACTIVE.domain.length ? ACTIVE.domain[0] : "All";
  document.querySelectorAll(".topic").forEach(c => c.classList.toggle("on", c.dataset.topic === sel));
}
function makeChip(key, value) {
  const el = document.createElement("span"); el.className = "chip"; el.textContent = value; el.dataset.key = key; el.dataset.value = value;
  el.addEventListener("click", () => {
    const arr = ACTIVE[key]; const idx = arr.indexOf(value);
    if (idx === -1) arr.push(value); else arr.splice(idx, 1);
    el.classList.toggle("on", idx === -1); render(); syncURL();
  }); return el;
}
function resetFilters() {
  ACTIVE = { search: "", year: "", domain: [], modality: [], task: [] };
  els.search.value = ""; els.year.value = ""; document.querySelectorAll(".chip").forEach(c => c.classList.remove("on"));
  updateTopicRailState();
}
function hydrateFromURL() {
  const params = new URLSearchParams(location.search);
  els.search.value = ACTIVE.search = (params.get("q") || "");
  els.year.value = ACTIVE.year = (params.get("year") || "");
  const srt = params.get("sort"); if (srt) els.sort.value = srt;

  // facets
  for (const k of Object.keys(FACETS)) {
    const v = params.get(k); ACTIVE[k] = v ? v.split(",").filter(Boolean) : [];
  }
  document.querySelectorAll(".chip").forEach(c => {
    const k = c.dataset.key, v = c.dataset.value; if (ACTIVE[k].includes(v)) c.classList.add("on");
  });

  // domain via topics
  const dom = params.get("domain");
  ACTIVE.domain = dom ? dom.split(",").filter(Boolean) : [];
  updateTopicRailState();
}
function syncURL() {
  const params = new URLSearchParams();
  if (ACTIVE.search) params.set("q", ACTIVE.search);
  if (ACTIVE.year) params.set("year", ACTIVE.year);
  for (const k of Object.keys(FACETS)) if (ACTIVE[k].length) params.set(k, ACTIVE[k].join(","));
  if (ACTIVE.domain.length) params.set("domain", ACTIVE.domain.join(","));
  if (els.sort.value && els.sort.value !== 'year-desc') params.set('sort', els.sort.value);
  history.replaceState({}, "", params.toString() ? `?${params}` : location.pathname);
}
function matchesSearch(p) {
  if (!ACTIVE.search) return true;
  const hay = [p.title, (p.authors||[]).join(" "), p.venue, String(p.year), p.abstract].join(" ").toLowerCase();
  return hay.includes(ACTIVE.search);
}
function matchesFacets(p) {
  if (ACTIVE.year && String(p.year) !== String(ACTIVE.year)) return false;
  if (ACTIVE.domain.length) { const have = p.domain || []; if (!ACTIVE.domain.some(v => have.includes(v))) return false; }
  for (const k of Object.keys(FACETS)) {
    const need = ACTIVE[k]; if (!need.length) continue;
    const have = p[k] || []; const ok = need.some(v => have.includes(v));
    if (!ok) return false;
  } return true;
}
function render() {
  let filtered = ALL.filter(p => matchesSearch(p) && matchesFacets(p));
  const s = els.sort.value;
  filtered.sort((a,b)=>{ if(s==='year-desc') return (b.year||0)-(a.year||0);
                         if(s==='year-asc') return (a.year||0)-(b.year||0);
                         if(s==='title-asc') return String(a.title).localeCompare(String(b.title)); return 0; });
  els.count.textContent = `${filtered.length} result${filtered.length!==1?"s":""}`;
  els.results.innerHTML = ""; 
  if (!filtered.length) { els.empty.classList.remove("hidden"); } else { els.empty.classList.add("hidden"); }
  for (const p of filtered) els.results.appendChild(card(p));
}
function card(p) {
  const d = document.createElement("div"); d.className = "card";
  const link = p.url ? `<a href="${p.url}" target="_blank" rel="noopener">View</a>` : "";
  const code = p.code ? ` • <a href="${p.code}" target="_blank" rel="noopener">Code</a>` : "";
  d.innerHTML = `<h3>${escapeHTML(p.title)}</h3>
    <div class="meta">${(p.authors||[]).join(", ")}${p.venue ? " — " + escapeHTML(p.venue) : ""} ${p.year ? " ("+p.year+")" : ""} ${link}${code}</div>
    ${p.abstract ? `<p>${escapeHTML(p.abstract)}</p>` : ""}
    <div class="tags">
      ${renderTags("Domain", p.domain)} ${renderTags("Modality", p.modality)} ${renderTags("Task", p.task)}
    </div>`; return d;
}
function renderTags(label, arr) { if (!arr || !arr.length) return ""; return `<span class="tag"><strong>${label}:</strong> ${arr.join(", ")}</span>`; }
// function copyShareLink() { navigator.clipboard.writeText(location.href).then(()=>{ els.share.textContent = "Link copied ✓"; setTimeout(()=> els.share.textContent = "Copy shareable link", 1200); }); }
function escapeHTML(s){ return (s||"").replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
