(() => {
  const mode = window.__APP_MODE__ || "display";

  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => Array.from(document.querySelectorAll(sel));

  function toast(msg, ok=true){
    const t = $("#toast");
    if(!t) return;
    t.textContent = msg;
    t.style.borderColor = ok ? "rgba(109,255,178,.25)" : "rgba(255,90,122,.35)";
    t.classList.add("show");
    clearTimeout(window.__toastTimer);
    window.__toastTimer = setTimeout(() => t.classList.remove("show"), 2200);
  }

  function getPinFromUrl(){
    const u = new URL(window.location.href);
    return u.searchParams.get("pin") || "";
  }

  const pin = getPinFromUrl();

  const socket = io({
    auth: { pin }
  });

  let state = null;
  let isAdmin = false;

  socket.on("hello", (msg) => {
    isAdmin = !!msg.isAdmin;
    const conn = $("#connStatus");
    if(conn) conn.textContent = isAdmin ? "Verbonden (admin)" : "Verbonden";
  });

  socket.on("connect", () => {
    const conn = $("#connStatus");
    if(conn) conn.textContent = "Verbonden";
  });

  socket.on("disconnect", () => {
    const conn = $("#connStatus");
    if(conn) conn.textContent = "Verbinding weg… (check wifi/server)";
  });

  socket.on("state", (s) => {
    state = s;
    if (mode === "admin") renderAdmin();
    if (mode === "display") renderDisplay();
  });

  socket.on("admin:ok", (m) => {
    toast(`Opgeslagen (${m.type})`);
  });

  socket.on("admin:error", (e) => {
    toast(e.message || "Actie mislukt.", false);
  });

  function emitAdmin(action){
    socket.emit("admin:action", action);
  }

  // ---------- Admin ----------
  function renderAdmin(){
    if(!state) return;

    const titleInput = $("#quizTitle");
    const displayTitle = state.quizTitle || "Pubquiz";
    if(titleInput && document.activeElement !== titleInput){
      titleInput.value = displayTitle;
    }

    const list = $("#teamList");
    if(!list) return;
    list.innerHTML = "";

    const teams = Array.isArray(state.teams) ? state.teams : [];

    teams.forEach((t, idx) => {
      const row = document.createElement("div");
      row.className = "teamrow";

      const nameWrap = document.createElement("div");
      nameWrap.innerHTML = `
        <div class="teamname" title="Klik om te hernoemen">${escapeHtml(t.name)}</div>
        <div class="hint">id: ${escapeHtml(t.id)}</div>
      `;
      nameWrap.style.cursor = "pointer";
      nameWrap.addEventListener("click", () => {
        const newName = prompt("Nieuwe teamnaam:", t.name);
        if(newName !== null){
          emitAdmin({ type: "renameTeam", id: t.id, name: newName });
        }
      });

      const score = document.createElement("div");
      score.className = "teamscore";
      score.textContent = String(t.score ?? 0);

      const btns = document.createElement("div");
      btns.className = "scorebtns";

      const deltas = [-10, -5, -1, +1, +5, +10];
      deltas.forEach(d => {
        const b = document.createElement("button");
        b.className = "pill " + (d < 0 ? "neg" : "pos");
        b.textContent = (d > 0 ? `+${d}` : `${d}`);
        b.addEventListener("click", () => emitAdmin({ type: "adjustScore", id: t.id, delta: d }));
        btns.appendChild(b);
      });

      const custom = document.createElement("button");
      custom.className = "pill";
      custom.textContent = "±…";
      custom.title = "Aangepast aantal punten";
      custom.addEventListener("click", () => {
        const v = prompt("Hoeveel punten erbij/eraf? (bijv. 7 of -3)", "2");
        if(v === null) return;
        const n = Number(v);
        if(!Number.isFinite(n)) return toast("Geen geldig getal.", false);
        emitAdmin({ type: "adjustScore", id: t.id, delta: n });
      });
      btns.appendChild(custom);

      const remove = document.createElement("button");
      remove.className = "iconbtn";
      remove.title = "Team verwijderen";
      remove.textContent = "🗑";
      remove.addEventListener("click", () => {
        if(confirm(`Verwijder "${t.name}"?`)){
          emitAdmin({ type: "removeTeam", id: t.id });
        }
      });

      row.appendChild(nameWrap);
      row.appendChild(score);
      row.appendChild(btns);
      row.appendChild(remove);

      list.appendChild(row);
    });

    // Wire buttons once
    wireAdminButtons();
  }

  let adminWired = false;
  function wireAdminButtons(){
    if(adminWired) return;
    adminWired = true;

    $("#btnSaveTitle")?.addEventListener("click", () => {
      const v = $("#quizTitle")?.value || "Pubquiz";
      emitAdmin({ type: "setQuizTitle", title: v });
    });

    $("#btnSetCount")?.addEventListener("click", () => {
      const c = Number($("#teamCount")?.value || 0);
      emitAdmin({ type: "setTeamsFromCount", count: c });
    });

    $("#btnAddTeam")?.addEventListener("click", () => {
      const name = ($("#newTeamName")?.value || "").trim();
      if(!name) return toast("Teamnaam is leeg.", false);
      emitAdmin({ type: "addTeam", name });
      $("#newTeamName").value = "";
    });

    $("#btnReset")?.addEventListener("click", () => {
      if(confirm("Alle scores resetten naar 0?")){
        emitAdmin({ type: "resetScores" });
      }
    });

    $("#btnSort")?.addEventListener("click", () => {
      emitAdmin({ type: "sortTeams" });
    });

    $("#btnExample")?.addEventListener("click", () => {
      emitAdmin({ type: "loadExample" });
    });
  }

  // ---------- Display ----------
  function renderDisplay(){
    if(!state) return;

    const titleEl = $("#displayTitle");
    if(titleEl) titleEl.textContent = state.quizTitle || "Pubquiz";

    const board = $("#leaderboard");
    if(!board) return;

    const teams = Array.isArray(state.teams) ? state.teams : [];
    const sorted = [...teams].sort((a,b) => {
      if((b.score ?? 0) !== (a.score ?? 0)) return (b.score ?? 0) - (a.score ?? 0);
      return String(a.name).localeCompare(String(b.name));
    });

    const topCount = Number(localStorage.getItem("topCount") || 10);
    const slice = topCount >= 60 ? sorted : sorted.slice(0, topCount);

    board.innerHTML = "";

    slice.forEach((t, i) => {
      const row = document.createElement("div");
      row.className = "lb-row" + (i === 0 ? " leader" : "");
      row.innerHTML = `
        <div class="rank">#${i+1}</div>
        <div class="lb-name" title="${escapeHtml(t.name)}">${escapeHtml(t.name)}</div>
        <div class="lb-score">${escapeHtml(String(t.score ?? 0))}</div>
      `;
      board.appendChild(row);
    });

    wireDisplayButtons();
  }

  let displayWired = false;
  function wireDisplayButtons(){
    if(displayWired) return;
    displayWired = true;

    const panel = $("#settingsPanel");
    const btnSettings = $("#btnSettings");
    const btnClose = $("#btnCloseSettings");

    btnSettings?.addEventListener("click", () => {
      if(!panel) return;
      panel.setAttribute("aria-hidden", "false");
    });
    btnClose?.addEventListener("click", () => {
      panel?.setAttribute("aria-hidden", "true");
    });
    panel?.addEventListener("click", (e) => {
      if(e.target === panel) panel.setAttribute("aria-hidden", "true");
    });

    $("#btnFullscreen")?.addEventListener("click", async () => {
      try{
        if(!document.fullscreenElement){
          await document.documentElement.requestFullscreen();
        } else {
          await document.exitFullscreen();
        }
      } catch(_){}
    });

    const scaleRange = $("#scaleRange");
    const savedScale = Number(localStorage.getItem("displayScale") || 100);
    if(scaleRange){
      scaleRange.value = String(savedScale);
      applyScale(savedScale);

      scaleRange.addEventListener("input", () => {
        const v = Number(scaleRange.value || 100);
        localStorage.setItem("displayScale", String(v));
        applyScale(v);
      });
    }

    const topSelect = $("#topCount");
    if(topSelect){
      const savedTop = localStorage.getItem("topCount") || "10";
      topSelect.value = savedTop;
      topSelect.addEventListener("change", () => {
        localStorage.setItem("topCount", topSelect.value);
        renderDisplay();
      });
    }
  }

  function applyScale(v){
    const s = Math.max(80, Math.min(130, Number(v))) / 100;
    document.documentElement.style.setProperty("--display-scale", String(s));
  }

  // ---------- Helpers ----------
  function escapeHtml(str){
    return String(str)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

})();
