// Sourceword, build 0.1.0-b1
// Step 1: single hardcoded puzzle, guess check against a sample list, length scoring.
// Scoring: 3-4 letters = 1, 5 = 2, 6 = 3, 7 = 5, 8+ = 11 (Boggle table).

const BUILD = "0.1.0-b1";

const PUZZLE = {
  source: "dictionary",
  // Sample list for step 1 only. Replaced by the Scrabble list in a later step.
  words: ["action", "cairn", "corn", "corny", "dairy", "diction", "into", "nary", "tin", "tonic"],
};

const found = new Set();

const el = {
  form: document.getElementById("guess-form"),
  input: document.getElementById("guess"),
  message: document.getElementById("message"),
  score: document.getElementById("score"),
  count: document.getElementById("count"),
  found: document.getElementById("found"),
  source: document.getElementById("source"),
};

function letterCounts(word) {
  const counts = {};
  for (const ch of word) counts[ch] = (counts[ch] || 0) + 1;
  return counts;
}

function fitsSource(word) {
  const avail = letterCounts(PUZZLE.source);
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

function render() {
  let total = 0;
  el.found.innerHTML = "";
  for (const w of found) {
    total += pointsFor(w);
    const li = document.createElement("li");
    li.textContent = w;
    el.found.appendChild(li);
  }
  el.score.textContent = total;
  el.count.textContent = found.size;
}

el.form.addEventListener("submit", (e) => {
  e.preventDefault();
  const word = el.input.value.trim().toLowerCase();
  el.input.value = "";

  if (word.length < 3) return say("Too short.", true);
  if (!/^[a-z]+$/.test(word)) return say("Letters only.", true);
  if (word === PUZZLE.source) return say("That's the source word.", true);
  if (!fitsSource(word)) return say("Uses a letter not in the source word.", true);
  if (found.has(word)) return say(`Already found: ${word}.`, true);
  if (!PUZZLE.words.includes(word)) return say(`Not in the list: ${word}.`, true);

  found.add(word);
  say(`${word}: +${pointsFor(word)}`);
  render();
});

el.source.textContent = PUZZLE.source;
document.title = `Sourceword (${BUILD})`;
render();
