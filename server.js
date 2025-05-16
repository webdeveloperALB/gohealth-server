const express = require("express");
const cors = require("cors");
const nodemailer = require("nodemailer");
const dotenv = require("dotenv");
const axios = require("axios");
const fs = require("fs");
const path = require("path");
const { createObjectCsvWriter } = require("csv-writer");

// Load environment variables
dotenv.config();

const app = express();

// Improved CORS configuration
const allowedOrigins = [
  "https://lp.gohealthalbania.com",
  "http://localhost:3000",
  // Add any other domains that need access
];

app.use(
  cors({
    origin: (origin, callback) => {
      // Allow requests with no origin (like mobile apps or curl requests)
      if (!origin) return callback(null, true);

      if (allowedOrigins.indexOf(origin) !== -1) {
        callback(null, true);
      } else {
        callback(new Error("Not allowed by CORS"));
      }
    },
    methods: ["GET", "POST", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
    credentials: true,
    preflightContinue: false,
    optionsSuccessStatus: 204,
  })
);

// Handle OPTIONS requests
app.options("*", cors());

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

// CSV file paths
const DATA_DIR = path.join(__dirname, "data");
const DENTAL_CSV_PATH = path.join(DATA_DIR, "dental_submissions.csv");
const CHECKUP_CSV_PATH = path.join(DATA_DIR, "checkup_submissions.csv");

// Ensure data directory exists
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

// CSV Writers for both form types
const dentalCsvWriter = createObjectCsvWriter({
  path: DENTAL_CSV_PATH,
  header: [
    { id: 'timestamp', title: 'TIMESTAMP' },
    { id: 'name', title: 'NAME' },
    { id: 'email', title: 'EMAIL' },
    { id: 'phone', title: 'PHONE' },
    { id: 'department', title: 'DEPARTMENT' },
    { id: 'treatment', title: 'TREATMENT' },
    { id: 'service', title: 'SERVICE' },
    { id: 'date', title: 'DATE' },
    { id: 'time', title: 'TIME' }
  ],
  append: true // Append to existing file
});

const checkupCsvWriter = createObjectCsvWriter({
  path: CHECKUP_CSV_PATH,
  header: [
    { id: 'timestamp', title: 'TIMESTAMP' },
    { id: 'firstName', title: 'FIRST_NAME' },
    { id: 'lastName', title: 'LAST_NAME' },
    { id: 'email', title: 'EMAIL' },
    { id: 'mobile', title: 'MOBILE' },
    { id: 'age', title: 'AGE' },
    { id: 'address', title: 'ADDRESS' },
    { id: 'branch', title: 'BRANCH' },
    { id: 'service', title: 'SERVICE' },
    { id: 'selectedDate', title: 'DATE' },
    { id: 'selectedTime', title: 'TIME' },
    { id: 'message', title: 'MESSAGE' }
  ],
  append: true // Append to existing file
});

// Function to save form data to CSV
async function saveToCSV(formData, formType) {
  try {
    // Add timestamp
    const dataWithTimestamp = {
      ...formData,
      timestamp: new Date().toISOString()
    };
    
    // Choose the appropriate CSV writer based on form type
    const csvWriter = formType === "DENTAL" ? dentalCsvWriter : checkupCsvWriter;
    
    // Write to CSV
    await csvWriter.writeRecords([dataWithTimestamp]);
    console.log(`Data saved to CSV for ${formType} form`);
    return true;
  } catch (error) {
    console.error(`Error saving to CSV for ${formType} form:`, error);
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

    const response = await axios.post("https://www.google.com/recaptcha/api/siteverify", params.toString(), {
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
    });

    if (response.data.success) {
      console.log("reCAPTCHA verification successful");
      return true;
    } else {
      console.error("reCAPTCHA verification failed:", response.data["error-codes"]);
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
      selectedTime,
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
      return res.status(400).json({ message: "reCAPTCHA verification failed. Please try again." });
    }

    // Determine which form was submitted
    // If firstName or lastName is present, it's likely the checkup form
    // If department or treatment is present, it's likely the dental form
    const formType = firstName || lastName ? "CHECKUP" : "DENTAL";
    console.log(`Form type detected: ${formType}`);

    // Format date and time based on which form fields are present
    const formattedDate = date || selectedDate ? new Date(date || selectedDate).toLocaleDateString("it-IT") : "";

    const formattedTime =
      time || selectedTime
        ? new Date(time || selectedTime).toLocaleTimeString("it-IT", {
            hour: "2-digit",
            minute: "2-digit",
          })
        : "";

    // Determine the full name based on available fields
    let fullName = "";
    if (name) {
      fullName = name;
    } else if (firstName || lastName) {
      fullName = `${firstName || ""} ${lastName || ""}`.trim();
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

    // Prepare form data for CSV
    const formData = formType === "DENTAL" ? {
      name,
      email,
      phone,
      department,
      treatment,
      service,
      date,
      time
    } : {
      firstName,
      lastName,
      email,
      mobile,
      age,
      address,
      branch,
      service,
      selectedDate,
      selectedTime,
      message
    };

    console.log("Attempting to save data and send email...");

    // Save to CSV and send email in parallel
    const [csvResult, emailResult] = await Promise.allSettled([
      saveToCSV(formData, formType),
      transporter.sendMail(mailOptions)
    ]);

    // Log any errors but don't fail the request if only one operation fails
    if (csvResult.status === "rejected" || csvResult.value === false) {
      console.error("Failed to save to CSV:", csvResult.reason || "Check previous logs for details");
    }

    if (emailResult.status === "rejected") {
      console.error("Failed to send email:", emailResult.reason);
      // Only fail the request if both operations fail
      if (csvResult.status === "rejected" || csvResult.value === false) {
        throw new Error("Both email and CSV operations failed");
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
    environment: process.env.NODE_ENV || "development",
    emailTransport: transporter ? "configured" : "not configured",
    csvStorage: {
      dentalPath: DENTAL_CSV_PATH,
      checkupPath: CHECKUP_CSV_PATH
    }
  });
});

// Endpoint to download CSV files
app.get("/download-csv/:formType", (req, res) => {
  try {
    const { formType } = req.params;
    
    // Determine which CSV file to send
    let csvPath;
    if (formType.toUpperCase() === "DENTAL") {
      csvPath = DENTAL_CSV_PATH;
    } else if (formType.toUpperCase() === "CHECKUP") {
      csvPath = CHECKUP_CSV_PATH;
    } else {
      return res.status(400).json({ message: "Invalid form type. Use 'dental' or 'checkup'." });
    }
    
    // Check if file exists
    if (!fs.existsSync(csvPath)) {
      return res.status(404).json({ message: `No ${formType} submissions found.` });
    }
    
    // Send the file
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename=${formType.toLowerCase()}_submissions.csv`);
    
    const fileStream = fs.createReadStream(csvPath);
    fileStream.pipe(res);
  } catch (error) {
    console.error("Error downloading CSV:", error);
    res.status(500).json({ message: "Error downloading CSV file" });
  }
});

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`CSV files will be stored in: ${DATA_DIR}`);
});

module.exports = app;

// Test the server
console.log("Server configured with CSV storage instead of Google Sheets");
console.log(`Dental form submissions will be saved to: ${DENTAL_CSV_PATH}`);
console.log(`Checkup form submissions will be saved to: ${CHECKUP_CSV_PATH}`);