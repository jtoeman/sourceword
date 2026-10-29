// Sourceword: apply reported words automatically.
//
// When a row in the "Sourceword suggestions" tab gets Status "added":
//   1. Every row with the same word is set to "added" too. Rows are never deleted.
//   2. The word is added to words.json and common.json in jtoeman/sourceword (main).
//      Committing to main triggers the publish workflow, which rebuilds the site.
//   3. Each action is written to the "Applied log" tab.
//
// Setup (once):
//   a. Open the spreadsheet that holds the suggestions tab. Extensions > Apps Script.
//      Paste this file in as its own file (or into a new project bound to the sheet).
//   b. Project Settings > Script Properties > Add: GITHUB_TOKEN = your fine-grained token
//      (Contents: read and write on jtoeman/sourceword).
//   c. Run installTrigger() once from the editor and approve the permissions.
//      This installs the "on edit" trigger. Simple onEdit() can't call GitHub, so it has to be this one.

var SUGGESTIONS_TAB = 'Sourceword suggestions';
var LOG_TAB = 'Applied log';
var REPO = 'jtoeman/sourceword';
var BRANCH = 'main';
var WORD_RE = /^[a-z]{3,}$/;

// Run once. Creates the installable on-edit trigger for this spreadsheet.
function installTrigger() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'onEditInstalled') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('onEditInstalled').forSpreadsheet(SpreadsheetApp.getActive()).onEdit().create();
}

function onEditInstalled(e) {
  var range = e.range;
  var sheet = range.getSheet();
  if (sheet.getName() !== SUGGESTIONS_TAB || range.getRow() === 1) return;

  var headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0]
    .map(function (h) { return String(h).trim().toLowerCase(); });
  var statusCol = headers.indexOf('status') + 1;
  var wordCol = headers.indexOf('word') + 1;
  if (statusCol === 0 || wordCol === 0) return;
  if (range.getColumn() !== statusCol || range.getNumColumns() !== 1) return;
  if (normalize(range.getValue()) !== 'added') return;

  var word = normalize(sheet.getRange(range.getRow(), wordCol).getValue());

  var lock = LockService.getScriptLock();
  lock.waitLock(60000);
  try {
    applyWord(word, sheet, wordCol, statusCol);
  } catch (err) {
    logRow(word, 0, 'error: ' + err.message);
  } finally {
    lock.releaseLock();
  }
}

function applyWord(word, sheet, wordCol, statusCol) {
  if (!WORD_RE.test(word)) {
    logRow(word, 0, 'rejected: not a plain word (lowercase a-z, 3+ letters)');
    return;
  }

  // Mark every row with this word as added. Setting values from code does not fire the trigger.
  var data = sheet.getDataRange().getValues();
  var rowsMarked = 0;
  for (var i = 1; i < data.length; i++) {
    if (normalize(data[i][wordCol - 1]) === word && normalize(data[i][statusCol - 1]) !== 'added') {
      data[i][statusCol - 1] = 'added';
      rowsMarked++;
    }
  }
  if (rowsMarked > 0) {
    sheet.getRange(1, statusCol, data.length, 1)
      .setValues(data.map(function (r) { return [r[statusCol - 1]]; }));
  }

  var wordsResult = addToList('words.json', word);
  var commonResult = addToList('common.json', word);
  logRow(word, rowsMarked, 'words.json: ' + wordsResult + ', common.json: ' + commonResult);
}

// Add word to the JSON array at path in the repo, if it isn't already there. Returns 'added' or 'present'.
function addToList(path, word) {
  for (var attempt = 0; attempt < 2; attempt++) {
    var current = githubGet(path);
    if (current.list.indexOf(word) !== -1) return 'present';
    var updated = current.list.concat([word]).sort();
    var res = githubPut(path, updated, current.sha, 'Add "' + word + '" to ' + path + ' (from suggestions)');
    if (res.code === 200 || res.code === 201) return 'added';
    if (res.code !== 409) throw new Error(path + ': GitHub returned ' + res.code + ' ' + res.body);
    // 409: someone else changed the file between read and write. Read it again and retry once.
  }
  throw new Error(path + ': could not update after a retry');
}

function githubGet(path) {
  var url = 'https://api.github.com/repos/' + REPO + '/contents/' + path + '?ref=' + BRANCH;
  var res = UrlFetchApp.fetch(url, { headers: githubHeaders_(), muteHttpExceptions: true });
  if (res.getResponseCode() !== 200) {
    throw new Error(path + ': GitHub returned ' + res.getResponseCode());
  }
  var body = JSON.parse(res.getContentText());
  var text = Utilities.newBlob(Utilities.base64Decode(body.content.replace(/\n/g, ''))).getDataAsString();
  return { sha: body.sha, list: JSON.parse(text) };
}

function githubPut(path, list, sha, message) {
  var url = 'https://api.github.com/repos/' + REPO + '/contents/' + path;
  var content = Utilities.base64Encode(JSON.stringify(list), Utilities.Charset.UTF_8);
  var res = UrlFetchApp.fetch(url, {
    method: 'put',
    headers: githubHeaders_(),
    contentType: 'application/json',
    payload: JSON.stringify({ message: message, content: content, sha: sha, branch: BRANCH }),
    muteHttpExceptions: true
  });
  return { code: res.getResponseCode(), body: res.getContentText() };
}

function githubHeaders_() {
  var token = PropertiesService.getScriptProperties().getProperty('GITHUB_TOKEN');
  if (!token) throw new Error('GITHUB_TOKEN is not set in Script Properties');
  return {
    Authorization: 'Bearer ' + token,
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28'
  };
}

function logRow(word, rowsMarked, result) {
  var ss = SpreadsheetApp.getActive();
  var tab = ss.getSheetByName(LOG_TAB);
  if (!tab) {
    tab = ss.insertSheet(LOG_TAB);
    tab.appendRow(['Time', 'Word', 'Rows marked added', 'Result']);
    tab.setFrozenRows(1);
  }
  tab.appendRow([new Date(), word, rowsMarked, result]);
}

function normalize(value) {
  return String(value).trim().toLowerCase();
}
