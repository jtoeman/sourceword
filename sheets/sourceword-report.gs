// Word reports from the Sourceword game. This file goes in the same Apps Script project as
// sourceword-check.gs (Extensions > Apps Script on the froobaloodb sheet).
//
// Setup: Deploy > New deployment > type "Web app", Execute as "Me", Who has access "Anyone".
// Copy the web app URL into REPORT_URL in app.js. Re-deploy after any change here.
//
// Each report adds a row to the "Sourceword suggestions" tab with Status "new". Curate by
// setting Status to "added" or "rejected".

const REPORT_TAB = "Sourceword suggestions";
const REPORT_HEADERS = ["Reported at", "Date", "Source Word", "Word", "Mode", "Goal", "Status"];

function doPost(e) {
  try {
    const data = JSON.parse(e.postData.contents);
    const word = String(data.word || "").toLowerCase();
    const source = String(data.source || "").toLowerCase();
    const date = String(data.date || "");
    if (!/^[a-z]{4,15}$/.test(word) || !/^[a-z]{4,12}$/.test(source) || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return reply("bad input");
    }
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    let tab = ss.getSheetByName(REPORT_TAB);
    if (!tab) {
      tab = ss.insertSheet(REPORT_TAB);
      tab.appendRow(REPORT_HEADERS);
      tab.setFrozenRows(1);
    }
    tab.appendRow([new Date(), date, source, word, String(data.mode || ""), String(data.goal || ""), "new"]);
    return reply("ok");
  } catch (err) {
    return reply("error");
  }
}

function reply(text) {
  return ContentService.createTextOutput(text);
}
