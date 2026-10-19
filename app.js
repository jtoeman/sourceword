// Sourceword, build 0.1.4-b9
// Step 3: full scoring.
// Base: 4-letter minimum (Normal). Boggle table: 4 = 1, 5 = 2, 6 = 3, 7 = 5, 8+ = 11.
// Bonuses each equal one extra word of that length:
//   - all letters: word uses every distinct letter of the source word
//   - perfect reuse: word uses every letter the source word has, at full count (an anagram)
//   - length complete: every word of one length is found
//   - all words: every word in the list is found (valued at the source word's length)
// Step 2: puzzle loaded from puzzles.json by ET date; one play per day, saved on-device.

const BUILD = "0.1.4-b9";
const STORE_PREFIX = "sourceword:play:";
const MIN_LENGTH = 4;
// Test view: add #debug to the URL (or ?debug=1 on a plain host) to list every valid word. Remove before shipping.
const DEBUG = location.hash === "#debug" || new URLSearchParams(location.search).has("debug");

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
};

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

// Checking list (Wordnik, MIT): every guess must be in it.
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

// Scores a play from the found words alone, so bonuses are always derived, never stored.
function scorePlay(found, puzzle) {
  const source = puzzle.source;
  const srcCounts = letterCounts(source);
  const srcLetters = Object.keys(srcCounts);
  const bonuses = [];

  let base = 0;
  for (const w of found) {
    base += pointsForLength(w.length);

    const counts = letterCounts(w);
    if (srcLetters.every((ch) => counts[ch])) {
      bonuses.push({ label: `all letters: ${w}`, points: pointsForLength(w.length) });
    }
    if (srcLetters.length === Object.keys(counts).length && srcLetters.every((ch) => counts[ch] === srcCounts[ch])) {
      bonuses.push({ label: `perfect reuse: ${w}`, points: pointsForLength(w.length) });
    }
  }

  // Length complete: every list word of that length is found.
  const lengths = [...new Set(puzzle.words.map((w) => w.length))];
  for (const n of lengths) {
    const ofLength = puzzle.words.filter((w) => w.length === n);
    if (ofLength.every((w) => found.includes(w))) {
      bonuses.push({ label: `all ${n}-letter words`, points: pointsForLength(n) });
    }
  }

  // Valued at the length of the source word, the entire word.
  if (puzzle.words.length && found.length === puzzle.words.length) {
    bonuses.push({ label: "all words", points: pointsForLength(source.length) });
  }

  const bonusTotal = bonuses.reduce((sum, b) => sum + b.points, 0);
  return { base, bonuses, total: base + bonusTotal };
}

// Test view: every valid word grouped by length, found words highlighted.
function renderDebug(puzzle, play) {
  if (!DEBUG) return;
  el.debug.hidden = false;

  const found = new Set(play.found);
  const srcCounts = letterCounts(puzzle.source);
  const letters = Object.keys(srcCounts)
    .sort()
    .map((c) => (srcCounts[c] > 1 ? `${c} x${srcCounts[c]}` : c))
    .join(", ");
  el.debugSummary.textContent =
    `Build ${BUILD}. Source "${puzzle.source}" (letters: ${letters}). ` +
    `${puzzle.words.length} valid words, ${found.size} found. Minimum length ${MIN_LENGTH}. ` +
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
  const result = scorePlay(play.found, puzzle);

  el.found.innerHTML = "";
  const sorted = play.found.slice().sort((a, b) => a.length - b.length || a.localeCompare(b));
  for (const w of sorted) {
    const li = document.createElement("li");
    li.textContent = `${w} (+${pointsForLength(w.length)})`;
    el.found.appendChild(li);
  }

  el.bonuses.innerHTML = "";
  for (const b of result.bonuses) {
    const li = document.createElement("li");
    li.textContent = `${b.label} (+${b.points})`;
    el.bonuses.appendChild(li);
  }

  el.score.textContent = result.total;
  el.count.textContent = play.found.length;

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
  el.source.textContent = puzzle.source;
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

    if (word.length < MIN_LENGTH) return say(`Too short. ${MIN_LENGTH} letters minimum.`, true);
    if (!/^[a-z]+$/.test(word)) return say("Letters only.", true);
    if (word === puzzle.source) return say("That's the source word.", true);
    if (!fitsSource(word, puzzle.source)) return say("Uses a letter not in the source word.", true);
    if (play.found.includes(word)) return say(`Already found: ${word}.`, true);
    if (!puzzle.wordSet.has(word)) return say(`Not in the word list: ${word}.`, true);

    const before = scorePlay(play.found, puzzle).bonuses.map((b) => b.label);
    play.found.push(word);
    savePlay(date, play);
    const result = render(puzzle, play);

    const earned = result.bonuses.filter((b) => !before.includes(b.label));
    const bonusText = earned.map((b) => ` ${b.label} +${b.points}.`).join("");
    say(`${word}: +${pointsForLength(word.length)}.${bonusText}`);

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
