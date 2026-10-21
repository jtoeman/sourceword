// Sourceword word reports. Add this to the Caseboard reminders Apps Script (caseboard-reminders.gs),
// the project bound to the froobaloodb sheet, so the existing web app URL handles them too.
//
// 1. In doPost, add this line directly under the movieleague_theme line (before the email check):
//      if (body.kind === 'sourceword_word') return saveWordReport_(body);
// 2. Paste the function below anywhere in the same file.
// 3. Deploy > Manage deployments > edit (pencil) > Version: New version > Deploy.
//    The web app URL stays the same, so no change is needed in the game.
//
// Each report adds a row to the "Sourceword suggestions" tab with Status "new".
// Curate by setting Status to "added" or "rejected".

var WORD_REPORT_TAB = 'Sourceword suggestions';

function saveWordReport_(body) {
  var word = String(body.word || '').toLowerCase();
  var source = String(body.source || '').toLowerCase();
  var date = String(body.date || '');
  if (!/^[a-z]{4,15}$/.test(word) || !/^[a-z]{4,12}$/.test(source) || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return ContentService.createTextOutput('bad word report');
  }
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var tab = ss.getSheetByName(WORD_REPORT_TAB);
  if (!tab) {
    tab = ss.insertSheet(WORD_REPORT_TAB);
    tab.appendRow(['Reported at', 'Date', 'Source Word', 'Word', 'Mode', 'Goal', 'Status']);
    tab.setFrozenRows(1);
  }
  tab.appendRow([new Date(), date, source, word, String(body.mode || ''), String(body.goal || ''), 'new']);
  return ContentService.createTextOutput('ok');
}
