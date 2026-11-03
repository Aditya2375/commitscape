/* COMMITSCAPE — data layer + views. */

const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
function toast(msg) {
  let t = $(".toast");
  if (!t) { t = document.createElement("div"); t.className = "toast"; document.body.appendChild(t); }
  t.textContent = msg; t.classList.add("show");
  clearTimeout(t._h); t._h = setTimeout(() => t.classList.remove("show"), 2000);
}

const LANG_COLORS = {
  JavaScript: "#e8b23a", TypeScript: "#5aa3d0", HTML: "#e06c5a", CSS: "#8a7fd4",
  "C++": "#d4769e", Python: "#3da87a", Java: "#c8963e", PLpgSQL: "#7fb4c7",
  Shell: "#9aa3ad", "Jupyter Notebook": "#d4a05a", Go: "#6ac3d4", Rust: "#d48a5a"
};
const langColor = l => LANG_COLORS[l] || "#5f6673";

let DATA = null;        // normalized dataset
let handle='commitscape-demo';try{handle=localStorage.getItem('commitscape.handle')||handle}catch{}
const validHandle=h=>typeof h==='string' && /^[a-z\d](?:[a-z\d-]{0,37}[a-z\d])?$/i.test(h) && !h.includes('--');
if(!validHandle(handle))handle='commitscape-demo';
let loadVersion=0,artVersion=0,activeController=null;
async function request(url,signal){const r=await fetch(url,{signal,headers:{Accept:'application/vnd.github+json'}});if(!r.ok)throw Error(r.status===403||r.status===429?'GitHub rate limit or access restriction. Try later.':r.status===404?'Public user or repository not found.':'GitHub request failed ('+r.status+').');const text=await r.text();if(text.length>3000000)throw Error('Response exceeds3MB limit');return JSON.parse(text)}

let artRepo = null, artStyle = "river", artPalette = "nocturne";

/* ————— data ————— */
// The synthetic demo is bundled, never a live person's activity.
const DEMO_REMOTE=null;
async function loadDemoRemote(){}
function normalizeDemo() {
  const D = DEMO_REMOTE || DEMO;
  return {
    source: "demo", dbLive: !!DEMO_REMOTE, fetchedAt: D.fetchedAt,
    user: D.user, repos: D.repos, events: D.events,
    languages: D.languages, commits: D.commits
  };
}
async function fetchLive(h,signal) {
  const get = url => request(url,signal);
  const user = await get(`https://api.github.com/users/${h}`);
  const reposRaw = await get(`https://api.github.com/users/${h}/repos?per_page=100&sort=updated`);
  const events = (await get(`https://api.github.com/users/${h}/events/public?per_page=100`)).map(e => ({
    type: e.type, repo: e.repo.name, created_at: e.created_at,
    commits: e.type === "PushEvent" ? (e.payload.commits || []).length : undefined
  }));
  const repos = reposRaw.map(r => ({
    name: r.name, description: r.description, language: r.language,
    stars: r.stargazers_count, forks: r.forks_count, updated_at: r.updated_at,
    created_at: r.created_at, size: r.size, url: r.html_url, topics: r.topics || []
  }));
  const languages = {};
  let next=0,failed=0;
  await Promise.all(Array.from({length:3},async()=>{while(next<Math.min(repos.length,15)){const r=repos[next++];try{languages[r.name]=await get(`https://api.github.com/repos/${h}/${encodeURIComponent(r.name)}/languages`)}catch(e){if(signal.aborted)throw e;failed++}}}));

  return {
    source: "live", coverage:`Up to100repositories and100recent public events. Languages: ${Object.keys(languages).length} of ${Math.min(repos.length,15)} requested (${failed} failed). Not a full contribution history. Events and observed streaks use UTC.`,
    user: {
      login: user.login, name: user.name, avatar_url: user.avatar_url, bio: user.bio,
      location: user.location, company: user.company, twitter: user.twitter_username,
      followers: user.followers, following: user.following, public_repos: user.public_repos,
      created_at: user.created_at
    },
    repos, events, languages, commits: {}
  };
}
async function fetchCommits(h,repo){const c=new AbortController(),timer=setTimeout(()=>c.abort(),20000);try{const rows=await request(`https://api.github.com/repos/${encodeURIComponent(h)}/${encodeURIComponent(repo)}/commits?per_page=100`,c.signal);if(!Array.isArray(rows))throw Error('Invalid commit response');return rows.filter(c=>c && typeof c.sha==='string' && c.commit?.author?.date && !Number.isNaN(Date.parse(c.commit.author.date))).map(c=>({sha:c.sha.slice(0,7),date:c.commit.author.date,msg:String(c.commit.message||'').split('\n')[0],author:String(c.commit.author.name||'')}))}finally{clearTimeout(timer)}}

/* ————— derived ————— */
function dayCounts(data){const counts={};data.events.forEach(e=>{const day=e.created_at.slice(0,10);counts[day]=(counts[day]||0)+1});return counts}
function streaks(counts) {
  const days = Object.keys(counts).sort();
  if (!days.length) return { current: 0, longest: 0 };
  const set = new Set(days);
  const today = new Date().toISOString().slice(0, 10);
  const y = new Date(Date.now() - 864e5).toISOString().slice(0, 10);
  let cur = 0;
  let d = set.has(today) ? today : y;
  while (set.has(d)) { cur++; d = new Date(new Date(d).getTime() - 864e5).toISOString().slice(0, 10); }
  let longest = 0, run = 0, prev = null;
  for (const day of days) {
    if (prev && (new Date(day) - new Date(prev)) === 864e5) run++; else run = 1;
    longest = Math.max(longest, run); prev = day;
  }
  return { current: cur, longest };
}
function langTotals(data) {
  const t = {};
  Object.values(data.languages).forEach(l => Object.entries(l).forEach(([k, v]) => t[k] = (t[k] || 0) + v));
  const total = Object.values(t).reduce((a, b) => a + b, 0) || 1;
  return Object.entries(t).sort((a, b) => b[1] - a[1]).map(([name, bytes]) => ({ name, bytes, pct: bytes / total * 100 }));
}
function fmtBytes(b) {
  if (b > 1e6) return (b / 1e6).toFixed(1) + " MB";
  if (b > 1e3) return (b / 1e3).toFixed(0) + " KB";
  return b + " B";
}

/* ————— views ————— */
function render() {
  const d = DATA;
  const u = d.user;
  const counts = dayCounts(d);
  const st = streaks(counts);
  const langs = langTotals(d);
  const age = Math.floor((Date.now() - new Date(u.created_at)) / 864e5);
  const stars = d.repos.reduce((a, r) => a + r.stars, 0);
  const activeDays = Object.keys(counts).length;
  const totalEvents = d.events.length;

  $("#data-pill").textContent = d.source === "live" ? "live from api.github.com" : (d.dbLive ? "demo dataset · live from db · synthetic" : "bundled demo · synthetic · " + new Date(d.fetchedAt).toLocaleDateString("en-GB", { day: "numeric", month: "short" }));
  $("#data-pill").classList.toggle("live", d.source === "live");
  $("#user-input").value = u.login;

  $("#app").innerHTML = `
    ${d.coverage?`<div class="notice">${esc(d.coverage)}</div>`:""}${d.source === "demo" ? `<div class="notice">Showing the <b>${d.dbLive ? "demo dataset, served live from the demo database" : "bundled snapshot"}</b> of @${esc(u.login)} (synthetic demo data, fetched ${new Date(d.fetchedAt).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}). Enter a real username and hit <b>observe</b> for a live snapshot — unauthenticated API allows 60 requests/hour.</div>` : ""}
    <div class="profile">
      <img class="avatar" src="${esc(/^https:\/\/avatars\.githubusercontent\.com\//.test(u.avatar_url)||d.source==='demo'?u.avatar_url:'')}" alt="" onerror="this.style.visibility='hidden'">
      <div class="profile-main">
        <div class="profile-name">${esc(u.name || u.login)}</div>
        <div class="profile-handle">@${esc(u.login)}</div>
        ${u.bio ? `<p class="profile-bio">${esc(u.bio)}</p>` : ""}
        <div class="profile-facts">
          ${u.location ? `<span>⌖ <b>${esc(u.location)}</b></span>` : ""}
          ${u.company ? `<span>⌂ <b>${esc(u.company)}</b></span>` : ""}
          ${u.twitter ? `<span>◈ <b>@${esc(u.twitter)}</b></span>` : ""}
          <span>joined <b>${new Date(u.created_at).toLocaleDateString("en-GB", { month: "short", year: "numeric" })}</b></span>
        </div>
      </div>
    </div>
    <div class="stat-strip">
      <div class="stat-cell"><div class="stat-num">${Number(u.public_repos)||0}</div><div class="stat-lab">Public repos</div></div>
      <div class="stat-cell"><div class="stat-num">${totalEvents}</div><div class="stat-lab">Events in response</div></div>
      <div class="stat-cell"><div class="stat-num amber">${st.current}<span style="font-size:14px">d</span></div><div class="stat-lab">Observed current streak</div></div>
      <div class="stat-cell"><div class="stat-num mint">${st.longest}<span style="font-size:14px">d</span></div><div class="stat-lab">Observed longest streak</div></div>
      <div class="stat-cell"><div class="stat-num">${activeDays}</div><div class="stat-lab">Observed active days</div></div>
    </div>

    <div class="section"><div class="section-head"><span class="section-title">ACTIVITY FIELD</span><span class="section-note">Recent event sample, not a contribution graph</span></div>
      <div class="heatmap-wrap">${heatmapHTML(counts)}</div>
    </div>

    <div class="section"><div class="section-head"><span class="section-title">LANGUAGES</span><span class="section-note">bytes across ${Object.keys(d.languages).length} repos</span></div>
      <div class="lang-bar">${langs.slice(0, 8).map(l => `<div class="lang-seg" style="flex:${l.pct};background:${langColor(l.name)}" title="${esc(l.name)} ${l.pct.toFixed(1)}%"></div>`).join("")}</div>
      <div class="lang-rows">${langs.map(l => `<div class="lang-row"><span class="lang-dot" style="background:${langColor(l.name)}"></span><span class="lang-name">${esc(l.name)}</span><span class="lang-bytes">${fmtBytes(l.bytes)}</span><span class="lang-pct">${l.pct.toFixed(1)}%</span></div>`).join("")}</div>
    </div>

    <div class="section"><div class="section-head"><span class="section-title">REPOSITORIES</span><span class="section-note">${d.repos.length} public</span></div>
      <div class="table-wrap"><table class="repo-table"><thead><tr><th>Name</th><th>Language</th><th class="num">★</th><th class="num">Forks</th><th class="num">Updated</th></tr></thead>
      <tbody>${d.repos.map(r => `<tr>
        <td><a class="repo-name" href="${esc(d.source==='demo'?'#':/^https:\/\/github\.com\//.test(r.url)?r.url:'#')}" target="_blank" rel="noopener">${esc(r.name)}</a>${r.description ? `<div class="repo-desc">${esc(r.description)}</div>` : ""}</td>
        <td>${r.language ? `<span class="repo-lang"><span class="lang-dot" style="background:${langColor(r.language)}"></span>${esc(r.language)}</span>` : `<span style="color:var(--ink-3)">—</span>`}</td>
        <td class="num">${Number(r.stars)||0}</td><td class="num">${Number(r.forks)||0}</td>
        <td class="num">${new Date(r.updated_at).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}</td></tr>`).join("")}</tbody></table></div>
    </div>

    <div class="section"><div class="section-head"><span class="section-title">COMMITSCAPE</span><span class="section-note">history, as a print</span></div>
      <div class="art-controls">
        <span class="kicker">Repo</span>
        <span id="art-repos"></span>
      </div>
      <div class="art-controls">
        <span class="kicker">Style</span>
        ${["river", "bloom", "static"].map(s => `<button class="chip ${artStyle === s ? "on" : ""}" data-style="${s}">${s}</button>`).join("")}
        <span style="width:10px"></span>
        <span class="kicker">Palette</span>
        ${Object.keys(PALETTES).map(p => `<button class="chip ${artPalette === p ? "on" : ""}" data-pal="${p}">${p}</button>`).join("")}
        <span style="flex:1"></span>
        <button class="btn ghost" id="art-download">Download PNG</button>
      </div>
      <div class="art-stage"><canvas id="art-canvas"></canvas></div>
      <p class="art-caption" id="art-caption"></p>
    </div>`;

  // art repo chips
  const repoNames = Object.keys(d.commits).length ? Object.keys(d.commits) : d.repos.slice(0, 6).map(r => r.name);
  if (!artRepo || !repoNames.includes(artRepo)) artRepo = repoNames[0];
  $("#art-repos").innerHTML = repoNames.map(n => `<button class="chip ${artRepo === n ? "on" : ""}" data-repo="${esc(n)}">${esc(n)}</button>`).join("");
  $$("#art-repos .chip").forEach(c => c.addEventListener("click", () => { artRepo = c.dataset.repo; drawArt(); renderArtChipsOnly(); }));
  $$("[data-style]").forEach(c => c.addEventListener("click", () => { artStyle = c.dataset.style; render(); }));
  $$("[data-pal]").forEach(c => c.addEventListener("click", () => { artPalette = c.dataset.pal; render(); }));
  $("#art-download").addEventListener("click", () => {
    const a = document.createElement("a");
    a.download = `commitscape-${handle}-${artRepo}-${artStyle}.png`;
    a.href = $("#art-canvas").toDataURL("image/png");
    a.click();
    toast("Print saved");
  });
  drawArt();
}
function renderArtChipsOnly() {
  $$("#art-repos .chip").forEach(c => c.classList.toggle("on", c.dataset.repo === artRepo));
}

async function drawArt() {
  const canvas = $("#art-canvas"),version=++artVersion,data=DATA,repo=artRepo;
  if (!canvas) return;
  if(!repo){$("#art-caption").textContent="No public repositories in this snapshot.";return;}
  let commits = DATA.commits[artRepo];
  if (!commits) {
    $("#art-caption").innerHTML = "fetching commits…";
    try {
      commits = await fetchCommits(data.user.login, repo);
      if(version!==artVersion || DATA!==data || repo!==artRepo)return;
      data.commits[repo] = commits;
    } catch (e) {
      if(version!==artVersion || DATA!==data)return;
      $("#art-caption").textContent = "Commit fetch failed or timed out. Try another public repository later. No token is required or accepted.";
      const ctx = canvas.getContext("2d"); ctx.clearRect(0, 0, canvas.width, canvas.height);
      return;
    }
  }
  if(version!==artVersion || DATA!==data)return;
  if (!commits.length) { $("#art-caption").textContent = "No commits yet in " + artRepo + "."; return; }
  renderCommitscape(canvas, commits, artStyle, artPalette, cap => {
    $("#art-caption").innerHTML = `<b>${esc(artRepo)}</b> · ${commits.length} ${DATA.source==='demo'?'synthetic commits':'recent commits (maximum100)'} · style <b>${artStyle}</b> · palette <b>${artPalette}</b><br>${cap}`;
  }, DATA.source==='demo');
}

/* ————— heatmap ————— */
function heatmapHTML(counts) {
  const weeks = 16;
  const cells = [];
  const now = new Date();
  const start = new Date(now.getTime() - (weeks * 7 + now.getDay()) * 864e5);
  const max = Math.max(...Object.values(counts), 1);
  for (let i = 0; i < weeks * 7 + now.getDay() + 1; i++) {
    const d = new Date(start.getTime() + i * 864e5);
    const key = d.toISOString().slice(0, 10);
    const v = counts[key] || 0;
    const lvl = v === 0 ? 0 : v <= max * 0.2 ? 1 : v <= max * 0.45 ? 2 : v <= max * 0.75 ? 3 : 4;
    cells.push(`<div class="hm-cell l${lvl}" title="${key} — ${Math.round(v)} action${v === 1 ? "" : "s"}"></div>`);
  }
  const months = [];
  let lastM = -1;
  for (let i = 0; i < weeks; i++) {
    const d = new Date(start.getTime() + i * 7 * 864e5);
    if (d.getMonth() !== lastM) { months.push(d.toLocaleDateString("en-GB", { month: "short" })); lastM = d.getMonth(); }
  }
  return `<div class="hm-months"><span>${months[0] || ""}</span><span>${months[Math.floor(months.length / 2)] || ""}</span><span>${months[months.length - 1] || ""}</span></div>
    <div class="heatmap">${cells.join("")}</div>
    <div class="hm-legend">quiet <div class="hm-cell"></div><div class="hm-cell l1"></div><div class="hm-cell l2"></div><div class="hm-cell l3"></div><div class="hm-cell l4"></div> loud</div>`;
}

/* ————— boot ————— */
async function load(h,forceLive){
 if(!validHandle(h)){toast('Enter a valid GitHub username (1–39letters/digits/hyphens).');return}
 activeController?.abort();const c=new AbortController();activeController=c;const version=++loadVersion;artVersion++;handle=h;
 try{localStorage.setItem('commitscape.handle',h)}catch{}
 $('#app').innerHTML=`<div class="loading">observing @${esc(h)} <button id="cancel-load">Cancel</button></div>`;
 $('#cancel-load').onclick=()=>c.abort();const timer=setTimeout(()=>c.abort(),30000);
 try{const data=(h.toLowerCase()==='commitscape-demo')?normalizeDemo():await fetchLive(h,c.signal);if(version!==loadVersion)return;DATA=data;render()}
 catch(e){if(version!==loadVersion)return;$('#app').innerHTML=`<div class="notice">${esc(c.signal.aborted?'Request cancelled or timed out.':e.message)} <button id="demo-load">Show synthetic demo</button></div>`;$('#demo-load').onclick=()=>load('commitscape-demo',false)}
 finally{clearTimeout(timer)}
}

$("#user-form").addEventListener("submit", e => {
  e.preventDefault();
  const h = $("#user-input").value.trim().replace(/^@/, "");
  if (h) load(h, true);
});

(async () => { await loadDemoRemote(); load(handle, false); })();
