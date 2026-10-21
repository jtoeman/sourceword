// Sourceword sheet checker. Paste into Extensions > Apps Script of the froobaloodb sheet.
// For each row on the Sourceword tab, when a Source Word (column B) is entered or pasted,
// it fills: Valid Words (C) = count, Subwords (F) = comma-separated list, Band (G).
// Rules match tools/check_source.py: 4+ letters, letters within the source word, source word excluded.

const TAB = 'Sourceword';
const WORDS_URL = 'https://raw.githubusercontent.com/jtoeman/sourceword/site/words.json';
const BLOCKED_URL = 'https://raw.githubusercontent.com/jtoeman/sourceword/site/blocked.json';
const MIN_LENGTH = 4;
const LOW = 15;
const HIGH = 50;

let wordCache_ = null;

function loadWords_() {
  if (!wordCache_) {
    const res = UrlFetchApp.fetch(WORDS_URL, { muteHttpExceptions: true });
    if (res.getResponseCode() !== 200) throw new Error('words.json: HTTP ' + res.getResponseCode());
    const blockedRes = UrlFetchApp.fetch(BLOCKED_URL, { muteHttpExceptions: true });
    const blocked = blockedRes.getResponseCode() === 200 ? JSON.parse(blockedRes.getContentText()) : [];
    const blockedSet = {};
    blocked.forEach(function (w) { blockedSet[String(w).toLowerCase()] = true; });
    wordCache_ = JSON.parse(res.getContentText()).filter(function (w) { return !blockedSet[w]; });
  }
  return wordCache_;
}

function countsOf_(s) {
  const c = {};
  for (const ch of s) c[ch] = (c[ch] || 0) + 1;
  return c;
}

function subwordsOf_(source, words) {
  const avail = countsOf_(source);
  const out = [];
  for (const w of words) {
    if (w.length < MIN_LENGTH || w === source) continue;
    const need = countsOf_(w);
    let ok = true;
    for (const ch in need) {
      if (need[ch] > (avail[ch] || 0)) { ok = false; break; }
    }
    if (ok) out.push(w);
  }
  return out.sort();
}

function bandOf_(n) {
  if (n < LOW) return 'TOO FEW';
  if (n > HIGH) return 'TOO MANY';
  return 'OK';
}

function checkRow_(sheet, row) {
  const raw = String(sheet.getRange(row, 2).getValue()).trim().toLowerCase();
  if (raw === '') {
    sheet.getRange(row, 3, 1, 1).clearContent();
    sheet.getRange(row, 6, 1, 2).clearContent();
    return;
  }
  if (!/^[a-z]+$/.test(raw)) {
    sheet.getRange(row, 3).setValue('');
    sheet.getRange(row, 6).setValue('');
    sheet.getRange(row, 7).setValue('CHECK WORD (letters only)');
    return;
  }
  const words = subwordsOf_(raw, loadWords_());
  sheet.getRange(row, 3).setValue(words.length);
  sheet.getRange(row, 6).setValue(words.join(', '));
  sheet.getRange(row, 7).setValue(bandOf_(words.length));
}

// Runs when a cell in column B is edited or pasted (installable trigger, see setupTrigger).
function onSourceEdit(e) {
  const range = e.range;
  if (range.getSheet().getName() !== TAB) return;
  if (range.getColumn() > 2 || range.getLastColumn() < 2) return;
  const sheet = range.getSheet();
  for (let r = range.getRow(); r <= range.getLastRow(); r++) {
    if (r >= 2) checkRow_(sheet, r);
  }
}

// Recomputes every row on the tab. Use after changing the thresholds or the word list.
function checkAll() {
  const sheet = SpreadsheetApp.getActive().getSheetByName(TAB);
  const last = sheet.getLastRow();
  for (let r = 2; r <= last; r++) checkRow_(sheet, r);
}

// Run once: installs the edit trigger, adds the Subwords and Band headers, fills every row.
function setupTrigger() {
  ScriptApp.getProjectTriggers().forEach((t) => {
    if (t.getHandlerFunction() === 'onSourceEdit') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('onSourceEdit').forSpreadsheet(SpreadsheetApp.getActive()).onEdit().create();
  const sheet = SpreadsheetApp.getActive().getSheetByName(TAB);
  if (sheet.getRange('F1').getValue() === '') sheet.getRange('F1').setValue('Subwords');
  if (sheet.getRange('G1').getValue() === '') sheet.getRange('G1').setValue('Band');
  checkAll();
}

function onOpen() {
  SpreadsheetApp.getUi().createMenu('Sourceword').addItem('Check all rows', 'checkAll').addToUi();
}
