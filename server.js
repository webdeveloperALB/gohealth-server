require("dotenv").config();
const express = require("express");
const cors = require("cors");
const nodemailer = require("nodemailer");
const axios = require("axios");
const { google } = require("googleapis");

const app = express();

// Improved CORS configuration
const allowedOrigins = [
  "https://lp.gohealthalbania.com",
  "http://localhost:3000",
  // Add any other domains that need access here
];

// Apply CORS middleware with more explicit configuration
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
  methods: ["GET", "POST", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
  credentials: true,
  preflightContinue: false,
  optionsSuccessStatus: 204
}));

// Make sure OPTIONS requests are handled correctly
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
// Load the service account credentials
const SCOPES = ['https://www.googleapis.com/auth/spreadsheets'];
const GOOGLE_PRIVATE_KEY = process.env.GOOGLE_PRIVATE_KEY || "-----BEGIN PRIVATE KEY-----\nMIIEvAIBADANBgkqhkiG9w0BAQEFAASCBKYwggSiAgEAAoIBAQDDweCBvtsLTkNy\nJk00gf2UONRydEziED7a9bretrZaYMHay9pTaL+syu46hm5Meg1vAKcf0ezrjpYO\nz+TfWQ3M3uHcch9M7aZtve9UpXYkn3f2hjH+g0zJ7CYNFIREgO8VmJqJ1o7EhSWl\njHh2g0es16QANCPvJ7OzkI6PGfCywwBsAt0AC1yGfNm384WwxdKec73XCOPGfELg\n15KeWYLxHAj0vLZG6Xi073ZFsBhHry3/rD8pNRy26pdebWoNeBA1PsjPxMnNh1Jk\n5ZEJHJvtSBo5BPJHCGKvisFVei5/IQytlfUH7RAO4IPhyVnkfDjPI+Xxl2tTYXep\nCBXH832/AgMBAAECggEANIS6xURdgvJ70M+qzegEDrSSdqRyDgJawqbDfEXbtXKY\n/6jKSa9kISkOceAoDld+bCXqMHTDEc1ev9mRp0Q+mhS/1sM9V4e4q1+WKoj7ocaw\nyhBlsEksnE3BRagX9kL7Ibmf2FQaWGn6WChQF0eQPrRZ2P4kF+D4arfhL04/z81d\n6tt0yAMqS4heFYYKwAVoyGZl2nOKnv06bSiwlSPHXMdaanvyRn4sTgOt97uCIaRW\nBvj2TdcY+8rmTZoX9ykKPa0FWSR+CMvnG8lf8US5MJr7tqPXyJJ0qoWzLH9ymDyK\nRIYjRTBQrhO1hY5KtopuQolIMeec4aq8w2JuuGmxfQKBgQDs/MN2IIPMqsRZA7tk\n8Ab4hX8ZqZdfJVwRa6pWHiPv+3MlPrJmDScaWg2gH2pyeeprTQICCizXWPPT6Hmd\nR49abl4EbexXqadArkoy7rV0/xiGwv56WBEavieeHBSe2RDdZcgwihbyQRgeZcZ8\nz40u2amFQ0+K9ZBBtHsqB/LjfQKBgQDTdlU5pKhAdcjFkvSLRb+IJlGrFqEqFogu\nc+apK92Ye/jSGI/jwyXD0CuAtLC86l1h73XMEPRMHCIFCeW2UWZ+qDffHoA3phBW\nNS8VAL700yy12YyCIklFlaPJwgDmUj88LCBxG/4OZMrxZskX2Ry3YB1HMN8gzCD6\ndiy4zpty6wKBgGFwY+Vz5P0H0YdP84LC9frE2MdyZVynfb1j6TtTVS9c0bEkoDE5\ngzRghm2pvRioa+wGU6cHC/zXBBnC4g362EQ0UM+9aol4pd4AS125rD4YjLsL/ZnM\nD+xQ9vUZUpklYrvFF5RtkpW0kfgdnIjAxanXsM2sKU5XPSLm1CUp84H5AoGAH+D/\nCCmik9Ut51s4MqbZMRVVyo0mzsmGzjn61BYg2hQWdtXtG1EYKGUBqe2Tl2ddnJ4V\nDCaiLbcwCcJsNwgeg4mooqJeggUvAVATQP9TymTroJ6jaBrzIOJmRsxQhmhv0Ap2\n+ZZWvqTDU5FDT60TfzGmOE1N1gvwDNIz+8hp9vECgYB/xpQr0H8F41hEPxgTwR8Y\nrTtDZoSK90uT52oBiwYT0eLLhBZNOQNUbyehJJPDS0QsvTc1QELS92WLCsYHvDs3\nqqHELBR79IqSkOKGXL8cF5e7eLsngfWI1/yTxUmILCmV8DZSVfZWh45Jox2i0wh0\nYeGv1UTIf8pSz2+Y9aWxkg==\n-----END PRIVATE KEY-----\n";
const GOOGLE_CLIENT_EMAIL = process.env.GOOGLE_CLIENT_EMAIL || "landing-page-gohealth-albania@gohealth-landingpage.iam.gserviceaccount.com";
const GOOGLE_PROJECT_ID = process.env.GOOGLE_PROJECT_ID || "gohealth-landingpage";

// Google Sheets document configuration
const SPREADSHEET_ID = process.env.SPREADSHEET_ID || "YOUR_SPREADSHEET_ID"; // Replace with your actual spreadsheet ID
const SHEET_NAME = process.env.SHEET_NAME || "FormSubmissions";

// Setup Google Auth
const auth = new google.auth.JWT(
  GOOGLE_CLIENT_EMAIL,
  null,
  GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n'),
  SCOPES
);

// Create Google sheets instance
const sheets = google.sheets({ version: 'v4', auth });

// Function to append data to Google Sheet
async function appendToSheet(data) {
  try {
    const formattedDate = data.date ? new Date(data.date).toLocaleDateString("it-IT") : "";
    const formattedTime = data.time ? new Date(data.time).toLocaleTimeString("it-IT", {
      hour: "2-digit",
      minute: "2-digit",
    }) : "";

    // Format data for sheets - adjust columns as needed
    const values = [
      [
        new Date().toISOString(), // Timestamp of submission
        data.name || `${data.firstName || ''} ${data.lastName || ''}`.trim(),
        data.email || '',
        data.phone || data.mobile || '',
        data.department || '',
        data.treatment || '',
        data.service || '',
        formattedDate,
        formattedTime,
        data.age || '',
        data.address || '',
        data.branch || '',
        data.message || ''
      ]
    ];

    const resource = {
      values,
    };

    // Append data to the sheet
    const result = await sheets.spreadsheets.values.append({
      spreadsheetId: SPREADSHEET_ID,
      range: `${SHEET_NAME}!A:M`, // Adjust range based on your columns
      valueInputOption: 'RAW',
      resource,
    });

    console.log(`${result.data.updates.updatedCells} cells appended to Google Sheet`);
    return true;
  } catch (error) {
    console.error('Error appending data to Google Sheet:', error);
    // Don't fail the whole request if sheet update fails
    return false;
  }
}

// Improved reCAPTCHA verification function with better error handling
async function verifyCaptcha(token) {
  try {
    // Form data for reCAPTCHA verification
    const params = new URLSearchParams();
    params.append(
      "secret",
      process.env.RECAPTCHA_SECRET_KEY ||
        "6LfefxorAAAAAKT56qOeHMjJklSz5SWaehdsEAzF"
    );
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

app.post("/send-email", async (req, res) => {
  try {
    const {
      // Existing fields
      name,
      email,
      service,
      date,
      time,
      department = "",
      treatment = "",

      // Contact fields - now with dedicated phone field
      firstName = "",
      lastName = "",
      age = "",
      mobile = "",
      phone = "", // Dedicated phone field
      address = "",
      branch = "",
      message = "",

      // Honeypot field
      website = "",

      // reCAPTCHA token
      recaptchaToken,
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

    // Format date and time if they exist
    const formattedDate = date
      ? new Date(date).toLocaleDateString("it-IT")
      : "";
    const formattedTime = time
      ? new Date(time).toLocaleTimeString("it-IT", {
          hour: "2-digit",
          minute: "2-digit",
        })
      : "";

    // Contact information handling - now with separate phone and mobile
    const mailOptions = {
      from: `"Website Form" <${process.env.EMAIL_USER}>`,
      to: "clinic@gohealthalbania.com",
      subject: "Nuova Prenotazione",
      html: `
        <h3>Nuova Prenotazione</h3>
        ${department ? `<p><strong>Reparto:</strong> ${department}</p>` : ""}
        ${treatment ? `<p><strong>Trattamento:</strong> ${treatment}</p>` : ""}
        ${
          service
            ? `<p><strong>Servizio Richiesto:</strong> ${service}</p>`
            : ""
        }
        
        ${
          firstName || lastName
            ? `
          <p><strong>Nome:</strong> ${firstName} ${lastName}</p>
        `
            : name
            ? `<p><strong>Nome:</strong> ${name}</p>`
            : ""
        }
        
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

    // Store data in Google Sheets - don't await to not block email sending
    const formData = {
      name: name || `${firstName || ''} ${lastName || ''}`.trim(),
      email,
      phone: phone || mobile,
      service,
      date,
      time,
      department,
      treatment,
      age,
      address,
      branch,
      message
    };
    
    // Save to Google Sheets in parallel with email sending
    appendToSheet(formData).catch(error => {
      console.error("Failed to save to Google Sheets:", error);
      // Continue with email sending even if Google Sheets fails
    });

    // Send email notification
    await transporter.sendMail(mailOptions);
    res.status(200).json({ message: "Email inviata con successo!" });
  } catch (error) {
    console.error("Error processing request:", error);
    res.status(500).json({ message: "Errore durante l'elaborazione della richiesta" });
  }
});

// Add explicit headers to all responses (backup solution)
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', 'https://lp.gohealthalbania.com');
  res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.header('Access-Control-Allow-Credentials', true);
  next();
});

// Health check endpoint
app.get("/health", (req, res) => {
  res.status(200).json({ status: "ok" });
});

// Endpoint to manually initialize and test the Google Sheets connection
app.get("/test-sheets-connection", async (req, res) => {
  try {
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
    const result = await appendToSheet(testData);
    
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
      error: error.message 
    });
  }
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  
  // Initialize Google Sheets connection
  auth.authorize((err) => {
    if (err) {
      console.error("Error authenticating with Google:", err);
    } else {
      console.log("Successfully connected to Google Sheets API");
    }
  });
});