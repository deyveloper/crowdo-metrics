const fs = require('fs');
const readline = require('readline');
const {google} = require('googleapis');

const SCOPES = ['https://www.googleapis.com/auth/spreadsheets'];
const TOKEN_PATH = 'token.json';
const BASE_SHEET = '1uhN17aiAGn6POEUmFDLDMx1ldVDXP2dd9WHbFTbR9GA';
const sheetId = process.argv[2];
const mode = process.argv[3];

fs.readFile('credentials.json', (err, content) => {
  if (err) return console.log('Error loading client secret file:', err);
  authorize(JSON.parse(content), listMajors);
});

function authorize(credentials, callback) {
  const {client_secret, client_id, redirect_uris} = credentials.installed;
  const oAuth2Client = new google.auth.OAuth2(
      client_id, client_secret, redirect_uris[0]);

  fs.readFile(TOKEN_PATH, (err, token) => {
    if (err) return getNewToken(oAuth2Client, callback);
    oAuth2Client.setCredentials(JSON.parse(token));
    callback(oAuth2Client);
  });
}

function getNewToken(oAuth2Client, callback) {
  const authUrl = oAuth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: SCOPES,
  });
  console.log('Authorize this app by visiting this url:', authUrl);
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  rl.question('Enter the code from that page here: ', (code) => {
    rl.close();
    oAuth2Client.getToken(code, (err, token) => {
      if (err) return console.error('Error while trying to retrieve access token', err);
      oAuth2Client.setCredentials(token);
      fs.writeFile(TOKEN_PATH, JSON.stringify(token), (err) => {
        if (err) return console.error(err);
        console.log('Token stored to', TOKEN_PATH);
      });
      callback(oAuth2Client);
    });
  });
}

async function listMajors(auth) {
  const sheets = google.sheets({version: 'v4', auth});
  console.time(`${mode} result`);
  switch (mode.toLowerCase()) {
      case 'sync':
        await new Promise(async (resolve) => {
            await sheets.spreadsheets.values.get({
                spreadsheetId: BASE_SHEET,
                range: 'Sheet1!A:F',
            }, async (err, res) => {
                if (err) return console.error('The API returned an error: ' + err);
                let values = res.data.values;
                if (!values) return resolve(console.info('Not finded data.'));
                const nullsArray = [];
                nullsArray.length = 5;
                nullsArray.fill(null);
                const toSave = {};
                const valuesLength = values.length;
                for (let i = 0; i < valuesLength; i++) {
                    const e = values[i];
                    let withoutProtocol;
                    try {
                        withoutProtocol = e[0].split('/')[2];
                        if (withoutProtocol.startsWith('www.'))
                            withoutProtocol = withoutProtocol.replace('www.', '');
                    } catch (error) {
                        console.log(`Problematic row [index]: ${i}`);
                    }
                    toSave[withoutProtocol] = [...e.slice(1, 6)];
                }
                await fs.writeFile('forums.json', JSON.stringify(toSave), (err, res) => err ? console.error(err) : null);
                resolve()
            });
        });
        break;
    case 'rewrite':
        await new Promise(async (resolve) => {
            let forums;
            try {
                forums = JSON.parse(await new Promise(async(resolve, reject) => {
                    await fs.readFile('forums.json', (err, res) => {
                        if (err) {
                            reject(err);
                        }
                        resolve(res);
                    }); 
                }));
            } catch (error) {
                console.log(error);
                return resolve(console.info(`You need sync in first!`));
            }

            await sheets.spreadsheets.values.get({
                spreadsheetId: sheetId,
                range: 'A11:I',
            }, async (err, res) => {
                let values = res.data.values;
                if (!values) return resolve(console.info('Not finded data.'));
                const valuesLength = values.length;
                for (let i = 0; i < valuesLength; i++) {
                    const _e = values[i];
                    try {
                        e = _e[1];
                        withoutProtocol = e.split('/')[2];
                        if (withoutProtocol.startsWith('www.'))
                            withoutProtocol = withoutProtocol.replace('www.', '');
                        const forumParams = forums[withoutProtocol];
                        if (forumParams) {
                            values[i][4] = forumParams[0];
                            values[i][5] = forumParams[1];
                            values[i][6] = forumParams[2];
                            values[i][7] = forumParams[3];
                            values[i][8] = forumParams[4];
                        }
                    } catch (error) {
                        console.log(`Problematic row [index]: ${i}`);
                    }
                }
                const batchData = [{
                    range: 'A11:I',
                    majorDimension: 'ROWS',
                    values
                }];
                const response = await sheets.spreadsheets.values.batchUpdate({
                    spreadsheetId: sheetId,
                    resource: {
                        valueInputOption: 'RAW',
                        data: batchData
                    }
                });
                resolve();
            });
        });
        break;
    default:
        console.info('Incorrect mode!');
        break;
  }
  console.timeEnd(`${mode} result`);
}

async function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}