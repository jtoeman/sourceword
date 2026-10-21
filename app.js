// Sourceword, build 0.3.0-b19
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

const BUILD = "0.3.0-b19";
const SITE_URL = "https://froobaloo.com/sourceword/"; // path to confirm on launch
const STORE_PREFIX = "sourceword:play:";
const MODES = { easy: 3, normal: 4, hard: 4 };
const MODE_KEY = "sourceword:mode";
const CORE_CAP = 10;
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

// Admin test view: on-screen toggle in the footer, remembered on this device. Also on via #debug or ?debug=1. Remove before shipping.
const ADMIN_KEY = "sourceword:admin";
let ADMIN = location.hash === "#debug" || new URLSearchParams(location.search).has("debug");
try {
  if (localStorage.getItem(ADMIN_KEY) === "1") ADMIN = true;
} catch {
  // Storage blocked: the toggle still works for this visit.
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
  statBest: document.getElementById("stat-best"),
  statBestScore: document.getElementById("stat-best-score"),
  shareBox: document.getElementById("share-box"),
  shareText: document.getElementById("share-text"),
  copyShare: document.getElementById("copy-share"),
  shareNote: document.getElementById("share-note"),
  lengths: document.getElementById("lengths"),
  reveal: document.getElementById("reveal"),
  reset: document.getElementById("reset"),
  adminToggle: document.getElementById("admin-toggle"),
  goalAll: document.getElementById("goal-all"),
  goalTen: document.getElementById("goal-ten"),
  modeEasy: document.getElementById("mode-easy"),
  modeNormal: document.getElementById("mode-normal"),
  modeHard: document.getElementById("mode-hard"),
  bonusHead: document.getElementById("bonus-head"),
};

function setAdmin(on) {
  ADMIN = on;
  try {
    localStorage.setItem(ADMIN_KEY, on ? "1" : "0");
  } catch {
    // Storage blocked: the setting lasts until reload.
  }
  el.adminToggle.textContent = on ? "Admin: on" : "Admin: off";
  if (current) renderDebug(current.puzzle, current.play);
  else el.debug.hidden = !on;
}

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

el.adminToggle.textContent = ADMIN ? "Admin: on" : "Admin: off";
el.adminToggle.addEventListener("click", () => setAdmin(!ADMIN));
el.goalAll.addEventListener("click", () => setGoal("all"));
el.goalTen.addEventListener("click", () => setGoal("ten"));
syncGoalButtons();

// A day's mode is locked once its first word is in. Before that, a change applies to the next load.
function modeLocked() {
  const p = loadPlay(todayET());
  return Boolean(p.done) || (p.found || []).length > 0;
}

function syncModeButtons() {
  el.modeEasy.setAttribute("aria-pressed", MODE === "easy" ? "true" : "false");
  el.modeNormal.setAttribute("aria-pressed", MODE === "normal" ? "true" : "false");
  el.modeHard.setAttribute("aria-pressed", MODE === "hard" ? "true" : "false");
  const locked = modeLocked();
  for (const b of [el.modeEasy, el.modeNormal, el.modeHard]) {
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

el.modeEasy.addEventListener("click", () => setMode("easy"));
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
    localStorage.removeItem(STORE_PREFIX + el.date.textContent);
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
    if (!out[date]) out[date] = { source };
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
    if (/^[a-z]+$/.test(source)) out[date] = { source };
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
  const total = {};
  for (const w of puzzle.words) total[w.length] = (total[w.length] || 0) + 1;
  const foundByLen = {};
  for (const w of found) foundByLen[w.length] = (foundByLen[w.length] || 0) + 1;
  const lengths = Object.keys(total).map(Number).sort((a, b) => a - b);
  for (const n of lengths) {
    const goalN = ten ? Math.min(CORE_CAP, total[n]) : total[n];
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

// Words left toward the goal, and words left by length (MIN_LENGTH up to the longest word).
// "all": every valid word counts. "ten": each length counts up to CORE_CAP.
function progress(puzzle, play) {
  const total = {};
  for (const w of puzzle.words) total[w.length] = (total[w.length] || 0) + 1;
  const found = {};
  for (const w of play.found) found[w.length] = (found[w.length] || 0) + 1;

  const lengths = Object.keys(total).map(Number);
  const max = lengths.length ? Math.max(...lengths) : 0;
  const cap = (n) => (GOAL === "ten" ? Math.min(CORE_CAP, n) : n);

  let remaining = 0;
  let goal = 0;
  const perLength = [];
  for (let n = MIN_LENGTH; n <= max; n++) {
    const goalN = cap(total[n] || 0);
    const foundN = Math.min(found[n] || 0, goalN);
    const left = goalN - foundN;
    remaining += left;
    goal += goalN;
    perLength.push(`${n} (${left})`);
  }
  return { remaining, goal, text: perLength.join(", ") };
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
    `Bonus: all letters, perfect reuse (each source letter used at full count), every word of a length, all words (worth ${pointsForLength(puzzle.source.length)}).`;

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

    const ul = document.createElement("ul");
    for (const w of words) {
      const li = document.createElement("li");
      li.textContent = w;
      if (found.has(w)) li.className = "got";
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
  const total = {};
  for (const w of puzzle.words) total[w.length] = (total[w.length] || 0) + 1;
  const found = {};
  for (const w of play.found) found[w.length] = (found[w.length] || 0) + 1;
  const lengths = Object.keys(total).map(Number);
  const max = lengths.length ? Math.max(...lengths) : 0;
  const rows = [];
  for (let n = MIN_LENGTH; n <= max; n++) {
    const goalN = GOAL === "ten" ? Math.min(CORE_CAP, total[n] || 0) : total[n] || 0;
    if (goalN === 0) continue;
    const foundN = Math.min(found[n] || 0, goalN);
    const squares = Math.min(CORE_CAP, goalN);
    const filled = Math.round((foundN / goalN) * squares);
    rows.push(`${n}  ${"■".repeat(filled)}${"□".repeat(squares - filled)}  ${foundN}/${goalN}`);
  }
  return rows;
}

function shareTextFor(date, play) {
  const ten = play.goalMode === "ten";
  const modeName = play.mode && play.mode !== "normal" ? ` (${play.mode[0].toUpperCase()}${play.mode.slice(1)})` : "";
  return [
    `Sourceword ${date}${modeName}`,
    `Score ${play.score}, ${play.rank}`,
    `${play.goalFound} of ${play.goalTotal} ${ten ? "core words" : "words"}`,
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

  const today = loadPlay(date);
  el.shareBox.hidden = !today.done;
  el.shareNote.textContent = "";
  if (today.done) el.shareText.textContent = shareTextFor(date, today);
}

el.statsBtn.addEventListener("click", () => {
  const opening = el.stats.hidden;
  el.stats.hidden = !opening;
  if (opening) renderStats(el.date.textContent);
});

el.copyShare.addEventListener("click", async () => {
  const text = el.shareText.textContent;
  try {
    await navigator.clipboard.writeText(text);
    el.shareNote.textContent = "Copied.";
  } catch {
    const range = document.createRange();
    range.selectNodeContents(el.shareText);
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);
    el.shareNote.textContent = "Select and copy the text above.";
  }
});

function say(text, isBad = false) {
  el.message.textContent = text;
  el.message.classList.toggle("bad", isBad);
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

function render(puzzle, play) {
  current = { puzzle, play };
  const result = scorePlay(play.found, puzzle);

  el.found.innerHTML = "";
  const sorted = play.found.slice().sort((a, b) => a.length - b.length || a.localeCompare(b));
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
  return result;
}

function finish(date, puzzle, play) {
  play.done = true;
  const p = progress(puzzle, play);
  play.score = scorePlay(play.found, puzzle).total;
  play.rank = rankFor(p);
  play.goalMode = GOAL;
  play.goalTotal = p.goal;
  play.goalFound = p.goal - p.remaining;
  play.grid = gridRows(puzzle, play);
  savePlay(date, play);
  render(puzzle, play);
  say(`Done. ${play.found.length} of ${puzzle.words.length} found. Score ${play.score}.`);
  renderStats(date);
  el.stats.hidden = false;
}

function start(date, puzzle) {
  const play = loadPlay(date);
  if (!play.mode) play.mode = MODE;
  renderSource(puzzle.source, "");
  el.input.addEventListener("input", () => renderSource(puzzle.source, el.input.value));
  render(puzzle, play);

  if (play.done) {
    say("You've played today's puzzle. Come back tomorrow.");
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
    if (!puzzle.wordSet.has(word)) return say(`Not in the word list: ${word}.`, true);

    const before = new Set(scorePlay(play.found, puzzle).earned.map((s) => s.id));
    const coreBefore = progress(puzzle, play).remaining;
    play.found.push(word);
    savePlay(date, play);
    const result = render(puzzle, play);

    const earned = result.earned.filter((s) => !before.has(s.id));
    const bonusText = earned.map((s) => ` ${s.label} +${s.points}.`).join("");
    const coreText = GOAL === "ten" && coreBefore > 0 && progress(puzzle, play).remaining === 0
      ? " Core complete. Bonus words still count."
      : "";
    say(`${word}: +${pointsForLength(word.length)}.${bonusText}${coreText}`);

    if (play.found.length === puzzle.words.length) finish(date, puzzle, play);
  });

  el.finish.addEventListener("click", () => finish(date, puzzle, play));
  el.input.focus();
}

async function init() {
  const today = todayET();
  document.title = `Sourceword (${BUILD})`;
  el.date.textContent = today;
  try {
    const allWords = await loadWords();
    const entries = await loadEntries();
    const valid = {};
    for (const [date, e] of Object.entries(entries)) {
      const n = bandCount(e.source, allWords);
      if (n >= BAND_LOW && n <= BAND_HIGH) valid[date] = e;
      else console.warn(`Sourceword: ${date} (${e.source}) has ${n} valid words, outside ${BAND_LOW} to ${BAND_HIGH}; skipped.`);
    }
    const date = pickDate(valid, today);
    if (!date) {
      el.source.textContent = "none";
      el.input.disabled = true;
      el.button.disabled = true;
      el.finish.disabled = true;
      return say(`No puzzle for ${today}.`, true);
    }
    el.date.textContent = date;
    const puzzle = { source: valid[date].source };
    // Mode for the day: the locked one if the day has play, else the preference.
    const saved = loadPlay(date);
    const started = saved.done || (saved.found || []).length > 0;
    MODE = saved.mode || (started ? "normal" : PREF_MODE);
    MIN_LENGTH = MODES[MODE];
    syncModeButtons();
    puzzle.words = validWordsFor(puzzle.source, allWords);
    puzzle.wordSet = new Set(puzzle.words);
    start(date, puzzle);
  } catch (err) {
    say("Couldn't load today's puzzle.", true);
    console.error(err);
  }
}

init();
