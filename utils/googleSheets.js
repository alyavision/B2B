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

async function appendLeadToSheet(lead) {
  const { sheets, spreadsheetId } = getSheetsClient();
  const sheetName = process.env.GOOGLE_SHEET_NAME || 'Leads';
  const values = [[
    new Date().toISOString(),
    lead.source || '',
    lead.userId || '',
    lead.name || '',
    lead.contact || '',
    lead.company || '',
    lead.answers || '',
    lead.checklistSent ? 'yes' : 'no',
  ]];

  await sheets.spreadsheets.values.append({
    spreadsheetId,
    range: `${sheetName}!A:Z`,
    valueInputOption: 'USER_ENTERED',
    requestBody: { values },
  });

  return { ok: true };
}

module.exports = { appendLeadToSheet };
