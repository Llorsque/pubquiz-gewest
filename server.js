const path = require("path");
const fs = require("fs");
const http = require("http");
const express = require("express");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: true, credentials: false }
});

const PORT = process.env.PORT || 3000;
const ADMIN_PIN = (process.env.ADMIN_PIN || "1234").trim();

const DATA_DIR = path.join(__dirname, "data");
const STATE_FILE = path.join(DATA_DIR, "state.json");

function nowIso() {
  return new Date().toISOString();
}

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
}

const defaultState = {
  version: 1,
  updatedAt: nowIso(),
  quizTitle: "Pubquiz",
  teams: [
    // { id: "t1", name: "Team 1", score: 0 }
  ]
};

function loadState() {
  ensureDataDir();
  try {
    if (fs.existsSync(STATE_FILE)) {
      const raw = fs.readFileSync(STATE_FILE, "utf8");
      const parsed = JSON.parse(raw);
      // Minimal sanity checks
      if (parsed && typeof parsed === "object" && Array.isArray(parsed.teams)) {
        return { ...defaultState, ...parsed };
      }
    }
  } catch (e) {
    console.error("⚠️  Could not read state.json, starting fresh:", e.message);
  }
  return { ...defaultState };
}

let state = loadState();

function persistState() {
  ensureDataDir();
  try {
    fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2), "utf8");
  } catch (e) {
    console.error("⚠️  Could not write state.json:", e.message);
  }
}

function broadcastState() {
  io.emit("state", state);
}

function normalizeTeams(teams) {
  // Ensure: unique ids, string names, numeric scores
  const seen = new Set();
  return teams
    .map((t, idx) => {
      const id = (t && t.id ? String(t.id) : `t${idx + 1}`).trim();
      const safeId = seen.has(id) ? `${id}_${idx + 1}` : id;
      seen.add(safeId);
      return {
        id: safeId,
        name: String((t && t.name) || `Team ${idx + 1}`).trim().slice(0, 40),
        score: Number.isFinite(Number(t && t.score)) ? Number(t.score) : 0
      };
    });
}

function sortTeamsByScoreDesc(teams) {
  return [...teams].sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return a.name.localeCompare(b.name);
  });
}

// --- Express routes ---
app.use(express.static(path.join(__dirname, "public")));

app.get("/health", (_, res) => res.json({ ok: true, updatedAt: state.updatedAt }));

// --- Socket.IO ---
io.on("connection", (socket) => {
  // Client can provide pin in handshake auth, or as query string in URL
  const providedPin = String(
    (socket.handshake.auth && socket.handshake.auth.pin) ||
    (socket.handshake.query && socket.handshake.query.pin) ||
    ""
  ).trim();

  const isAdmin = providedPin && providedPin === ADMIN_PIN;

  socket.emit("hello", {
    serverTime: nowIso(),
    isAdmin,
    quizTitle: state.quizTitle
  });

  socket.emit("state", state);

  socket.on("admin:action", (payload) => {
    if (!isAdmin) {
      socket.emit("admin:error", { message: "Geen admin-rechten (pin ontbreekt of onjuist)." });
      return;
    }

    // Expect: { type, ...data }
    const type = payload && payload.type ? String(payload.type) : "";
    try {
      if (type === "setQuizTitle") {
        const title = String(payload.title || "Pubquiz").trim().slice(0, 60);
        state.quizTitle = title || "Pubquiz";
      }

      else if (type === "setTeamsFromCount") {
        const count = Math.max(0, Math.min(60, Number(payload.count || 0)));
        const teams = [];
        for (let i = 1; i <= count; i++) {
          teams.push({ id: `t${i}`, name: `Team ${i}`, score: 0 });
        }
        state.teams = normalizeTeams(teams);
      }

      else if (type === "addTeam") {
        const name = String(payload.name || "").trim();
        if (!name) throw new Error("Teamnaam is leeg.");
        const idBase = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
        let id = idBase || `t${state.teams.length + 1}`;
        let n = 2;
        while (state.teams.some(t => t.id === id)) {
          id = `${idBase || "team"}-${n++}`;
        }
        state.teams = normalizeTeams([...state.teams, { id, name, score: 0 }]);
      }

      else if (type === "removeTeam") {
        const id = String(payload.id || "").trim();
        state.teams = state.teams.filter(t => t.id !== id);
      }

      else if (type === "renameTeam") {
        const id = String(payload.id || "").trim();
        const name = String(payload.name || "").trim().slice(0, 40);
        state.teams = state.teams.map(t => t.id === id ? { ...t, name: name || t.name } : t);
      }

      else if (type === "adjustScore") {
        const id = String(payload.id || "").trim();
        const delta = Number(payload.delta || 0);
        if (!Number.isFinite(delta)) throw new Error("Delta is geen getal.");
        state.teams = state.teams.map(t => t.id === id ? { ...t, score: Number(t.score) + delta } : t);
      }

      else if (type === "setScore") {
        const id = String(payload.id || "").trim();
        const score = Number(payload.score || 0);
        if (!Number.isFinite(score)) throw new Error("Score is geen getal.");
        state.teams = state.teams.map(t => t.id === id ? { ...t, score } : t);
      }

      else if (type === "resetScores") {
        state.teams = state.teams.map(t => ({ ...t, score: 0 }));
      }

      else if (type === "sortTeams") {
        state.teams = sortTeamsByScoreDesc(state.teams);
      }

      else if (type === "loadExample") {
        state.quizTitle = "Pubquiz";
        state.teams = normalizeTeams([
          { id: "t1", name: "De Slimme Sokken", score: 12 },
          { id: "t2", name: "Quiz Khalifa", score: 18 },
          { id: "t3", name: "De Pintjes", score: 9 },
          { id: "t4", name: "Team 4", score: 14 }
        ]);
      }

      else {
        throw new Error("Onbekende actie: " + type);
      }

      state.updatedAt = nowIso();
      persistState();
      broadcastState();
      socket.emit("admin:ok", { type, updatedAt: state.updatedAt });

    } catch (err) {
      socket.emit("admin:error", { message: err.message || String(err) });
    }
  });
});

server.listen(PORT, () => {
  console.log(`✅ Pubquiz Scoreboard draait op http://localhost:${PORT}`);
  console.log(`   Admin:    http://localhost:${PORT}/admin.html?pin=${ADMIN_PIN}`);
  console.log(`   Display:  http://localhost:${PORT}/display.html`);
  console.log(`   Tip: zet ADMIN_PIN in je .env of als env var voor veiligheid.`);
});
