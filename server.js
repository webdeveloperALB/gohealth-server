const express = require('express');
const cors = require('cors');
const nodemailer = require('nodemailer');
const { google } = require('googleapis');
const dotenv = require('dotenv');
const axios = require('axios');
const fs = require('fs');

// Load environment variables
dotenv.config();

const app = express();

// Improved CORS configuration
const allowedOrigins = [
  'https://lp.gohealthalbania.com',
  'http://localhost:3000',
  // Add any other domains that need access
];

app.use(cors({
  origin: function(origin, callback) {
    // Allow requests with no origin (like mobile apps or curl requests)
    if (!origin) return callback(null, true);
    
    if (allowedOrigins.indexOf(origin) !== -1) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true,
  preflightContinue: false,
  optionsSuccessStatus: 204
}));

// Handle OPTIONS requests
app.options('*', cors());

app.use(express.json());

// Email transporter configuration
const transporter = nodemailer.createTransport({
  host: "gohealthalbania.com",
  port: 465,
  secure: true,
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

// Google Sheets API Configuration
const SCOPES = ['https://www.googleapis.com/auth/spreadsheets'];

// FIXED: Private key handling (remove potential double encoding issues)
function getPrivateKey() {
  const rawKey = process.env.GOOGLE_PRIVATE_KEY;
  
  // Check if the key is already properly formatted with BEGIN/END markers
  if (rawKey && rawKey.includes('-----BEGIN PRIVATE KEY-----')) {
    return rawKey.replace(/\\n/g, '\n');
  }
  
  // If we have newlines already, just return the key
  if (rawKey && rawKey.includes('\n')) {
    return rawKey;
  }
  
  // Try to fix a key that's been flattened (common issue in environment variables)
  if (rawKey) {
    return `-----BEGIN PRIVATE KEY-----\n${rawKey}\n-----END PRIVATE KEY-----`.replace(/\\n/g, '\n');
  }
  
  console.error("No private key found in environment variables!");
  return null;
}

// Initialize Google API auth
let auth;
let sheets;

try {
  const secretPath = '/etc/secrets/service-account.json';
  
  if (fs.existsSync(secretPath)) {
    console.log("Using service account from secret file");
    const credentials = JSON.parse(fs.readFileSync(secretPath, 'utf8'));
    auth = new google.auth.JWT(
      credentials.client_email,
      null,
      credentials.private_key,
      SCOPES
    );
  } else {
    console.log("Using service account from environment variables");
    
    // FIXED: Log auth details for debugging (without exposing full key)
    const privateKey = getPrivateKey();
    const clientEmail = process.env.GOOGLE_CLIENT_EMAIL;
    
    console.log(`Client email: ${clientEmail}`);
    console.log(`Private key available: ${privateKey ? 'Yes' : 'No'}`);
    
    if (!privateKey || !clientEmail) {
      throw new Error("Missing Google API credentials");
    }
    
    auth = new google.auth.JWT(
      clientEmail,
      null,
      privateKey,
      SCOPES
    );
  }
  
  // Create Google sheets instance
  sheets = google.sheets({ version: 'v4', auth });
  
} catch (error) {
  console.error("Error setting up authentication:", error);
  // Don't create a dummy auth object - better to fail fast
}

// FIXED: Better error handling for Google Sheets operations
async function appendToSheet(data, formType) {
  if (!sheets) {
    console.error("Google Sheets API not initialized");
    return false;
  }
  
  try {
    console.log("Attempting to append data to Google Sheet...");
    
    const formattedDate = data.date || data.selectedDate 
      ? new Date(data.date || data.selectedDate).toLocaleDateString("it-IT") 
      : "";
      
    const formattedTime = data.time || data.selectedTime
      ? new Date(data.time || data.selectedTime).toLocaleTimeString("it-IT", {
          hour: "2-digit",
          minute: "2-digit",
        }) 
      : "";
    
    // Determine the full name based on available fields
    let fullName = '';
    if (data.name) {
      fullName = data.name;
    } else if (data.firstName || data.lastName) {
      fullName = `${data.firstName || ''} ${data.lastName || ''}`.trim();
    }

    // Format data for sheets - unified structure for both forms
    const values = [
      [
        new Date().toISOString(),                // Timestamp
        formType || "UNKNOWN",                   // Form Type (DENTAL or CHECKUP)
        fullName,                                // Full Name
        data.firstName || '',                    // First Name
        data.lastName || '',                     // Last Name
        data.email || '',                        // Email
        data.phone || '',                        // Phone
        data.mobile || '',                       // Mobile
        data.department || '',                   // Department
        data.treatment || '',                    // Treatment
        data.service || '',                      // Service
        formattedDate,                           // Date
        formattedTime,                           // Time
        data.age || '',                          // Age
        data.address || '',                      // Address
        data.branch || '',                       // Branch
        data.message || ''                       // Message
      ]
    ];

    const resource = {
      values,
    };

    const spreadsheetId = process.env.SPREADSHEET_ID;
    const sheetName = process.env.SHEET_NAME || "FormSubmissions";
    
    if (!spreadsheetId) {
      throw new Error("SPREADSHEET_ID is not defined in environment variables");
    }
    
    console.log(`Attempting to append to spreadsheet: ${spreadsheetId}, sheet: ${sheetName}`);
    
    // FIXED: More robust error handling for Google Sheets API calls
    try {
      const result = await sheets.spreadsheets.values.append({
        spreadsheetId,
        range: `${sheetName}!A:Q`,
        valueInputOption: 'RAW',
        resource,
      });

      console.log(`${result.data.updates.updatedCells} cells appended to Google Sheet`);
      return true;
    } catch (apiError) {
      // Log detailed error info from Google API
      console.error("Google Sheets API error:", apiError.message);
      
      if (apiError.response && apiError.response.data) {
        console.error("API Error Details:", apiError.response.data);
      }
      
      // Check for common permission issues
      if (apiError.message.includes("insufficient")) {
        console.error("PERMISSION ERROR: The service account doesn't have permission to access this spreadsheet.");
        console.error("Make sure to share the spreadsheet with the service account email:", process.env.GOOGLE_CLIENT_EMAIL);
      }
      
      return false;
    }
  } catch (error) {
    console.error('Error preparing data for Google Sheet:', error);
    return false;
  }
}

// Improved reCAPTCHA verification function with better error handling
async function verifyCaptcha(token) {
  try {
    // Form data for reCAPTCHA verification
    const params = new URLSearchParams();
    params.append("secret", process.env.RECAPTCHA_SECRET_KEY);
    params.append("response", token);

    const response = await axios.post(
      "https://www.google.com/recaptcha/api/siteverify",
      params.toString(),
      {
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
      }
    );

    if (response.data.success) {
      console.log("reCAPTCHA verification successful");
      return true;
    } else {
      console.error(
        "reCAPTCHA verification failed:",
        response.data["error-codes"]
      );
      return false;
    }
  } catch (error) {
    console.error("reCAPTCHA verification error:", error.message);
    return false;
  }
}

// Unified endpoint for both forms
app.post("/send-email", async (req, res) => {
  try {
    console.log("Received form submission");
    
    // Extract all possible fields from both forms
    const {
      // Common fields
      email,
      service,
      recaptchaToken,
      website = "", // Honeypot field
      
      // Dental form specific fields
      name,
      phone,
      date,
      time,
      department = "",
      treatment = "",
      
      // Checkup form specific fields
      firstName = "",
      lastName = "",
      age = "",
      mobile = "",
      address = "",
      branch = "",
      message = "",
      selectedDate,
      selectedTime
    } = req.body;

    // Check honeypot - if filled, silently return success but don't send email
    if (website !== "") {
      console.log("Spam submission detected via honeypot! Request blocked.");
      // Return 200 to fool the bot into thinking submission was successful
      return res.status(200).json({ message: "Email inviata con successo!" });
    }

    // Verify reCAPTCHA
    if (!recaptchaToken) {
      return res.status(400).json({ message: "reCAPTCHA token is required" });
    }

    const isCaptchaValid = await verifyCaptcha(recaptchaToken);
    if (!isCaptchaValid) {
      return res
        .status(400)
        .json({ message: "reCAPTCHA verification failed. Please try again." });
    }
    
    // Determine which form was submitted
    // If firstName or lastName is present, it's likely the checkup form
    // If department or treatment is present, it's likely the dental form
    const formType = (firstName || lastName) ? "CHECKUP" : "DENTAL";
    console.log(`Form type detected: ${formType}`);
    
    // Format date and time based on which form fields are present
    const formattedDate = date || selectedDate
      ? new Date(date || selectedDate).toLocaleDateString("it-IT")
      : "";
      
    const formattedTime = time || selectedTime
      ? new Date(time || selectedTime).toLocaleTimeString("it-IT", {
          hour: "2-digit",
          minute: "2-digit",
        })
      : "";
    
    // Determine the full name based on available fields
    let fullName = '';
    if (name) {
      fullName = name;
    } else if (firstName || lastName) {
      fullName = `${firstName || ''} ${lastName || ''}`.trim();
    }

    // Contact information handling - unified for both forms
    const mailOptions = {
      from: `"Website Form" <${process.env.EMAIL_USER}>`,
      to: "clinic@gohealthalbania.com",
      subject: `Nuova Prenotazione - ${formType}`,
      html: `
        <h3>Nuova Prenotazione - ${formType}</h3>
        ${department ? `<p><strong>Reparto:</strong> ${department}</p>` : ""}
        ${treatment ? `<p><strong>Trattamento:</strong> ${treatment}</p>` : ""}
        ${service ? `<p><strong>Servizio Richiesto:</strong> ${service}</p>` : ""}
        
        <p><strong>Nome:</strong> ${fullName}</p>
        
        ${email ? `<p><strong>Email:</strong> ${email}</p>` : ""}
        ${phone ? `<p><strong>Telefono:</strong> ${phone}</p>` : ""}
        ${mobile ? `<p><strong>Cellulare:</strong> ${mobile}</p>` : ""}
        ${formattedDate ? `<p><strong>Data:</strong> ${formattedDate}</p>` : ""}
        ${formattedTime ? `<p><strong>Ora:</strong> ${formattedTime}</p>` : ""}
        
        <!-- Additional fields -->
        ${age ? `<p><strong>Età:</strong> ${age}</p>` : ""}
        ${address ? `<p><strong>Indirizzo:</strong> ${address}</p>` : ""}
        ${branch ? `<p><strong>Filiale:</strong> ${branch}</p>` : ""}
        ${message ? `<p><strong>Messaggio:</strong> ${message}</p>` : ""}
      `,
    };

    // Store data in Google Sheets
    const formData = {
      name,
      firstName,
      lastName,
      email,
      phone,
      mobile,
      service,
      date: date || selectedDate,
      time: time || selectedTime,
      department,
      treatment,
      age,
      address,
      branch,
      message
    };
    
    console.log("Attempting to save data and send email...");
    
    // Save to Google Sheets in parallel with email sending
    const [sheetResult, emailResult] = await Promise.allSettled([
      appendToSheet(formData, formType),
      transporter.sendMail(mailOptions)
    ]);
    
    // Log any errors but don't fail the request if only one operation fails
    if (sheetResult.status === 'rejected') {
      console.error("Failed to save to Google Sheets:", sheetResult.reason);
    } else if (sheetResult.value === false) {
      console.error("Failed to save to Google Sheets - check previous logs for details");
    }
    
    if (emailResult.status === 'rejected') {
      console.error("Failed to send email:", emailResult.reason);
      // Only fail the request if both operations fail
      if (sheetResult.status === 'rejected' || sheetResult.value === false) {
        throw new Error("Both email and sheet operations failed");
      }
    }

    res.status(200).json({ message: "Email inviata con successo!" });
  } catch (error) {
    console.error("Error processing request:", error);
    res.status(500).json({ message: "Errore durante l'elaborazione della richiesta" });
  }
});

// Health check endpoint
app.get("/health", (req, res) => {
  res.status(200).json({ 
    status: "ok",
    environment: process.env.NODE_ENV || 'development',
    googleAuth: auth ? "configured" : "not configured",
    emailTransport: transporter ? "configured" : "not configured",
    spreadsheetId: process.env.SPREADSHEET_ID || 'not configured',
    sheetName: process.env.SHEET_NAME || 'FormSubmissions'
  });
});

// Endpoint to manually test the Google Sheets connection
app.get("/test-sheets-connection", async (req, res) => {
  try {
    console.log("Testing Google Sheets connection...");
    console.log(`Using client email: ${process.env.GOOGLE_CLIENT_EMAIL}`);
    console.log(`Spreadsheet ID: ${process.env.SPREADSHEET_ID}`);
    
    // Test authentication first
    await auth.authorize();
    console.log("✅ Google authentication successful");
    
    // Test data
    const testData = {
      name: "Test User",
      email: "test@example.com",
      phone: "+1234567890",
      service: "Test Service",
      date: new Date().toISOString(),
      time: new Date().toISOString(),
      department: "Test Department",
      treatment: "Test Treatment"
    };
    
    // Attempt to append to sheet
    const result = await appendToSheet(testData, "TEST");
    
    if (result) {
      res.status(200).json({ 
        status: "success", 
        message: "Successfully connected to Google Sheets and appended test data" 
      });
    } else {
      res.status(500).json({ 
        status: "error", 
        message: "Failed to append data to Google Sheets. Check server logs for details." 
      });
    }
  } catch (error) {
    console.error("Error testing Google Sheets connection:", error);
    res.status(500).json({ 
      status: "error", 
      message: "Failed to connect to Google Sheets", 
      error: error.message,
      stack: error.stack
    });
  }
});

// FIXED: Add more diagnostic routes
app.get("/check-google-auth", async (req, res) => {
  try {
    if (!auth) {
      return res.status(500).json({
        status: "error",
        message: "Google auth not initialized"
      });
    }
    
    await auth.authorize();
    res.status(200).json({
      status: "success",
      message: "Google authentication successful",
      client_email: process.env.GOOGLE_CLIENT_EMAIL
    });
  } catch (error) {
    res.status(500).json({
      status: "error",
      message: "Google authentication failed",
      error: error.message
    });
  }
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  
  // Initialize Google Sheets connection
  if (auth) {
    auth.authorize()
      .then(() => {
        console.log("✅ Successfully connected to Google Sheets API");
      })
      .catch((err) => {
        console.error("❌ Error authenticating with Google:", err);
      });
  } else {
    console.error("❌ Google Auth was not initialized");
  }
});

module.exports = app;