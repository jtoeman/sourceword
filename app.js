// Sourceword, build 0.1.2-b3
// Step 3: full scoring.
// Base: 4-letter minimum (Normal). Boggle table: 4 = 1, 5 = 2, 6 = 3, 7 = 5, 8+ = 11.
// Bonuses each equal one extra word of that length:
//   - all letters: word uses every distinct letter of the source word
//   - perfect reuse: word uses every letter the source word has, at full count (an anagram)
//   - length complete: every word of one length is found
//   - all words: every word in the list is found (valued at the longest length)
// Step 2: puzzle loaded from puzzles.json by ET date; one play per day, saved on-device.

const BUILD = "0.1.2-b3";
const STORE_PREFIX = "sourceword:play:";
const MIN_LENGTH = 4;

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

  if (puzzle.words.length && found.length === puzzle.words.length) {
    const longest = Math.max(...puzzle.words.map((w) => w.length));
    bonuses.push({ label: "all words", points: pointsForLength(longest) });
  }

  const bonusTotal = bonuses.reduce((sum, b) => sum + b.points, 0);
  return { base, bonuses, total: base + bonusTotal };
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
  for (const w of play.found) {
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
    if (!puzzle.words.includes(word)) return say(`Not in the list: ${word}.`, true);

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
    start(date, puzzle);
  } catch (err) {
    say("Couldn't load today's puzzle.", true);
    console.error(err);
  }
}

init();
