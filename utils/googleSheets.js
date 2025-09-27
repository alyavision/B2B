const { google } = require('googleapis');

function getSheetsClient() {
  const serviceAccountJson = process.env.GOOGLE_SERVICE_ACCOUNT;
  const spreadsheetId = process.env.GOOGLE_SHEETS_ID;
  if (!serviceAccountJson) throw new Error('GOOGLE_SERVICE_ACCOUNT is not set');
  if (!spreadsheetId) throw new Error('GOOGLE_SHEETS_ID is not set');

  const creds = JSON.parse(serviceAccountJson);
  const jwt = new google.auth.JWT(
    creds.client_email,
    undefined,
    creds.private_key,
    ['https://www.googleapis.com/auth/spreadsheets']
  );
  const sheets = google.sheets({ version: 'v4', auth: jwt });
  return { sheets, spreadsheetId };
}

async function ensureSheetExists(sheets, spreadsheetId, desiredTitle) {
  const meta = await sheets.spreadsheets.get({ spreadsheetId });
  const sheetsList = meta.data.sheets || [];
  if (!desiredTitle) {
    return sheetsList[0]?.properties?.title || 'Sheet1';
  }
  const found = sheetsList.find((s) => s.properties?.title === desiredTitle);
  if (found) return desiredTitle;
  await sheets.spreadsheets.batchUpdate({
    spreadsheetId,
    requestBody: {
      requests: [{ addSheet: { properties: { title: desiredTitle } } }],
    },
  });
  return desiredTitle;
}

async function appendLeadToSheet(lead) {
  const { sheets, spreadsheetId } = getSheetsClient();
  const desiredTitle = process.env.GOOGLE_SHEET_NAME || 'Leads';
  const title = await ensureSheetExists(sheets, spreadsheetId, desiredTitle);

  const values = [[
    new Date().toISOString(),
    lead.source || '',
    String(lead.userId || ''),
    lead.name || '',
    lead.contact || '',
    lead.company || '',
    lead.answers || '',
    lead.checklistSent ? 'yes' : 'no',
  ]];

  await sheets.spreadsheets.values.append({
    spreadsheetId,
    range: `${title}!A:Z`,
    valueInputOption: 'USER_ENTERED',
    requestBody: { values },
  });

  return { ok: true };
}

async function listAudienceUserIds() {
  const { sheets, spreadsheetId } = getSheetsClient();
  const title = process.env.GOOGLE_SHEET_NAME || 'Leads';
  const range = `${title}!C2:C`;
  const res = await sheets.spreadsheets.values.get({ spreadsheetId, range });
  const rows = res.data.values || [];
  const ids = new Set();
  for (const row of rows) {
    const v = row[0];
    const n = Number(v);
    if (Number.isFinite(n) && n > 0) ids.add(n);
  }
  return Array.from(ids);
}

async function getLeadByUserId(userId) {
  const { sheets, spreadsheetId } = getSheetsClient();
  const title = process.env.GOOGLE_SHEET_NAME || 'Leads';
  const res = await sheets.spreadsheets.values.get({ spreadsheetId, range: `${title}!A2:H` });
  const rows = res.data.values || [];
  // Найти последнюю запись с совпадающим userId (колонка C, индекс 2)
  for (let i = rows.length - 1; i >= 0; i -= 1) {
    const row = rows[i];
    if ((row[2] || '') === String(userId)) {
      return {
        timestamp: row[0] || '',
        source: row[1] || '',
        userId: row[2] || '',
        name: row[3] || '',
        contact: row[4] || '',
        company: row[5] || '',
        answers: row[6] || '',
        checklistSent: (row[7] || '') === 'yes',
      };
    }
  }
  return null;
}

module.exports = { appendLeadToSheet, listAudienceUserIds, getLeadByUserId };
