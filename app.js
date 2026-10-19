// Sourceword, build 0.1.1-b2
// Scoring: 3-4 letters = 1, 5 = 2, 6 = 3, 7 = 5, 8+ = 11 (Boggle table).
// Step 2: puzzle loaded from puzzles.json by ET date; one play per day, saved on-device.

const BUILD = "0.1.1-b2";
const STORE_PREFIX = "sourceword:play:";

const el = {
  form: document.getElementById("guess-form"),
  input: document.getElementById("guess"),
  button: document.querySelector("#guess-form button"),
  message: document.getElementById("message"),
  score: document.getElementById("score"),
  count: document.getElementById("count"),
  found: document.getElementById("found"),
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

function pointsFor(word) {
  const n = word.length;
  if (n <= 4) return 1;
  if (n === 5) return 2;
  if (n === 6) return 3;
  if (n === 7) return 5;
  return 11;
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
  let total = 0;
  el.found.innerHTML = "";
  for (const w of play.found) {
    total += pointsFor(w);
    const li = document.createElement("li");
    li.textContent = w;
    el.found.appendChild(li);
  }
  el.score.textContent = total;
  el.count.textContent = play.found.length;

  const over = play.done;
  el.input.disabled = over;
  el.button.disabled = over;
  el.finish.disabled = over;
}

function finish(date, puzzle, play) {
  play.done = true;
  savePlay(date, play);
  render(puzzle, play);
  say(`Done. ${play.found.length} of ${puzzle.words.length} found.`);
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

    if (word.length < 3) return say("Too short.", true);
    if (!/^[a-z]+$/.test(word)) return say("Letters only.", true);
    if (word === puzzle.source) return say("That's the source word.", true);
    if (!fitsSource(word, puzzle.source)) return say("Uses a letter not in the source word.", true);
    if (play.found.includes(word)) return say(`Already found: ${word}.`, true);
    if (!puzzle.words.includes(word)) return say(`Not in the list: ${word}.`, true);

    play.found.push(word);
    savePlay(date, play);
    say(`${word}: +${pointsFor(word)}`);
    render(puzzle, play);

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
