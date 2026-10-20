// Sourceword, build 0.1.10-b15
// Scoring: base by length (Boggle table: 4 = 1, 5 = 2, 6 = 3, 7 = 5, 8+ = 11), 4-letter minimum.
// Bonus slots, each worth the points of one word of that length:
//   - all letters: a valid word using every distinct source letter (one slot per such word)
//   - perfect reuse: an anagram of the source word (one slot per such word)
//   - length: every word of one length found ("all" goal) or that length's core found ("ten" goal)
//   - all words: every word found ("all" goal) or the core complete ("ten" goal), valued at the source length
// Goal: "all" counts every valid word. "ten" counts up to 10 words per length; extra words still score.
// One play per day, saved on-device. Puzzle loaded from puzzles.json by ET date.

const BUILD = "0.1.10-b15";
const STORE_PREFIX = "sourceword:play:";
const MIN_LENGTH = 4;
const CORE_CAP = 10;
// "normal" shows the countdown. "hard" hides it (Hard mode arrives in step 5).
const MODE = "normal";

// Goal toggle, remembered on this device.
const GOAL_KEY = "sourceword:goal";
let GOAL = "all";
try {
  if (localStorage.getItem(GOAL_KEY) === "ten") GOAL = "ten";
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
  lengths: document.getElementById("lengths"),
  reveal: document.getElementById("reveal"),
  reset: document.getElementById("reset"),
  adminToggle: document.getElementById("admin-toggle"),
  goalAll: document.getElementById("goal-all"),
  goalTen: document.getElementById("goal-ten"),
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

async function loadPuzzles() {
  if (window.PUZZLE_DATA) return window.PUZZLE_DATA;
  const res = await fetch("puzzles.json", { cache: "no-cache" });
  if (!res.ok) throw new Error(`puzzles.json: HTTP ${res.status}`);
  return res.json();
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
  const perLength = [];
  for (let n = MIN_LENGTH; n <= max; n++) {
    const goalN = cap(total[n] || 0);
    const foundN = Math.min(found[n] || 0, goalN);
    const left = goalN - foundN;
    remaining += left;
    perLength.push(`${n} (${left})`);
  }
  return { remaining, text: perLength.join(", ") };
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
  } else {
    const p = progress(puzzle, play);
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
  return result;
}

function finish(date, puzzle, play) {
  play.done = true;
  savePlay(date, play);
  const result = render(puzzle, play);
  say(`Done. ${play.found.length} of ${puzzle.words.length} found. Score ${result.total}.`);
}

function start(date, puzzle) {
  const play = loadPlay(date);
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
  const date = todayET();
  document.title = `Sourceword (${BUILD})`;
  el.date.textContent = date;
  try {
    const puzzles = await loadPuzzles();
    const puzzle = puzzles[date];
    if (!puzzle) {
      el.source.textContent = "none";
      el.input.disabled = true;
      el.button.disabled = true;
      el.finish.disabled = true;
      return say(`No puzzle for ${date}.`, true);
    }
    const allWords = await loadWords();
    puzzle.words = validWordsFor(puzzle.source, allWords);
    puzzle.wordSet = new Set(puzzle.words);
    start(date, puzzle);
  } catch (err) {
    say("Couldn't load today's puzzle.", true);
    console.error(err);
  }
}

init();
