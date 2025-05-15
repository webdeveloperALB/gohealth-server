import { google } from 'googleapis';
import dotenv from 'dotenv';

dotenv.config();

// Google Sheets API Configuration
const SCOPES = ['https://www.googleapis.com/auth/spreadsheets'];

// Create auth client from environment variables
const auth = new google.auth.JWT(
  process.env.GOOGLE_CLIENT_EMAIL,
  null,
  process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
  SCOPES
);

// Create Google sheets instance
const sheets = google.sheets({ version: 'v4', auth });

async function setupSheet() {
  try {
    // First, check if the spreadsheet exists
    const spreadsheetId = process.env.SPREADSHEET_ID;
    
    // If you don't have a spreadsheet yet, uncomment this to create one:
    /*
    const createResponse = await sheets.spreadsheets.create({
      resource: {
        properties: {
          title: 'Go Health Form Submissions',
        },
        sheets: [
          {
            properties: {
              title: 'FormSubmissions',
            }
          }
        ]
      }
    });
    
    const spreadsheetId = createResponse.data.spreadsheetId;
    console.log(`Created new spreadsheet with ID: ${spreadsheetId}`);
    console.log(`Make sure to update your SPREADSHEET_ID env variable to: ${spreadsheetId}`);
    */
    
    // Define the column headers for our unified form
    const headers = [
      'Timestamp',
      'Form Type',           // To identify which form was submitted
      'Full Name',           // Combined or from name field
      'First Name',          // From checkup form
      'Last Name',           // From checkup form
      'Email',
      'Phone',               // Primary phone field
      'Mobile',              // Secondary phone field
      'Department',          // From dental form
      'Treatment',           // From dental form
      'Service',             // Service requested
      'Date',                // Appointment date
      'Time',                // Appointment time
      'Age',                 // From checkup form
      'Address',             // From checkup form
      'Branch',              // From checkup form
      'Message'              // Additional notes
    ];
    
    // Update the headers in the spreadsheet
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: 'FormSubmissions!A1:Q1',
      valueInputOption: 'RAW',
      resource: {
        values: [headers]
      }
    });
    
    // Format the header row to make it stand out
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId,
      resource: {
        requests: [
          {
            repeatCell: {
              range: {
                sheetId: 0,
                startRowIndex: 0,
                endRowIndex: 1,
                startColumnIndex: 0,
                endColumnIndex: headers.length
              },
              cell: {
                userEnteredFormat: {
                  backgroundColor: {
                    red: 0.2,
                    green: 0.5,
                    blue: 0.9
                  },
                  textFormat: {
                    bold: true,
                    foregroundColor: {
                      red: 1.0,
                      green: 1.0,
                      blue: 1.0
                    }
                  }
                }
              },
              fields: 'userEnteredFormat(backgroundColor,textFormat)'
            }
          },
          {
            updateSheetProperties: {
              properties: {
                sheetId: 0,
                gridProperties: {
                  frozenRowCount: 1
                }
              },
              fields: 'gridProperties.frozenRowCount'
            }
          }
        ]
      }
    });
    
    // Auto-resize columns to fit content
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId,
      resource: {
        requests: [
          {
            autoResizeDimensions: {
              dimensions: {
                sheetId: 0,
                dimension: 'COLUMNS',
                startIndex: 0,
                endIndex: headers.length
              }
            }
          }
        ]
      }
    });
    
    console.log('✅ Sheet headers set up successfully!');
    
    // Add a test row to verify everything works
    const testRow = [
      new Date().toISOString(),
      'TEST',
      'Test User',
      'Test',
      'User',
      'test@example.com',
      '+1234567890',
      '',
      'Dental',
      'Cleaning',
      'Regular Checkup',
      '2023-05-15',
      '10:00',
      '35',
      '123 Test St',
      'Tirana',
      'This is a test submission'
    ];
    
    await sheets.spreadsheets.values.append({
      spreadsheetId,
      range: 'FormSubmissions!A2:Q2',
      valueInputOption: 'RAW',
      resource: {
        values: [testRow]
      }
    });
    
    console.log('✅ Test row added successfully!');
    
  } catch (error) {
    console.error('Error setting up sheet:', error);
    if (error.response) {
      console.error('Response error data:', error.response.data);
    }
  }
}

// Run the setup
auth.authorize((err) => {
  if (err) {
    console.error('❌ Authentication failed:', err);
  } else {
    console.log('✅ Authentication successful!');
    setupSheet();
  }
});