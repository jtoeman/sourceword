// Sourceword, build 0.3.0-b27
// Scoring: base by length (Boggle table: 4 = 1, 5 = 2, 6 = 3, 7 = 5, 8+ = 11), 4-letter minimum.
// Bonus slots, each worth the points of one word of that length:
//   - all letters: a valid word using every distinct source letter (one slot per such word)
//   - perfect reuse: an anagram of the source word (one slot per such word)
//   - length: every word of one length found ("all" goal) or that length's core found ("ten" goal)
//   - all words: every word found ("all" goal) or the core complete ("ten" goal), valued at the source length
// Goal: "all" counts every valid word. "ten" counts up to 10 words per length; extra words still score.
// One play per day, saved on-device. Daily words come from the Sourceword tab of the froobaloodb
// Google Sheet, read in the browser (like Caseboard). puzzles.json is the fallback if the sheet can't be read.
// A day's word is used only if its valid-word count is inside the band (15 to 50, 4+ letters).
// Today's word is shown if it's valid; otherwise the most recent earlier valid day is shown, with its date.

const BUILD = "0.3.0-b36";
const SITE_URL = "https://froobaloo.com/sourceword/"; // path to confirm on launch
const STORE_PREFIX = "sourceword:play:";
const MODES = { normal: 4, hard: 4 };
const MODE_KEY = "sourceword:mode";
const CORE_CAP = 10;
const CORE_COLUMN = 7; // sheet column H: optional curated core words for the day, comma-separated
let BLOCKED = new Set(); // blocked.json: never accepted, never counted
let COMMON = null; // common.json: words at Zipf 3.0+. Null means every word counts as common.
// Preference for the next puzzle. A day's mode is locked by its first word.
let PREF_MODE = "normal";
try {
  const saved = localStorage.getItem(MODE_KEY);
  if (saved && saved in MODES) PREF_MODE = saved;
} catch {
  // Storage blocked: the mode lasts until reload.
}
// Active mode for today, set in init. It sets the minimum word length.
let MODE = PREF_MODE;
let MIN_LENGTH = MODES[MODE];

// Milestones shown as the player progresses toward the goal (percent of goal found).
const LADDER = [
  { at: 0, name: "Getting started" },
  { at: 25, name: "Warming up" },
  { at: 50, name: "Halfway" },
  { at: 75, name: "Almost there" },
  { at: 100, name: "Core complete" },
];

// Goal toggle, remembered on this device. Default is 10 per length.
const GOAL_KEY = "sourceword:goal";
let GOAL = "ten";
try {
  if (localStorage.getItem(GOAL_KEY) === "all") GOAL = "all";
} catch {
  // Storage blocked: the toggle works for this visit.
}

// Admin test view: only on the /admin/ page. It is not linked from the game. Remove before shipping.
const ADMIN = /\/admin37\/?$/.test(location.pathname);

// Analytics: Amplitude HTTP API, called directly so no SDK is loaded. Events: Puzzle Started, Puzzle Completed, Share Result.
const AMPLITUDE_KEY = "6ae928be8b28b6eb768a79b0fdf1fb3f";
const AMPLITUDE_URL = "https://api2.amplitude.com/2/httpapi";
// Where the "Next game" button goes after a finished day.
// Word reports go to the sheet through the Caseboard reminders Apps Script web app, which handles
// kind "sourceword_word" (see sheets/sourceword-report.gs for the code to add to that script).
const REPORT_URL = "https://script.google.com/macros/s/AKfycbywhEd7SRsyU1gmcekJ38g52yKKcKMDNBTw5mJrVFyd1dk31W1Cm2VCUpWP7n-1jRXJuA/exec";
const NEXT_GAME = { name: "Wordsummit", url: "https://froobaloo.com/wordsummit/" };

function randomId() {
  return window.crypto && crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

// Anonymous per-browser id, kept on this device. Failures never affect play.
function deviceId() {
  try {
    let id = localStorage.getItem("sourceword:device");
    if (!id) {
      id = randomId();
      localStorage.setItem("sourceword:device", id);
    }
    return id;
  } catch {
    return "no-storage";
  }
}

function track(eventType, props) {
  try {
    fetch(AMPLITUDE_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "*/*" },
      body: JSON.stringify({
        api_key: AMPLITUDE_KEY,
        events: [
          {
            device_id: deviceId(),
            event_type: eventType,
            time: Date.now(),
            insert_id: randomId(),
            platform: "Web",
            app_version: BUILD,
            event_properties: { ...props, game: "Sourceword" },
          },
        ],
      }),
      keepalive: true,
    }).catch(() => {});
  } catch {
    // Analytics must never break the game.
  }
}
let current = null; // { puzzle, play } for redraws

const el = {
  form: document.getElementById("guess-form"),
  input: document.getElementById("guess"),
  button: document.querySelector("#guess-form button"),
  message: document.getElementById("message"),
  score: document.getElementById("score"),
  count: document.getElementById("count"),
  found: document.getElementById("found"),
  bonuses: document.getElementById("bonuses"),
  source: document.getElementById("source"),
  finish: document.getElementById("finish"),
  build: document.getElementById("build"),
  date: document.getElementById("date"),
  debug: document.getElementById("debug"),
  debugSummary: document.getElementById("debug-summary"),
  debugWords: document.getElementById("debug-words"),
  countdown: document.getElementById("countdown"),
  rank: document.getElementById("rank"),
  statsBtn: document.getElementById("stats-btn"),
  stats: document.getElementById("stats"),
  statPlayed: document.getElementById("stat-played"),
  statStreak: document.getElementById("stat-streak"),
  achList: document.getElementById("ach-list"),
  achEmpty: document.getElementById("ach-empty"),
  toasts: document.getElementById("toasts"),
  statBest: document.getElementById("stat-best"),
  statBestScore: document.getElementById("stat-best-score"),
  results: document.getElementById("results"),
  resScore: document.getElementById("res-score"),
  resRank: document.getElementById("res-rank"),
  resCore: document.getElementById("res-core"),
  resTime: document.getElementById("res-time"),
  timer: document.getElementById("timer"),
  howtoBtn: document.getElementById("howto-btn"),
  howto: document.getElementById("howto"),
  howtoBody: document.getElementById("howto-body"),
  howtoBack: document.getElementById("howto-back"),
  howtoNext: document.getElementById("howto-next"),
  howtoDots: document.getElementById("howto-dots"),
  howtoClose: document.getElementById("howto-close"),
  shareText: document.getElementById("share-text"),
  shareBtn: document.getElementById("share-btn"),
  nextGame: document.getElementById("next-game"),
  archiveBtn: document.getElementById("archive-btn"),
  archive: document.getElementById("archive"),
  archiveList: document.getElementById("archive-list"),
  archiveClose: document.getElementById("archive-close"),
  shareNote: document.getElementById("share-note"),
  lengths: document.getElementById("lengths"),
  reveal: document.getElementById("reveal"),
  reset: document.getElementById("reset"),
  goalAll: document.getElementById("goal-all"),
  goalTen: document.getElementById("goal-ten"),
  modeNormal: document.getElementById("mode-normal"),
  modeHard: document.getElementById("mode-hard"),
  bonusHead: document.getElementById("bonus-head"),
};

function syncGoalButtons() {
  el.goalAll.setAttribute("aria-pressed", GOAL === "all" ? "true" : "false");
  el.goalTen.setAttribute("aria-pressed", GOAL === "ten" ? "true" : "false");
}

function setGoal(goal) {
  GOAL = goal;
  try {
    localStorage.setItem(GOAL_KEY, goal);
  } catch {
    // Storage blocked: the setting lasts until reload.
  }
  syncGoalButtons();
  if (current) render(current.puzzle, current.play);
}

el.goalAll.addEventListener("click", () => setGoal("all"));
el.goalTen.addEventListener("click", () => setGoal("ten"));
syncGoalButtons();

// A day's mode is locked once its first word is in. Before that, a change applies to the next load.
function modeLocked() {
  const p = loadPlay(todayET());
  return Boolean(p.done) || (p.found || []).length > 0;
}

function syncModeButtons() {
  el.modeNormal.setAttribute("aria-pressed", MODE === "normal" ? "true" : "false");
  el.modeHard.setAttribute("aria-pressed", MODE === "hard" ? "true" : "false");
  const locked = modeLocked();
  for (const b of [el.modeNormal, el.modeHard]) {
    b.disabled = locked;
    b.title = locked ? "Mode is set by your first word today." : "";
  }
}

function setMode(mode) {
  if (modeLocked() || mode === PREF_MODE) return;
  PREF_MODE = mode;
  try {
    localStorage.setItem(MODE_KEY, mode);
  } catch {
    // Storage blocked: the setting lasts until reload.
  }
  location.reload(); // The word list and minimum length change with the mode.
}

el.modeNormal.addEventListener("click", () => setMode("normal"));
el.modeHard.addEventListener("click", () => setMode("hard"));
syncModeButtons();

// Admin: show or hide the full word list in the test view.
el.reveal.addEventListener("click", () => {
  el.debugWords.hidden = !el.debugWords.hidden;
  el.reveal.textContent = el.debugWords.hidden ? "Show all words" : "Hide all words";
});

// Admin: clear today's play on this device and reload.
el.reset.addEventListener("click", () => {
  try {
    localStorage.removeItem(STORE_PREFIX + currentDay());
  } catch {
    // Storage blocked: nothing saved to clear.
  }
  location.reload();
});

el.build.textContent = `build ${BUILD}`;

// Today's date in Eastern time, YYYY-MM-DD. Puzzles roll over at midnight ET.
function todayET() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const get = (t) => parts.find((p) => p.type === t).value;
  return `${get("year")}-${get("month")}-${get("day")}`;
}

// Daily words: the Sourceword tab of the Google Sheet (read in the browser, the same way Caseboard reads its Puzzles tab).
const SHEET_ID = "1x6s2B4He9OoMUQgSuK1Rm3Ag7QWJ_ZuvaygkUGn_POo";
const SHEET_TAB = "Sourceword";
const SHEET_YEAR = 2026; // the sheet's dates have no year; this fills it in
const BAND_LOW = 15;
const BAND_HIGH = 50;
const BAND_MIN_LENGTH = 4;

// Minimal CSV parser (quoted fields, embedded commas). Google's CSV export quotes cells that need it.
function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; } else { inQuotes = false; }
      } else {
        field += c;
      }
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ",") {
      row.push(field); field = "";
    } else if (c === "\r") {
      // ignored; \n ends the row
    } else if (c === "\n") {
      row.push(field); rows.push(row); row = []; field = "";
    } else {
      field += c;
    }
  }
  if (field.length || row.length) { row.push(field); rows.push(row); }
  return rows.filter((r) => r.some((v) => v !== ""));
}

// "10/21", "10/21/2026" or "2026-10-21" -> "2026-10-21". Null if unreadable.
function isoDate(raw) {
  const s = (raw || "").trim();
  const pad = (n) => String(n).padStart(2, "0");
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (m) return `${m[1]}-${pad(m[2])}-${pad(m[3])}`;
  m = s.match(/^(\d{1,2})\/(\d{1,2})(?:\/(\d{4}))?$/);
  if (m) return `${m[3] || SHEET_YEAR}-${pad(m[1])}-${pad(m[2])}`;
  return null;
}

// "word, word, word" -> ["word", "word", "word"], lowercase letters only.
function parseCore(raw) {
  return (raw || "").split(/[,\s]+/).map((w) => w.trim().toLowerCase()).filter((w) => /^[a-z]+$/.test(w));
}

// Sheet columns by position: Date, Source Word, Valid Words, Status, Notes, Subwords, Band.
// Rows are skipped if the date or word is unusable, or the status is "draft".
async function loadSheetEntries() {
  const url = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(SHEET_TAB)}`;
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`sheet: HTTP ${res.status}`);
  const rows = parseCsv(await res.text()).slice(1);
  const out = {};
  for (const r of rows) {
    const date = isoDate(r[0]);
    const source = (r[1] || "").trim().toLowerCase();
    const status = (r[3] || "").trim().toLowerCase();
    if (!date || !/^[a-z]+$/.test(source) || status === "draft") continue;
    if (!out[date]) out[date] = { source, core: parseCore(r[CORE_COLUMN]) };
  }
  if (!Object.keys(out).length) throw new Error("sheet: no usable rows");
  return out;
}

// Fallback: puzzles.json (or window.PUZZLE_DATA in tests), keyed by date.
async function loadFallbackEntries() {
  const data = window.PUZZLE_DATA || (await (await fetch("puzzles.json", { cache: "no-cache" })).json());
  const out = {};
  for (const [date, p] of Object.entries(data)) {
    const source = String(p.source || "").trim().toLowerCase();
    if (/^[a-z]+$/.test(source)) {
      const core = Array.isArray(p.core) ? p.core.map((w) => String(w).toLowerCase()) : [];
      out[date] = { source, core };
    }
  }
  return out;
}

async function loadEntries() {
  try {
    return await loadSheetEntries();
  } catch (err) {
    console.warn("Sourceword: sheet unavailable, using puzzles.json:", err);
    return loadFallbackEntries();
  }
}

// Words in the band count: checking-list words at 4+ letters that fit the source, source excluded.
function bandCount(source, allWords) {
  return allWords.filter((w) => w.length >= BAND_MIN_LENGTH && w !== source && fitsSource(w, source)).length;
}

// Today if it's valid, else the most recent earlier valid day.
function pickDate(valid, today) {
  if (valid[today]) return today;
  const past = Object.keys(valid).filter((d) => d < today).sort();
  return past.length ? past[past.length - 1] : null;
}

// Checking list (common words, see README): every guess must be in it.
async function loadWords() {
  if (window.WORD_DATA) return window.WORD_DATA;
  const res = await fetch("words.json", { cache: "force-cache" });
  if (!res.ok) throw new Error(`words.json: HTTP ${res.status}`);
  return res.json();
}

// Common words (Zipf 3.0+), built by tools/build_common.py. If it can't load, every word counts as common.
async function loadCommon() {
  try {
    const res = await fetch("common.json", { cache: "force-cache" });
    if (!res.ok) throw new Error(`common.json: HTTP ${res.status}`);
    return new Set(await res.json());
  } catch (err) {
    console.warn("Sourceword: common list unavailable; every word counts as common.", err);
    return null;
  }
}

// Blocked words (blocked.json). If it can't load, the game still runs with no blocked words.
async function loadBlocked() {
  try {
    const res = await fetch("blocked.json", { cache: "force-cache" });
    if (!res.ok) throw new Error(`blocked.json: HTTP ${res.status}`);
    return new Set((await res.json()).map((w) => String(w).toLowerCase()));
  } catch (err) {
    console.warn("Sourceword: blocked list unavailable.", err);
    return new Set();
  }
}

// The day's valid words: checking-list words that fit the source, at the minimum length.
function validWordsFor(source, allWords) {
  return allWords.filter((w) => w.length >= MIN_LENGTH && w !== source && fitsSource(w, source));
}

function letterCounts(word) {
  const counts = {};
  for (const ch of word) counts[ch] = (counts[ch] || 0) + 1;
  return counts;
}

function fitsSource(word, source) {
  const avail = letterCounts(source);
  for (const ch of word) {
    if (!avail[ch]) return false;
    avail[ch]--;
  }
  return true;
}

// Boggle table by length. Also the value of one bonus word of that length.
function pointsForLength(n) {
  if (n <= 4) return 1;
  if (n === 5) return 2;
  if (n === 6) return 3;
  if (n === 7) return 5;
  return 11;
}

// Fills slots whose points match earned bonus points. Both lists are sorted ascending.
function fillSlots(points, earned) {
  const pool = earned.slice();
  return points.map((p) => {
    const i = pool.indexOf(p);
    if (i < 0) return false;
    pool.splice(i, 1);
    return true;
  });
}

// Every bonus slot for this puzzle and goal. Slots show a label and points, never a word.
function bonusSlots(puzzle, found) {
  const source = puzzle.source;
  const srcCounts = letterCounts(source);
  const srcLetters = Object.keys(srcCounts);
  const ten = GOAL === "ten";
  const foundSet = new Set(found);
  const slots = [];

  const isAll = (w) => srcLetters.every((ch) => letterCounts(w)[ch]);
  const isPerm = (w) =>
    w.length === source.length && srcLetters.every((ch) => letterCounts(w)[ch] === srcCounts[ch]);

  // Per-word bonuses: one slot per qualifying word in the puzzle.
  const perWord = [
    { kind: "all", label: "all letters", qual: puzzle.words.filter(isAll) },
    { kind: "perm", label: "perfect reuse", qual: puzzle.words.filter(isPerm) },
  ];
  for (const { kind, label, qual } of perWord) {
    const points = qual.map((w) => pointsForLength(w.length)).sort((a, b) => a - b);
    const earned = found.filter((w) => qual.includes(w)).map((w) => pointsForLength(w.length));
    const filled = fillSlots(points, earned.sort((a, b) => a - b));
    points.forEach((p, i) => slots.push({ id: `${kind}:${i}`, label, points: p, filled: filled[i] }));
  }

  // Length bonuses: all words of a length ("all") or that length's core ("ten").
  const total = countByLength(puzzle.words);
  const goalBy = ten ? coreGoal(puzzle) : total;
  const foundByLen = countByLength(ten ? splitFound(found, puzzle).core : found);
  const lengths = Object.keys(total).map(Number).sort((a, b) => a - b);
  for (const n of lengths) {
    const goalN = goalBy[n] || 0;
    const label = ten ? `${n}-letter core` : `all ${n}-letter words`;
    slots.push({
      id: `len:${n}`,
      label,
      points: pointsForLength(n),
      filled: goalN > 0 && (foundByLen[n] || 0) >= goalN,
    });
  }

  // All-words bonus: every word, or the core, valued at the source word's length.
  if (puzzle.words.length) {
    const done = ten ? progress(puzzle, { found }).remaining === 0 : found.length === puzzle.words.length;
    slots.push({
      id: "all",
      label: ten ? "core complete" : "all words",
      points: pointsForLength(source.length),
      filled: done,
    });
  }
  return slots;
}

// Scores a play from the found words alone, so bonuses are always derived, never stored.
function scorePlay(found, puzzle) {
  const base = found.reduce((sum, w) => sum + pointsForLength(w.length), 0);
  const slots = bonusSlots(puzzle, found);
  const earned = slots.filter((s) => s.filled);
  const bonusTotal = earned.reduce((sum, s) => sum + s.points, 0);
  return { base, slots, earned, total: base + bonusTotal };
}

// Milestone name for the share of the goal found so far.
function rankFor(p) {
  const pct = p.goal > 0 ? ((p.goal - p.remaining) / p.goal) * 100 : 100;
  let name = LADDER[0].name;
  for (const step of LADDER) if (pct >= step.at) name = step.name;
  return name;
}

// Source word as letter spans. Letters the typed text uses are greyed out.
function renderSource(source, typed) {
  const avail = letterCounts(typed.toLowerCase().replace(/[^a-z]/g, ""));
  el.source.innerHTML = "";
  for (const ch of source) {
    const span = document.createElement("span");
    span.textContent = ch;
    if (avail[ch]) {
      avail[ch]--;
      span.className = "used";
    }
    el.source.appendChild(span);
  }
}

// Admin test view: every valid word grouped by length, found words highlighted.
function renderDebug(puzzle, play) {
  if (!ADMIN) {
    el.debug.hidden = true;
    return;
  }
  el.debug.hidden = false;
  if (el.debugWords.dataset.ready !== "1") {
    el.debugWords.hidden = true;
    el.reveal.textContent = "Show all words";
    el.debugWords.dataset.ready = "1";
  }

  const found = new Set(play.found);
  const srcCounts = letterCounts(puzzle.source);
  const letters = Object.keys(srcCounts)
    .sort()
    .map((c) => (srcCounts[c] > 1 ? `${c} x${srcCounts[c]}` : c))
    .join(", ");
  el.debugSummary.textContent =
    `Build ${BUILD}. Source "${puzzle.source}" (letters: ${letters}). ` +
    `${puzzle.words.length} valid words, ${found.size} found. Minimum length ${MIN_LENGTH}. Goal: ${GOAL === "ten" ? "10 per length" : "all words"}. ` +
    `Bonus: all letters, perfect reuse (each source letter used at full count), every word of a length, all words (worth ${pointsForLength(puzzle.source.length)}). ` +
    (GOAL === "ten" ? " Core words are listed first. Bonus words are in italics." : "");

  const byLength = {};
  for (const w of puzzle.words) {
    if (!byLength[w.length]) byLength[w.length] = [];
    byLength[w.length].push(w);
  }

  el.debugWords.innerHTML = "";
  for (const n of Object.keys(byLength).map(Number).sort((a, b) => a - b)) {
    const words = byLength[n].slice().sort();
    const got = words.filter((w) => found.has(w)).length;

    const h = document.createElement("h3");
    h.textContent = `${n} letters: ${got} of ${words.length} found, ${pointsForLength(n)} pt each`;
    el.debugWords.appendChild(h);

    // Core follows the game's rule: the day's curated list, or the first CORE_CAP common words of each length.
    // Core words are listed first; bonus words follow, in italics.
    let core = words;
    if (GOAL === "ten") {
      core = puzzle.curated
        ? words.filter((w) => puzzle.curated.has(w))
        : words.filter((w) => isCommon(w, puzzle)).slice(0, CORE_CAP);
    }
    const coreSet = new Set(core);
    const ordered = [...core, ...words.filter((w) => !coreSet.has(w))];
    const ul = document.createElement("ul");
    for (const w of ordered) {
      const li = document.createElement("li");
      li.textContent = w;
      if (found.has(w)) li.classList.add("got");
      if (!coreSet.has(w)) li.classList.add("bonus");
      ul.appendChild(li);
    }
    el.debugWords.appendChild(ul);
  }
}

// Stats come from saved days. A day counts as played once it is finished.
function playedDays() {
  const days = [];
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key || !key.startsWith(STORE_PREFIX)) continue;
      const play = JSON.parse(localStorage.getItem(key));
      if (play && play.done) days.push({ ...play, date: key.slice(STORE_PREFIX.length) });
    }
  } catch {
    // Storage blocked: no history to show.
  }
  return days.sort((a, b) => a.date.localeCompare(b.date));
}

// Day number for a YYYY-MM-DD date, so consecutive days differ by exactly 1.
function dayNumber(date) {
  const [y, m, d] = date.split("-").map(Number);
  return Date.UTC(y, m - 1, d) / 86400000;
}

// Current streak counts back from today, or from yesterday if today is not finished yet.
function streaks(days, today) {
  const played = new Set(days.map((d) => dayNumber(d.date)));
  let best = 0;
  let run = 0;
  let prev = null;
  for (const d of days) {
    const n = dayNumber(d.date);
    run = prev !== null && n === prev + 1 ? run + 1 : 1;
    best = Math.max(best, run);
    prev = n;
  }
  const t = dayNumber(today);
  const start = played.has(t) ? t : played.has(t - 1) ? t - 1 : null;
  let current = 0;
  if (start !== null) for (let n = start; played.has(n); n--) current++;
  return { current, best };
}

// One row per length: squares for the goal, filled by words found. Shown in the share text.
function gridRows(puzzle, play) {
  const total = countByLength(puzzle.words);
  const ten = GOAL === "ten";
  const goalBy = ten ? coreGoal(puzzle) : total;
  const found = countByLength(ten ? splitFound(play.found, puzzle).core : play.found);
  const lengths = Object.keys(total).map(Number);
  const max = lengths.length ? Math.max(...lengths) : 0;
  const rows = [];
  for (let n = MIN_LENGTH; n <= max; n++) {
    const goalN = goalBy[n] || 0;
    if (goalN === 0) continue;
    // One emoji per core word, capped at CORE_CAP squares per row. Green = found, white = not yet.
    const foundN = Math.min(found[n] || 0, goalN);
    const squares = Math.min(CORE_CAP, goalN);
    const filled = Math.round((foundN / goalN) * squares);
    rows.push("🟩".repeat(filled) + "⬜".repeat(squares - filled));
  }
  return rows;
}

// Spoiler-free, in the Caseboard share style: a header, one emoji row per word length, the link.
function shareTextFor(date, play) {
  const [y, m, d] = date.split("-").map(Number);
  const modeName = play.mode && play.mode !== "normal" ? ` · ${play.mode[0].toUpperCase()}${play.mode.slice(1)}` : "";
  return [
    `Sourceword · ${m}/${d}${modeName} · score ${play.score}`,
    ...(play.grid || []),
    SITE_URL,
  ].join("\n");
}

function renderStats(date) {
  const days = playedDays();
  const s = streaks(days, date);
  el.statPlayed.textContent = days.length;
  el.statStreak.textContent = s.current;
  el.statBest.textContent = s.best;
  el.statBestScore.textContent = days.reduce((m, d) => Math.max(m, d.score || 0), 0);
  renderAchievements();

}

// The result card: score, milestone and the copyable share text. Shown once the day is finished.
function renderResults(date) {
  const play = loadPlay(date);
  if (!play.done) {
    el.results.hidden = true;
    return;
  }
  el.nextGame.href = NEXT_GAME.url;
  el.nextGame.textContent = `Next game: ${NEXT_GAME.name} →`;
  el.results.hidden = false;
  el.resScore.textContent = play.score;
  el.resRank.textContent = play.rank;
  el.resCore.textContent = `${play.goalFound} of ${play.goalTotal} ${play.goalMode === "ten" ? "core words" : "words"} found`;
  el.resTime.textContent = play.coreDone
    ? `You found all the core words in ${fmtTime(play.coreMs)}!`
    : `Core words not all found. Time played: ${fmtTime(play.activeMs || 0)}.`;
  el.shareText.textContent = shareTextFor(date, play);
  el.shareNote.textContent = "";
}

el.statsBtn.addEventListener("click", () => {
  const opening = el.stats.hidden;
  el.stats.hidden = !opening;
  if (opening) renderStats(currentDay());
});

// The day on screen (today, or an archive day), kept off the visible label.
function currentDay() {
  return el.date.dataset.day;
}

// Copies the spoiler-free result. Falls back to selecting the text where clipboard access is blocked.
el.shareBtn.addEventListener("click", async () => {
  const text = el.shareText.textContent;
  track("Share Result", { date: currentDay(), mode: MODE, goal: GOAL });
  try {
    await navigator.clipboard.writeText(text);
    el.shareNote.textContent = "Copied. Paste it anywhere.";
  } catch {
    const range = document.createRange();
    range.selectNodeContents(el.shareText);
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);
    el.shareNote.textContent = "Select and copy the text below.";
  }
});
function say(text, isBad = false) {
  el.message.textContent = text;
  el.message.classList.toggle("bad", isBad);
}

// A rejection the player may think is wrong: offers a button that adds the word to the suggestions tab.
function sayReportable(text, word, date, source) {
  say(text, true);
  if (!REPORT_URL) return;
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "secondary report-btn";
  btn.textContent = "Report this word";
  btn.addEventListener("click", () => {
    // The endpoint replies with an opaque response, so a send that fails silently still looks sent.
    fetch(REPORT_URL, {
      method: "POST",
      mode: "no-cors",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify({ kind: "sourceword_word", word, date, source, mode: MODE, goal: GOAL }),
      keepalive: true,
    }).catch(() => {});
    btn.disabled = true;
    btn.textContent = "Reported. Thanks";
  });
  el.message.appendChild(btn);
}

// Saved state for one day's play: { found: [...], done: bool }
function loadPlay(date) {
  try {
    return JSON.parse(localStorage.getItem(STORE_PREFIX + date)) || { found: [], done: false };
  } catch {
    return { found: [], done: false };
  }
}

function savePlay(date, play) {
  try {
    localStorage.setItem(STORE_PREFIX + date, JSON.stringify(play));
  } catch {
    // Storage can be blocked (private mode). Play still works for this visit.
  }
}

// Core and bonus words for the "ten" goal. Core is the day's curated list if it has one, otherwise
// the first CORE_CAP common words of each length in play order. Obscure words are always bonus.
function isCommon(w, puzzle) {
  return !puzzle.common || puzzle.common.has(w);
}

function countByLength(words) {
  const out = {};
  for (const w of words) out[w.length] = (out[w.length] || 0) + 1;
  return out;
}

function splitFound(found, puzzle) {
  if (GOAL !== "ten") return { core: found.slice(), extra: [] };
  return splitCore(found, puzzle);
}

// Core and bonus split for the day, whichever goal is on.
function splitCore(found, puzzle) {
  const core = [];
  const extra = [];
  const seen = {};
  for (const w of found) {
    if (puzzle.curated) {
      (puzzle.curated.has(w) ? core : extra).push(w);
    } else if (isCommon(w, puzzle)) {
      seen[w.length] = (seen[w.length] || 0) + 1;
      (seen[w.length] <= CORE_CAP ? core : extra).push(w);
    } else {
      extra.push(w);
    }
  }
  return { core, extra };
}

// Core words still to find. Core means the same thing under both goals.
function coreLeft(puzzle, play) {
  const goal = coreGoal(puzzle);
  const found = countByLength(splitCore(play.found, puzzle).core);
  let left = 0;
  for (const n of Object.keys(goal)) left += Math.max(0, goal[n] - (found[n] || 0));
  return left;
}

// Core words per length for the "ten" goal.
function coreGoal(puzzle) {
  const goal = {};
  for (const w of puzzle.words) {
    const isCore = puzzle.curated ? puzzle.curated.has(w) : isCommon(w, puzzle);
    if (isCore) goal[w.length] = (goal[w.length] || 0) + 1;
  }
  if (!puzzle.curated) for (const n of Object.keys(goal)) goal[n] = Math.min(CORE_CAP, goal[n]);
  return goal;
}

// Words left toward the goal, and words left by length (MIN_LENGTH up to the longest word).
function progress(puzzle, play) {
  const total = countByLength(puzzle.words);
  const ten = GOAL === "ten";
  const goalBy = ten ? coreGoal(puzzle) : total;
  const found = countByLength(ten ? splitFound(play.found, puzzle).core : play.found);

  const lengths = Object.keys(total).map(Number);
  const max = lengths.length ? Math.max(...lengths) : 0;
  let remaining = 0;
  let goal = 0;
  const perLength = [];
  for (let n = MIN_LENGTH; n <= max; n++) {
    const goalN = goalBy[n] || 0;
    const foundN = Math.min(found[n] || 0, goalN);
    const left = goalN - foundN;
    remaining += left;
    goal += goalN;
    perLength.push(`${n} (${left})`);
  }
  return { remaining, goal, text: perLength.join(", ") };
}

function render(puzzle, play) {
  current = { puzzle, play };
  const result = scorePlay(play.found, puzzle);
  const { core, extra } = splitFound(play.found, puzzle);

  el.found.innerHTML = "";
  const sorted = core.slice().sort((a, b) => a.length - b.length || a.localeCompare(b));
  for (const w of sorted) {
    const li = document.createElement("li");
    li.textContent = `${w} (+${pointsForLength(w.length)})`;
    el.found.appendChild(li);
  }

  el.bonuses.innerHTML = "";
  for (const s of result.slots) {
    const li = document.createElement("li");
    li.textContent = `${s.label} +${s.points}`;
    if (s.filled) li.className = "filled";
    el.bonuses.appendChild(li);
  }
  const extraSorted = extra.slice().sort((a, b) => a.length - b.length || a.localeCompare(b));
  for (const w of extraSorted) {
    const li = document.createElement("li");
    li.className = "filled";
    li.textContent = `${w} (+${pointsForLength(w.length)})`;
    el.bonuses.appendChild(li);
  }

  el.score.textContent = result.total;
  el.count.textContent = play.found.length;

  if (MODE === "hard") {
    el.countdown.hidden = true;
    el.lengths.hidden = true;
    el.rank.hidden = true;
    el.bonuses.hidden = true;
    el.bonusHead.hidden = true;
  } else {
    el.bonuses.hidden = false;
    el.bonusHead.hidden = false;
    const p = progress(puzzle, play);
    el.rank.hidden = false;
    el.rank.textContent = rankFor(p);
    el.countdown.hidden = false;
    if (GOAL === "ten") {
      el.countdown.textContent = p.remaining > 0 ? `${p.remaining} core words left` : "Core complete";
    } else {
      el.countdown.textContent = `${p.remaining} words left`;
    }
    el.lengths.hidden = false;
    el.lengths.textContent = p.text;
  }

  const over = play.done;
  el.input.disabled = over;
  el.button.disabled = over;
  el.finish.disabled = over;
  renderDebug(puzzle, play);
  syncModeButtons();
  showTime();
  return result;
}

// Hub "played today" mark (kit at /kit/froobaloo.js). A finished day counts, win or lose.
function markHubPlayed() {
  try {
    if (window.Froobaloo) window.Froobaloo.markPlayed("sourceword");
  } catch (err) {
    console.warn("Sourceword: hub played mark unavailable.", err);
  }
}

// Achievements. Each test reads the day's puzzle and play. Earned ones are kept on the day's play
// (so they don't repeat) and in a per-device list shown under Stats.
const ACH_KEY = "sourceword:achievements";
const QUICK_CORE_MS = 3 * 60 * 1000;

// Every achievement with whether it is met. Length achievements are built per puzzle.
// streakNow is the current streak when the day is finished, or null otherwise.
function achievementList(puzzle, play, streakNow) {
  const found = play.found;
  const slots = bonusSlots(puzzle, found);
  const p = progress(puzzle, play);
  const list = [
    { id: "first_word", name: "First word", desc: "Find your first word of the day.", ok: found.length >= 1 },
    { id: "core_complete", name: "Core complete", desc: "Find every core word.", ok: Boolean(play.coreDone) },
    { id: "full_board", name: "Full board", desc: "Find every word in the puzzle.", ok: found.length === puzzle.words.length },
    { id: "perfect_reuse", name: "Perfect reuse", desc: "Make a word from every letter of the source word.", ok: slots.some((s) => s.label === "perfect reuse" && s.filled) },
    { id: "first_bonus", name: "First bonus", desc: "Fill your first bonus slot.", ok: slots.some((s) => s.filled) },
    { id: "halfway", name: "Halfway", desc: "Reach half of today's goal.", ok: p.goal > 0 && p.goal - p.remaining >= p.goal / 2 },
    { id: "quick_core", name: "Quick core", desc: "Find every core word in under 3 minutes.", ok: Boolean(play.coreDone) && (play.coreMs || 0) < QUICK_CORE_MS },
  ];
  const total = countByLength(puzzle.words);
  const foundBy = countByLength(found);
  for (const n of Object.keys(total).map(Number).sort((a, b) => a - b)) {
    if (n < MIN_LENGTH) continue;
    list.push({ id: `len:${n}`, name: `All ${n}-letter words`, desc: `Find every ${n}-letter word in the puzzle.`, ok: (foundBy[n] || 0) >= total[n] });
  }
  if (streakNow !== null) {
    list.push({ id: "streak_3", name: "Three in a row", desc: "Finish three days in a row.", ok: streakNow >= 3 });
    list.push({ id: "streak_7", name: "Week streak", desc: "Finish seven days in a row.", ok: streakNow >= 7 });
  }
  return list;
}

// Marks newly met achievements on the play and returns them. Call before saving the play.
function newAchievements(date, puzzle, play, checkStreak) {
  const streakNow = checkStreak ? streaks(playedDays(), date).current : null;
  const got = achievementList(puzzle, play, streakNow).filter((a) => a.ok && !(play.achievements || []).includes(a.id));
  if (!got.length) return got;
  play.achievements = [...(play.achievements || []), ...got.map((a) => a.id)];
  recordAchievements(got, date);
  return got;
}

function recordAchievements(got, date) {
  try {
    const all = JSON.parse(localStorage.getItem(ACH_KEY)) || {};
    for (const a of got) if (!all[a.id]) all[a.id] = { name: a.name, desc: a.desc, date };
    localStorage.setItem(ACH_KEY, JSON.stringify(all));
  } catch {
    // Storage blocked: the toast still shows, the Stats list just stays empty.
  }
}

// Short notices at the top of the page. Tap to dismiss; they also fade after a few seconds.
function showToasts(got) {
  for (const a of got) {
    const t = document.createElement("div");
    t.className = "toast";
    t.setAttribute("role", "status");
    const title = document.createElement("strong");
    title.textContent = `Achievement: ${a.name}`;
    const detail = document.createElement("span");
    detail.textContent = a.desc;
    t.append(title, detail);
    t.addEventListener("click", () => t.remove());
    el.toasts.appendChild(t);
    setTimeout(() => t.remove(), 4500);
  }
}

function renderAchievements() {
  let all = {};
  try {
    all = JSON.parse(localStorage.getItem(ACH_KEY)) || {};
  } catch {
    all = {};
  }
  const rows = Object.values(all).sort((a, b) => b.date.localeCompare(a.date));
  el.achList.innerHTML = "";
  for (const a of rows) {
    const li = document.createElement("li");
    const name = document.createElement("strong");
    name.textContent = a.name;
    const meta = document.createElement("span");
    meta.textContent = ` ${a.desc} (${a.date})`;
    li.append(name, meta);
    el.achList.appendChild(li);
  }
  el.achEmpty.hidden = rows.length > 0;
}

function finish(date, puzzle, play) {
  const wasDone = play.done;
  play.done = true;
  const p = progress(puzzle, play);
  play.score = scorePlay(play.found, puzzle).total;
  play.rank = rankFor(p);
  play.goalMode = GOAL;
  play.goalTotal = p.goal;
  play.goalFound = p.goal - p.remaining;
  play.grid = gridRows(puzzle, play);
  checkCore(play, puzzle);
  savePlay(date, play);
  const won = newAchievements(date, puzzle, play, date === todayET());
  savePlay(date, play);
  markHubPlayed();
  render(puzzle, play);
  showToasts(won);
  say(`Done. ${play.found.length} of ${puzzle.words.length} found. Score ${play.score}.`);
  renderStats(date);
  renderResults(date);
  if (!wasDone) {
    track("Puzzle Completed", {
      date,
      mode: play.mode,
      goal: GOAL,
      score: play.score,
      rank: play.rank,
      words_found: play.found.length,
      core_found: play.goalFound,
      core_total: play.goalTotal,
    });
  }
  el.results.scrollIntoView?.({ behavior: "smooth", block: "start" });
}

// Timer. Counts active play time for the day on screen: only while the tab is visible and the player
// touched something in the last 60 seconds. It freezes when every core word is found.
const IDLE_LIMIT_MS = 60 * 1000;
const TICK_CAP_MS = 1500; // a longer gap means the device slept, so count at most this much
let lastActivity = 0;
let lastTick = Date.now();
let timed = null; // { date, play } for the day on screen
let unsaved = 0; // counted ticks not yet saved

function fmtTime(ms) {
  const s = Math.floor(ms / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = String(s % 60).padStart(2, "0");
  return h ? `${h}:${String(m).padStart(2, "0")}:${sec}` : `${m}:${sec}`;
}

function markActivity() {
  lastActivity = Date.now();
}
for (const ev of ["pointerdown", "keydown", "touchstart", "scroll"]) {
  document.addEventListener(ev, markActivity, { capture: true, passive: true });
}

function flushTime() {
  if (timed && unsaved) {
    savePlay(timed.date, timed.play);
    unsaved = 0;
  }
}

function showTime() {
  if (!timed) return;
  const p = timed.play;
  el.timer.textContent = p.coreDone ? `Core ${fmtTime(p.coreMs)}` : `Time ${fmtTime(p.activeMs || 0)}`;
}

// Freeze the core time once every core word is in. Returns true the first time it happens.
function checkCore(play, puzzle) {
  if (play.coreDone || coreLeft(puzzle, play) > 0) return false;
  play.coreDone = true;
  play.coreMs = play.activeMs || 0;
  return true;
}

setInterval(() => {
  const now = Date.now();
  const gap = now - lastTick;
  lastTick = now;
  if (!timed || timed.play.done || timed.play.coreDone) return;
  if (document.visibilityState !== "visible" || now - lastActivity > IDLE_LIMIT_MS) return;
  timed.play.activeMs = (timed.play.activeMs || 0) + Math.min(gap, TICK_CAP_MS);
  unsaved += 1;
  if (unsaved >= 10) flushTime();
  showTime();
}, 1000);

document.addEventListener("visibilitychange", () => {
  lastTick = Date.now();
  flushTime();
});
window.addEventListener("pagehide", flushTime);

function start(date, puzzle) {
  const play = loadPlay(date);
  if (!play.mode) play.mode = MODE;
  if (!play.started && !play.done && play.found.length === 0) {
    play.started = true;
    savePlay(date, play);
    track("Puzzle Started", { date, mode: play.mode, goal: GOAL });
  }
  renderSource(puzzle.source, "");
  el.input.addEventListener("input", () => renderSource(puzzle.source, el.input.value));
  timed = { date, play };
  render(puzzle, play);

  if (play.done) {
    markHubPlayed();
    say("You've already played this puzzle.");
    renderResults(date);
    return;
  }
  if (play.found.length === puzzle.words.length) return finish(date, puzzle, play);

  el.form.addEventListener("submit", (e) => {
    e.preventDefault();
    const word = el.input.value.trim().toLowerCase();
    el.input.value = "";
    renderSource(puzzle.source, "");

    if (word.length < MIN_LENGTH) return say(`Too short. ${MIN_LENGTH} letters minimum.`, true);
    if (!/^[a-z]+$/.test(word)) return say("Letters only.", true);
    if (word === puzzle.source) return say("That's the source word.", true);
    if (!fitsSource(word, puzzle.source)) return say("Uses a letter not in the source word.", true);
    if (play.found.includes(word)) return say(`Already found: ${word}.`, true);
    if (BLOCKED.has(word)) return say("Not accepted.", true);
    if (!puzzle.wordSet.has(word)) return sayReportable(`Not in the word list: ${word}.`, word, date, puzzle.source);

    const before = new Set(scorePlay(play.found, puzzle).earned.map((s) => s.id));
    play.found.push(word);
    const coreNow = checkCore(play, puzzle);
    savePlay(date, play);
    const result = render(puzzle, play);
    const won = newAchievements(date, puzzle, play, false);
    savePlay(date, play);
    showToasts(won);

    const earned = result.earned.filter((s) => !before.has(s.id));
    const bonusText = earned.map((s) => ` ${s.label} +${s.points}.`).join("");
    const coreText = !coreNow ? "" : GOAL === "ten"
      ? ` Core complete in ${fmtTime(play.coreMs)}. Bonus words still count.`
      : ` All core words found in ${fmtTime(play.coreMs)}.`;
    say(`${word}: +${pointsForLength(word.length)}.${bonusText}${coreText}`);

    if (play.found.length === puzzle.words.length) finish(date, puzzle, play);
  });

  el.finish.addEventListener("click", () => finish(date, puzzle, play));
  el.input.focus();
}

// How to play: a short walkthrough. Opens on first visit and from the footer button.
const HOWTO_KEY = "sourceword:howto-seen";
const HOWTO_SAMPLE = "garden";
let howtoStep = 0;
let howtoWords = null;
let howtoFound = [];

// Letter tiles for a word. Letters the typed text uses are greyed out, like the live source word.
function tiles(word, typed = "") {
  const avail = letterCounts(typed.toLowerCase().replace(/[^a-z]/g, ""));
  return `<div class="tiles" id="ex-tiles">${[...word].map((c) => {
    const used = avail[c] > 0;
    if (used) avail[c]--;
    return `<span class="tile-letter${used ? " used" : ""}">${c}</span>`;
  }).join("")}</div>`;
}

const HOWTO_BODY = [
  `<p>Each day has one <strong>source word</strong>. Build as many words as you can from its letters.</p>
   ${tiles(HOWTO_SAMPLE)}
   <p class="muted">Today's source word is at the top of the game.</p>`,
  `<p>Each letter can be used only as many times as it appears in the source word.</p>
   ${tiles(HOWTO_SAMPLE)}
   <p>Try one of these: <strong>dare</strong>, <strong>gear</strong>, or <strong>anger</strong>.</p>
   <form id="ex-form" autocomplete="off">
     <input id="ex-input" type="text" autocapitalize="off" autocorrect="off" spellcheck="false" aria-label="Example word" placeholder="Type a word">
     <button type="submit">Enter</button>
   </form>
   <p id="ex-msg" class="ex-msg" role="status"></p>`,
  `<p>Words score by length:</p>
   <table class="score-table">
     <tr><td>4 letters</td><td>1 point</td></tr>
     <tr><td>5 letters</td><td>2 points</td></tr>
     <tr><td>6 letters</td><td>3 points</td></tr>
     <tr><td>7 letters</td><td>5 points</td></tr>
     <tr><td>8+ letters</td><td>11 points</td></tr>
   </table>`,
  `<p><strong>10 per length</strong> is the default goal. Core words are the day's curated list, or the first 10 common words of each length. Other words still score as bonus.</p>
   <p><strong>All words</strong> counts every word in the puzzle.</p>
   <p>Bonus slots fill when you find every letter of the source word, a perfect reuse of its letter counts, every word of a length, or all words.</p>
   <p class="muted">Hard mode hides the counts and the bonus slots.</p>`,
  `<p>The day ends when you find every word, or when you tap <strong>I'm done</strong>.</p>
   <p>You'll see your score and a result card you can copy to share.</p>
   <p class="howto-score">A sample score: <strong>37</strong></p>`,
];

async function loadHowtoWords() {
  if (!howtoWords) {
    const all = await loadWords();
    howtoWords = new Set(all.filter((w) => w.length >= 4 && w !== HOWTO_SAMPLE && fitsSource(w, HOWTO_SAMPLE)));
  }
  return howtoWords;
}

// The live example on step 2: checks against the sample word only.
function wireHowtoExample() {
  const form = document.getElementById("ex-form");
  const input = document.getElementById("ex-input");
  const msg = document.getElementById("ex-msg");
  if (!form) return;
  // Grey out GARDEN's letters as the user types, same as the source word in the game.
  input.addEventListener("input", () => {
    const tilesEl = document.getElementById("ex-tiles");
    if (tilesEl) tilesEl.outerHTML = tiles(HOWTO_SAMPLE, input.value);
  });
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const words = await loadHowtoWords();
    const w = input.value.trim().toLowerCase();
    input.value = "";
    const tilesEl = document.getElementById("ex-tiles");
    if (tilesEl) tilesEl.outerHTML = tiles(HOWTO_SAMPLE);
    if (!/^[a-z]+$/.test(w)) return (msg.textContent = "Letters only.");
    if (w.length < 4) return (msg.textContent = "Too short. 4 letters minimum.");
    if (!fitsSource(w, HOWTO_SAMPLE)) return (msg.textContent = "Uses a letter GARDEN doesn't have enough of.");
    if (howtoFound.includes(w)) return (msg.textContent = `Already found: ${w}.`);
    if (!words.has(w)) return (msg.textContent = `Not in the word list: ${w}.`);
    howtoFound.push(w);
    msg.textContent = `${w}: +${pointsForLength(w.length)}. Nice.`;
  });
}

function renderHowtoStep() {
  el.howtoBody.innerHTML = HOWTO_BODY[howtoStep];
  el.howtoBack.disabled = howtoStep === 0;
  el.howtoNext.textContent = howtoStep === HOWTO_BODY.length - 1 ? "Start playing" : "Next";
  el.howtoDots.innerHTML = HOWTO_BODY.map((_, i) => `<span class="dot${i === howtoStep ? " on" : ""}"></span>`).join("");
  if (howtoStep === 1) wireHowtoExample();
}

function openHowto() {
  howtoStep = 0;
  renderHowtoStep();
  if (typeof el.howto.showModal === "function") el.howto.showModal();
  else el.howto.setAttribute("open", "");
  try {
    localStorage.setItem(HOWTO_KEY, "1");
  } catch {
    // Storage blocked: the walkthrough may show again on the next visit.
  }
}

// Shown on a browser's first visit. If storage is blocked, the flag can't be kept, so it shows on each load.
function showHowtoOnFirstVisit() {
  let seen = false;
  try {
    seen = localStorage.getItem(HOWTO_KEY) === "1";
  } catch {
    // Storage blocked: not seen, so the walkthrough shows.
  }
  if (!seen) openHowto();
}

// Archive: past puzzles from the sheet. Each opens with ?day=YYYY-MM-DD.
let ARCHIVE = [];

function shortDate(date) {
  const [, m, d] = date.split("-").map(Number);
  return `${m}/${d}`;
}

function openDialog(d) {
  if (typeof d.showModal === "function") d.showModal();
  else d.setAttribute("open", "");
}

function renderArchive() {
  el.archiveList.innerHTML = "";
  if (!ARCHIVE.length) {
    const li = document.createElement("li");
    li.className = "muted";
    li.textContent = "No past puzzles yet.";
    el.archiveList.appendChild(li);
    return;
  }
  for (const { date, source } of ARCHIVE) {
    const play = loadPlay(date);
    const status = play.done ? `Score ${play.score}` : (play.found || []).length ? "In progress" : "Not played";
    const li = document.createElement("li");
    const a = document.createElement("a");
    a.className = "archive-row";
    a.href = `${location.pathname}?day=${date}`;
    const left = document.createElement("span");
    left.textContent = `${shortDate(date)} `;
    const word = document.createElement("span");
    word.className = "arch-word";
    word.textContent = source;
    left.appendChild(word);
    const right = document.createElement("span");
    right.className = "arch-status";
    right.textContent = status;
    a.append(left, right);
    li.appendChild(a);
    el.archiveList.appendChild(li);
  }
}

el.archiveBtn.addEventListener("click", () => {
  renderArchive();
  openDialog(el.archive);
});
el.archiveClose.addEventListener("click", () => el.archive.close());

el.howtoBtn.addEventListener("click", openHowto);
el.howtoClose.addEventListener("click", () => el.howto.close());
el.howtoBack.addEventListener("click", () => {
  howtoStep = Math.max(0, howtoStep - 1);
  renderHowtoStep();
});
el.howtoNext.addEventListener("click", () => {
  if (howtoStep === HOWTO_BODY.length - 1) return el.howto.close();
  howtoStep += 1;
  renderHowtoStep();
});

async function init() {
  const today = todayET();
  document.title = `Sourceword (${BUILD})`;
  el.date.dataset.day = today;
  el.date.textContent = today;
  try {
    const [rawWords, common, blocked] = await Promise.all([loadWords(), loadCommon(), loadBlocked()]);
    COMMON = common;
    BLOCKED = blocked;
    const allWords = rawWords.filter((w) => !blocked.has(w));
    const entries = await loadEntries();
    const valid = {};
    for (const [date, e] of Object.entries(entries)) {
      const n = bandCount(e.source, allWords);
      if (n >= BAND_LOW && n <= BAND_HIGH) valid[date] = e;
      else console.warn(`Sourceword: ${date} (${e.source}) has ${n} valid words, outside ${BAND_LOW} to ${BAND_HIGH}; skipped.`);
    }
    // ?day=YYYY-MM-DD opens an archive day, if it is a valid past day.
    const requested = new URLSearchParams(location.search).get("day");
    const date = requested && valid[requested] && requested <= today ? requested : pickDate(valid, today);
    ARCHIVE = Object.keys(valid)
      .filter((d) => d < today)
      .sort()
      .reverse()
      .map((d) => ({ date: d, source: valid[d].source }));
    if (!date) {
      el.source.textContent = "none";
      el.input.disabled = true;
      el.button.disabled = true;
      el.finish.disabled = true;
      return say(`No puzzle for ${today}.`, true);
    }
    el.date.dataset.day = date;
    el.date.textContent = date === today ? today : `${date} · archive`;
    const puzzle = { source: valid[date].source, core: valid[date].core || [], common: COMMON };
    // Mode for the day: the locked one if the day has play, else the preference.
    const saved = loadPlay(date);
    const started = saved.done || (saved.found || []).length > 0;
    const savedMode = saved.mode in MODES ? saved.mode : null; // a day locked to a retired mode plays as Normal
    MODE = savedMode || (started ? "normal" : PREF_MODE);
    MIN_LENGTH = MODES[MODE];
    syncModeButtons();
    puzzle.words = validWordsFor(puzzle.source, allWords);
    puzzle.wordSet = new Set(puzzle.words);
    const curated = new Set(puzzle.core.filter((w) => puzzle.wordSet.has(w)));
    const dropped = puzzle.core.filter((w) => !puzzle.wordSet.has(w));
    if (dropped.length) console.warn(`Sourceword: curated core words not valid for ${date}: ${dropped.join(", ")}`);
    puzzle.curated = curated.size ? curated : null;
    start(date, puzzle);
    showHowtoOnFirstVisit();
  } catch (err) {
    say("Couldn't load today's puzzle.", true);
    console.error(err);
  }
}

init();
