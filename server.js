const express = require("express");
const cors = require("cors");
const nodemailer = require("nodemailer");
const dotenv = require("dotenv");
const axios = require("axios");
const fs = require("fs");
const path = require("path");
const { createObjectCsvWriter } = require("csv-writer");
const moment = require("moment");

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
app.use(express.urlencoded({ extended: true }));

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

// Improved CSV Writers for both form types with better formatting
const dentalCsvWriter = createObjectCsvWriter({
  path: DENTAL_CSV_PATH,
  header: [
    { id: 'id', title: 'ID' },
    { id: 'timestamp', title: 'Timestamp' },
    { id: 'formattedDate', title: 'Date' },
    { id: 'name', title: 'Name' },
    { id: 'email', title: 'Email' },
    { id: 'phone', title: 'Phone' },
    { id: 'department', title: 'Department' },
    { id: 'treatment', title: 'Treatment' },
    { id: 'service', title: 'Service' },
    { id: 'appointmentDate', title: 'Appointment Date' },
    { id: 'appointmentTime', title: 'Appointment Time' }
  ],
  append: true // Append to existing file
});

const checkupCsvWriter = createObjectCsvWriter({
  path: CHECKUP_CSV_PATH,
  header: [
    { id: 'id', title: 'ID' },
    { id: 'timestamp', title: 'Timestamp' },
    { id: 'formattedDate', title: 'Date' },
    { id: 'fullName', title: 'Full Name' },
    { id: 'firstName', title: 'First Name' },
    { id: 'lastName', title: 'Last Name' },
    { id: 'email', title: 'Email' },
    { id: 'mobile', title: 'Mobile' },
    { id: 'phone', title: 'Phone' },
    { id: 'age', title: 'Age' },
    { id: 'address', title: 'Address' },
    { id: 'branch', title: 'Branch' },
    { id: 'service', title: 'Service' },
    { id: 'appointmentDate', title: 'Appointment Date' },
    { id: 'appointmentTime', title: 'Appointment Time' },
    { id: 'message', title: 'Message' }
  ],
  append: true // Append to existing file
});

// Function to generate a unique ID
function generateId() {
  return Math.random().toString(36).substring(2, 10).toUpperCase();
}

// Function to read existing CSV data
function readCsvData(filePath) {
  if (!fs.existsSync(filePath)) {
    return [];
  }
  
  const fileContent = fs.readFileSync(filePath, 'utf8');
  if (!fileContent.trim()) {
    return [];
  }
  
  const lines = fileContent.trim().split('\n');
  if (lines.length <= 1) {
    return [];
  }
  
  const headers = lines[0].split(',').map(h => h.trim().replace(/^"(.*)"$/, '$1'));
  
  return lines.slice(1).map(line => {
    const values = line.split(',').map(v => v.trim().replace(/^"(.*)"$/, '$1'));
    const record = {};
    
    headers.forEach((header, index) => {
      record[header.toLowerCase().replace(/\s+/g, '')] = values[index] || '';
    });
    
    return record;
  });
}

// Enhanced function to save form data to CSV with better formatting
async function saveToCSV(formData, formType) {
  try {
    const now = new Date();
    const timestamp = now.toISOString();
    const formattedDate = moment(now).format('YYYY-MM-DD HH:mm:ss');
    
    // Generate a unique ID for this submission
    const id = generateId();
    
    // Format the data better for CSV
    let enhancedData = {
      id,
      timestamp,
      formattedDate
    };
    
    if (formType === "DENTAL") {
      enhancedData = {
        ...enhancedData,
        name: formData.name || '',
        email: formData.email || '',
        phone: formData.phone || '',
        department: formData.department || '',
        treatment: formData.treatment || '',
        service: formData.service || '',
        appointmentDate: formData.date ? moment(formData.date).format('YYYY-MM-DD') : '',
        appointmentTime: formData.time ? moment(formData.time, 'HH:mm').format('HH:mm') : ''
      };
    } else {
      // For CHECKUP form
      const fullName = `${formData.firstName || ''} ${formData.lastName || ''}`.trim();
      enhancedData = {
        ...enhancedData,
        fullName,
        firstName: formData.firstName || '',
        lastName: formData.lastName || '',
        email: formData.email || '',
        mobile: formData.mobile || '',
        phone: formData.phone || '', // Added phone field
        age: formData.age || '',
        address: formData.address || '',
        branch: formData.branch || '',
        service: formData.service || '',
        appointmentDate: formData.selectedDate ? moment(formData.selectedDate).format('YYYY-MM-DD') : '',
        appointmentTime: formData.selectedTime ? moment(formData.selectedTime, 'HH:mm').format('HH:mm') : '',
        message: formData.message || '' // Ensure message is properly saved
      };
    }
    
    // Choose the appropriate CSV writer based on form type
    const csvWriter = formType === "DENTAL" ? dentalCsvWriter : checkupCsvWriter;
    
    // Write to CSV
    await csvWriter.writeRecords([enhancedData]);
    console.log(`Data saved to CSV for ${formType} form with ID: ${id}`);
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
      message = "", // Ensure message is extracted
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
      phone, // Include phone field for checkup form
      age,
      address,
      branch,
      service,
      selectedDate,
      selectedTime,
      message // Ensure message is included
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

// Basic authentication middleware for admin routes - using custom implementation instead of express-basic-auth
function basicAuth(options) {
  const users = options.users || {};
  const challenge = options.challenge || false;
  const realm = options.realm || 'Authentication Required';

  return function(req, res, next) {
    // Parse the Authorization header
    const authHeader = req.headers.authorization;
    
    if (!authHeader) {
      return unauthorized();
    }
    
    // Get the encoded credentials
    const match = authHeader.match(/^Basic\s+(.*)$/);
    if (!match) {
      return unauthorized();
    }
    
    // Decode the credentials
    const credentials = Buffer.from(match[1], 'base64').toString();
    const [username, password] = credentials.split(':');
    
    // Check if the credentials are valid
    if (users[username] && users[username] === password) {
      return next();
    }
    
    return unauthorized();
    
    function unauthorized() {
      if (challenge) {
        res.setHeader('WWW-Authenticate', `Basic realm="${realm}"`);
      }
      res.status(401).send('Unauthorized');
    }
  };
}

// Admin authentication middleware
const adminAuth = basicAuth({
  users: { 
    'admin': process.env.ADMIN_PASSWORD || 'changeme123' 
  },
  challenge: true,
  realm: 'GoHealth Admin'
});

// Serve static files for the admin dashboard
app.use('/admin/assets', express.static(path.join(__dirname, 'admin', 'assets')));

// Admin dashboard routes
app.use('/admin', adminAuth);

// Endpoint to download CSV files
app.get("/download-csv/:formType", adminAuth, (req, res) => {
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

// API endpoint to get submissions data
app.get("/admin/api/submissions/:formType", adminAuth, (req, res) => {
  try {
    const { formType } = req.params;
    const { search, page = 1, limit = 10, sortBy = 'timestamp', sortOrder = 'desc' } = req.query;
    
    // Determine which CSV file to read
    let csvPath;
    if (formType.toUpperCase() === "DENTAL") {
      csvPath = DENTAL_CSV_PATH;
    } else if (formType.toUpperCase() === "CHECKUP") {
      csvPath = CHECKUP_CSV_PATH;
    } else {
      return res.status(400).json({ message: "Invalid form type. Use 'dental' or 'checkup'." });
    }
    
    // Read CSV data
    let submissions = readCsvData(csvPath);
    
    // Apply search filter if provided
    if (search) {
      const searchLower = search.toLowerCase();
      submissions = submissions.filter(sub => {
        return Object.values(sub).some(value => 
          value && value.toString().toLowerCase().includes(searchLower)
        );
      });
    }
    
    // Sort data
    submissions.sort((a, b) => {
      const aValue = a[sortBy.toLowerCase()] || '';
      const bValue = b[sortBy.toLowerCase()] || '';
      
      if (sortOrder.toLowerCase() === 'asc') {
        return aValue.localeCompare(bValue);
      } else {
        return bValue.localeCompare(aValue);
      }
    });
    
    // Paginate results
    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const startIndex = (pageNum - 1) * limitNum;
    const endIndex = pageNum * limitNum;
    
    const paginatedSubmissions = submissions.slice(startIndex, endIndex);
    
    res.json({
      total: submissions.length,
      page: pageNum,
      totalPages: Math.ceil(submissions.length / limitNum),
      data: paginatedSubmissions
    });
  } catch (error) {
    console.error("Error fetching submissions:", error);
    res.status(500).json({ message: "Error fetching submissions" });
  }
});

// Admin dashboard main page
app.get("/admin", (req, res) => {
  const adminHtml = `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>GoHealth Admin Dashboard</title>
    <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0-alpha1/dist/css/bootstrap.min.css" rel="stylesheet">
    <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/bootstrap-icons@1.11.1/font/bootstrap-icons.css">
    <style>
        :root {
            --primary-color: #2c3e50;
            --secondary-color: #3498db;
            --accent-color: #e74c3c;
            --light-color: #ecf0f1;
            --dark-color: #2c3e50;
        }
        
        body {
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            background-color: #f8f9fa;
            color: #333;
        }
        
        .sidebar {
            background-color: var(--primary-color);
            color: white;
            min-height: 100vh;
            padding-top: 20px;
        }
        
        .sidebar .nav-link {
            color: rgba(255, 255, 255, 0.8);
            border-radius: 0;
            margin-bottom: 5px;
        }
        
        .sidebar .nav-link:hover,
        .sidebar .nav-link.active {
            background-color: rgba(255, 255, 255, 0.1);
            color: white;
        }
        
        .sidebar .nav-link i {
            margin-right: 10px;
        }
        
        .main-content {
            padding: 20px;
        }
        
        .card {
            border-radius: 10px;
            box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
            margin-bottom: 20px;
            border: none;
        }
        
        .card-header {
            background-color: white;
            border-bottom: 1px solid #eee;
            font-weight: 600;
            padding: 15px 20px;
        }
        
        .table th {
            font-weight: 600;
            color: var(--dark-color);
        }
        
        .btn-primary {
            background-color: var(--secondary-color);
            border-color: var(--secondary-color);
        }
        
        .btn-primary:hover {
            background-color: #2980b9;
            border-color: #2980b9;
        }
        
        .btn-danger {
            background-color: var(--accent-color);
            border-color: var(--accent-color);
        }
        
        .pagination .page-link {
            color: var(--secondary-color);
        }
        
        .pagination .page-item.active .page-link {
            background-color: var(--secondary-color);
            border-color: var(--secondary-color);
        }
        
        .search-box {
            position: relative;
        }
        
        .search-box i {
            position: absolute;
            left: 10px;
            top: 10px;
            color: #aaa;
        }
        
        .search-box input {
            padding-left: 35px;
        }
        
        .dashboard-card {
            border-left: 4px solid;
            transition: transform 0.2s;
        }
        
        .dashboard-card:hover {
            transform: translateY(-5px);
        }
        
        .dashboard-card.dental {
            border-left-color: var(--secondary-color);
        }
        
        .dashboard-card.checkup {
            border-left-color: var(--accent-color);
        }
        
        .dashboard-card .card-body {
            padding: 20px;
        }
        
        .dashboard-card .icon {
            font-size: 2.5rem;
            opacity: 0.8;
        }
        
        .dashboard-card.dental .icon {
            color: var(--secondary-color);
        }
        
        .dashboard-card.checkup .icon {
            color: var(--accent-color);
        }
        
        .dashboard-card h2 {
            font-size: 2rem;
            font-weight: 700;
            margin-bottom: 0;
        }
        
        .dashboard-card p {
            color: #6c757d;
            margin-bottom: 0;
        }
        
        .loading-spinner {
            display: none;
            text-align: center;
            padding: 20px;
        }
        
        .empty-state {
            text-align: center;
            padding: 40px 20px;
            color: #6c757d;
        }
        
        .empty-state i {
            font-size: 3rem;
            margin-bottom: 15px;
            opacity: 0.5;
        }
        
        @media (max-width: 768px) {
            .sidebar {
                min-height: auto;
            }
        }
    </style>
</head>
<body>
    <div class="container-fluid">
        <div class="row">
            <!-- Sidebar -->
            <div class="col-md-3 col-lg-2 d-md-block sidebar collapse">
                <div class="position-sticky">
                    <div class="text-center mb-4">
                        <h4>GoHealth Admin</h4>
                    </div>
                    <ul class="nav flex-column">
                        <li class="nav-item">
                            <a class="nav-link active" href="#dashboard" data-bs-toggle="tab">
                                <i class="bi bi-speedometer2"></i> Dashboard
                            </a>
                        </li>
                        <li class="nav-item">
                            <a class="nav-link" href="#dental" data-bs-toggle="tab">
                                <i class="bi bi-tooth"></i> Dental Submissions
                            </a>
                        </li>
                        <li class="nav-item">
                            <a class="nav-link" href="#checkup" data-bs-toggle="tab">
                                <i class="bi bi-clipboard2-pulse"></i> Checkup Submissions
                            </a>
                        </li>
                        <li class="nav-item mt-4">
                            <a class="nav-link" href="/download-csv/dental">
                                <i class="bi bi-download"></i> Download Dental CSV
                            </a>
                        </li>
                        <li class="nav-item">
                            <a class="nav-link" href="/download-csv/checkup">
                                <i class="bi bi-download"></i> Download Checkup CSV
                            </a>
                        </li>
                    </ul>
                </div>
            </div>

            <!-- Main content -->
            <main class="col-md-9 ms-sm-auto col-lg-10 px-md-4 main-content">
                <div class="tab-content">
                    <!-- Dashboard Tab -->
                    <div class="tab-pane fade show active" id="dashboard">
                        <div class="d-flex justify-content-between flex-wrap flex-md-nowrap align-items-center pt-3 pb-2 mb-3 border-bottom">
                            <h1 class="h2">Dashboard</h1>
                            <div class="btn-toolbar mb-2 mb-md-0">
                                <div class="btn-group me-2">
                                    <button type="button" class="btn btn-sm btn-outline-secondary" id="refreshDashboard">
                                        <i class="bi bi-arrow-clockwise"></i> Refresh
                                    </button>
                                </div>
                            </div>
                        </div>

                        <div class="row">
                            <div class="col-md-6 mb-4">
                                <div class="card dashboard-card dental">
                                    <div class="card-body">
                                        <div class="row">
                                            <div class="col-8">
                                                <h5 class="card-title">Dental Submissions</h5>
                                                <h2 id="dentalCount">-</h2>
                                                <p>Total submissions</p>
                                            </div>
                                            <div class="col-4 text-end">
                                                <i class="bi bi-tooth icon"></i>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                            <div class="col-md-6 mb-4">
                                <div class="card dashboard-card checkup">
                                    <div class="card-body">
                                        <div class="row">
                                            <div class="col-8">
                                                <h5 class="card-title">Checkup Submissions</h5>
                                                <h2 id="checkupCount">-</h2>
                                                <p>Total submissions</p>
                                            </div>
                                            <div class="col-4 text-end">
                                                <i class="bi bi-clipboard2-pulse icon"></i>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div class="row">
                            <div class="col-md-12">
                                <div class="card">
                                    <div class="card-header">
                                        Recent Submissions
                                    </div>
                                    <div class="card-body">
                                        <div class="table-responsive">
                                            <table class="table table-hover">
                                                <thead>
                                                    <tr>
                                                        <th>Date</th>
                                                        <th>Name</th>
                                                        <th>Email</th>
                                                        <th>Type</th>
                                                        <th>Service</th>
                                                        <th>Message</th>
                                                    </tr>
                                                </thead>
                                                <tbody id="recentSubmissions">
                                                    <tr>
                                                        <td colspan="6" class="text-center">Loading...</td>
                                                    </tr>
                                                </tbody>
                                            </table>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>

                    <!-- Dental Submissions Tab -->
                    <div class="tab-pane fade" id="dental">
                        <div class="d-flex justify-content-between flex-wrap flex-md-nowrap align-items-center pt-3 pb-2 mb-3 border-bottom">
                            <h1 class="h2">Dental Submissions</h1>
                            <div class="btn-toolbar mb-2 mb-md-0">
                                <div class="btn-group me-2">
                                    <a href="/download-csv/dental" class="btn btn-sm btn-outline-secondary">
                                        <i class="bi bi-download"></i> Download CSV
                                    </a>
                                </div>
                            </div>
                        </div>

                        <div class="card mb-4">
                            <div class="card-body">
                                <div class="row g-3">
                                    <div class="col-md-6">
                                        <div class="search-box">
                                            <i class="bi bi-search"></i>
                                            <input type="text" class="form-control" id="dentalSearch" placeholder="Search submissions...">
                                        </div>
                                    </div>
                                    <div class="col-md-3">
                                        <select class="form-select" id="dentalSortBy">
                                            <option value="timestamp">Sort by Date</option>
                                            <option value="name">Sort by Name</option>
                                            <option value="email">Sort by Email</option>
                                            <option value="service">Sort by Service</option>
                                        </select>
                                    </div>
                                    <div class="col-md-3">
                                        <select class="form-select" id="dentalSortOrder">
                                            <option value="desc">Newest First</option>
                                            <option value="asc">Oldest First</option>
                                        </select>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div class="loading-spinner" id="dentalLoadingSpinner">
                            <div class="spinner-border text-primary" role="status">
                                <span class="visually-hidden">Loading...</span>
                            </div>
                        </div>

                        <div class="card">
                            <div class="card-body">
                                <div class="table-responsive">
                                    <table class="table table-hover">
                                        <thead>
                                            <tr>
                                                <th>Date</th>
                                                <th>Name</th>
                                                <th>Email</th>
                                                <th>Phone</th>
                                                <th>Department</th>
                                                <th>Treatment</th>
                                                <th>Service</th>
                                                <th>Appointment</th>
                                            </tr>
                                        </thead>
                                        <tbody id="dentalSubmissions">
                                            <tr>
                                                <td colspan="8" class="text-center">Loading submissions...</td>
                                            </tr>
                                        </tbody>
                                    </table>
                                </div>

                                <div class="empty-state" id="dentalEmptyState" style="display: none;">
                                    <i class="bi bi-inbox"></i>
                                    <h5>No submissions found</h5>
                                    <p>There are no dental form submissions yet.</p>
                                </div>

                                <nav aria-label="Submissions pagination" class="mt-4">
                                    <ul class="pagination justify-content-center" id="dentalPagination">
                                    </ul>
                                </nav>
                            </div>
                        </div>
                    </div>

                    <!-- Checkup Submissions Tab -->
                    <div class="tab-pane fade" id="checkup">
                        <div class="d-flex justify-content-between flex-wrap flex-md-nowrap align-items-center pt-3 pb-2 mb-3 border-bottom">
                            <h1 class="h2">Checkup Submissions</h1>
                            <div class="btn-toolbar mb-2 mb-md-0">
                                <div class="btn-group me-2">
                                    <a href="/download-csv/checkup" class="btn btn-sm btn-outline-secondary">
                                        <i class="bi bi-download"></i> Download CSV
                                    </a>
                                </div>
                            </div>
                        </div>

                        <div class="card mb-4">
                            <div class="card-body">
                                <div class="row g-3">
                                    <div class="col-md-6">
                                        <div class="search-box">
                                            <i class="bi bi-search"></i>
                                            <input type="text" class="form-control" id="checkupSearch" placeholder="Search submissions...">
                                        </div>
                                    </div>
                                    <div class="col-md-3">
                                        <select class="form-select" id="checkupSortBy">
                                            <option value="timestamp">Sort by Date</option>
                                            <option value="fullName">Sort by Name</option>
                                            <option value="email">Sort by Email</option>
                                            <option value="service">Sort by Service</option>
                                        </select>
                                    </div>
                                    <div class="col-md-3">
                                        <select class="form-select" id="checkupSortOrder">
                                            <option value="desc">Newest First</option>
                                            <option value="asc">Oldest First</option>
                                        </select>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div class="loading-spinner" id="checkupLoadingSpinner">
                            <div class="spinner-border text-primary" role="status">
                                <span class="visually-hidden">Loading...</span>
                            </div>
                        </div>

                        <div class="card">
                            <div class="card-body">
                                <div class="table-responsive">
                                    <table class="table table-hover">
                                        <thead>
                                            <tr>
                                                <th>Date</th>
                                                <th>Name</th>
                                                <th>Email</th>
                                                <th>Phone</th>
                                                <th>Age</th>
                                                <th>Branch</th>
                                                <th>Service</th>
                                                <th>Appointment</th>
                                                <th>Message</th>
                                            </tr>
                                        </thead>
                                        <tbody id="checkupSubmissions">
                                            <tr>
                                                <td colspan="9" class="text-center">Loading submissions...</td>
                                            </tr>
                                        </tbody>
                                    </table>
                                </div>

                                <div class="empty-state" id="checkupEmptyState" style="display: none;">
                                    <i class="bi bi-inbox"></i>
                                    <h5>No submissions found</h5>
                                    <p>There are no checkup form submissions yet.</p>
                                </div>

                                <nav aria-label="Submissions pagination" class="mt-4">
                                    <ul class="pagination justify-content-center" id="checkupPagination">
                                    </ul>
                                </nav>
                            </div>
                        </div>
                    </div>
                </div>
            </main>
        </div>
    </div>

    <script src="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0-alpha1/dist/js/bootstrap.bundle.min.js"></script>
    <script>
        // Utility functions
        function formatDate(dateString) {
            if (!dateString) return '-';
            const date = new Date(dateString);
            return date.toLocaleString();
        }

        function formatAppointment(date, time) {
            if (!date) return '-';
            return \`\${date} \${time || ''}\`.trim();
        }

        // Truncate long text for display
        function truncateText(text, maxLength = 50) {
            if (!text) return '-';
            if (text.length <= maxLength) return text;
            return text.substring(0, maxLength) + '...';
        }

        // Dashboard functions
        async function loadDashboardData() {
            try {
                // Load counts
                const [dentalResponse, checkupResponse] = await Promise.all([
                    fetch('/admin/api/submissions/dental'),
                    fetch('/admin/api/submissions/checkup')
                ]);
                
                const dentalData = await dentalResponse.json();
                const checkupData = await checkupResponse.json();
                
                document.getElementById('dentalCount').textContent = dentalData.total;
                document.getElementById('checkupCount').textContent = checkupData.total;
                
                // Load recent submissions (combine both and sort by date)
                let recentSubmissions = [];
                
                if (dentalData.data && dentalData.data.length > 0) {
                    recentSubmissions = [...recentSubmissions, ...dentalData.data.map(item => ({
                        ...item,
                        type: 'DENTAL',
                        displayName: item.name
                    }))];
                }
                
                if (checkupData.data && checkupData.data.length > 0) {
                    recentSubmissions = [...recentSubmissions, ...checkupData.data.map(item => ({
                        ...item,
                        type: 'CHECKUP',
                        displayName: item.fullname || \`\${item.firstname || ''} \${item.lastname || ''}\`.trim()
                    }))];
                }
                
                // Sort by timestamp (newest first) and take top 10
                recentSubmissions.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
                recentSubmissions = recentSubmissions.slice(0, 10);
                
                // Render recent submissions
                const recentSubmissionsTable = document.getElementById('recentSubmissions');
                
                if (recentSubmissions.length === 0) {
                    recentSubmissionsTable.innerHTML = \`
                        <tr>
                            <td colspan="6" class="text-center">No submissions found</td>
                        </tr>
                    \`;
                } else {
                    recentSubmissionsTable.innerHTML = recentSubmissions.map(submission => \`
                        <tr>
                            <td>\${formatDate(submission.timestamp)}</td>
                            <td>\${submission.displayName || '-'}</td>
                            <td>\${submission.email || '-'}</td>
                            <td><span class="badge \${submission.type === 'DENTAL' ? 'bg-primary' : 'bg-danger'}">\${submission.type}</span></td>
                            <td>\${submission.service || '-'}</td>
                            <td>\${truncateText(submission.message, 30) || '-'}</td>
                        </tr>
                    \`).join('');
                }
            } catch (error) {
                console.error('Error loading dashboard data:', error);
                document.getElementById('recentSubmissions').innerHTML = \`
                    <tr>
                        <td colspan="6" class="text-center text-danger">Error loading data. Please try again.</td>
                    </tr>
                \`;
            }
        }

        // Dental submissions functions
        let dentalCurrentPage = 1;
        let dentalSearchTerm = '';
        let dentalSortBy = 'timestamp';
        let dentalSortOrder = 'desc';

        async function loadDentalSubmissions() {
            try {
                document.getElementById('dentalLoadingSpinner').style.display = 'block';
                
                const url = \`/admin/api/submissions/dental?page=\${dentalCurrentPage}&search=\${dentalSearchTerm}&sortBy=\${dentalSortBy}&sortOrder=\${dentalSortOrder}\`;
                const response = await fetch(url);
                const data = await response.json();
                
                const submissionsTable = document.getElementById('dentalSubmissions');
                const emptyState = document.getElementById('dentalEmptyState');
                
                if (data.total === 0) {
                    submissionsTable.innerHTML = '';
                    emptyState.style.display = 'block';
                } else {
                    emptyState.style.display = 'none';
                    
                    submissionsTable.innerHTML = data.data.map(submission => \`
                        <tr>
                            <td>\${formatDate(submission.timestamp)}</td>
                            <td>\${submission.name || '-'}</td>
                            <td>\${submission.email || '-'}</td>
                            <td>\${submission.phone || '-'}</td>
                            <td>\${submission.department || '-'}</td>
                            <td>\${submission.treatment || '-'}</td>
                            <td>\${submission.service || '-'}</td>
                            <td>\${formatAppointment(submission.appointmentdate, submission.appointmenttime)}</td>
                        </tr>
                    \`).join('');
                    
                    // Update pagination
                    const pagination = document.getElementById('dentalPagination');
                    pagination.innerHTML = '';
                    
                    // Previous button
                    pagination.innerHTML += \`
                        <li class="page-item \${dentalCurrentPage === 1 ? 'disabled' : ''}">
                            <a class="page-link" href="#" data-page="\${dentalCurrentPage - 1}">Previous</a>
                        </li>
                    \`;
                    
                    // Page numbers
                    for (let i = 1; i <= data.totalPages; i++) {
                        pagination.innerHTML += \`
                            <li class="page-item \${i === dentalCurrentPage ? 'active' : ''}">
                                <a class="page-link" href="#" data-page="\${i}">\${i}</a>
                            </li>
                        \`;
                    }
                    
                    // Next button
                    pagination.innerHTML += \`
                        <li class="page-item \${dentalCurrentPage === data.totalPages ? 'disabled' : ''}">
                            <a class="page-link" href="#" data-page="\${dentalCurrentPage + 1}">Next</a>
                        </li>
                    \`;
                    
                    // Add event listeners to pagination links
                    document.querySelectorAll('#dentalPagination .page-link').forEach(link => {
                        link.addEventListener('click', function(e) {
                            e.preventDefault();
                            dentalCurrentPage = parseInt(this.getAttribute('data-page'));
                            loadDentalSubmissions();
                        });
                    });
                }
            } catch (error) {
                console.error('Error loading dental submissions:', error);
                document.getElementById('dentalSubmissions').innerHTML = \`
                    <tr>
                        <td colspan="8" class="text-center text-danger">Error loading data. Please try again.</td>
                    </tr>
                \`;
            } finally {
                document.getElementById('dentalLoadingSpinner').style.display = 'none';
            }
        }

        // Checkup submissions functions
        let checkupCurrentPage = 1;
        let checkupSearchTerm = '';
        let checkupSortBy = 'timestamp';
        let checkupSortOrder = 'desc';

        async function loadCheckupSubmissions() {
            try {
                document.getElementById('checkupLoadingSpinner').style.display = 'block';
                
                const url = \`/admin/api/submissions/checkup?page=\${checkupCurrentPage}&search=\${checkupSearchTerm}&sortBy=\${checkupSortBy}&sortOrder=\${checkupSortOrder}\`;
                const response = await fetch(url);
                const data = await response.json();
                
                const submissionsTable = document.getElementById('checkupSubmissions');
                const emptyState = document.getElementById('checkupEmptyState');
                
                if (data.total === 0) {
                    submissionsTable.innerHTML = '';
                    emptyState.style.display = 'block';
                } else {
                    emptyState.style.display = 'none';
                    
                    submissionsTable.innerHTML = data.data.map(submission => \`
                        <tr>
                            <td>\${formatDate(submission.timestamp)}</td>
                            <td>\${submission.fullname || \`\${submission.firstname || ''} \${submission.lastname || ''}\`.trim() || '-'}</td>
                            <td>\${submission.email || '-'}</td>
                            <td>\${submission.phone || submission.mobile || '-'}</td>
                            <td>\${submission.age || '-'}</td>
                            <td>\${submission.branch || '-'}</td>
                            <td>\${submission.service || '-'}</td>
                            <td>\${formatAppointment(submission.appointmentdate, submission.appointmenttime)}</td>
                            <td>\${truncateText(submission.message, 30) || '-'}</td>
                        </tr>
                    \`).join('');
                    
                    // Update pagination
                    const pagination = document.getElementById('checkupPagination');
                    pagination.innerHTML = '';
                    
                    // Previous button
                    pagination.innerHTML += \`
                        <li class="page-item \${checkupCurrentPage === 1 ? 'disabled' : ''}">
                            <a class="page-link" href="#" data-page="\${checkupCurrentPage - 1}">Previous</a>
                        </li>
                    \`;
                    
                    // Page numbers
                    for (let i = 1; i <= data.totalPages; i++) {
                        pagination.innerHTML += \`
                            <li class="page-item \${i === checkupCurrentPage ? 'active' : ''}">
                                <a class="page-link" href="#" data-page="\${i}">\${i}</a>
                            </li>
                        \`;
                    }
                    
                    // Next button
                    pagination.innerHTML += \`
                        <li class="page-item \${checkupCurrentPage === data.totalPages ? 'disabled' : ''}">
                            <a class="page-link" href="#" data-page="\${checkupCurrentPage + 1}">Next</a>
                        </li>
                    \`;
                    
                    // Add event listeners to pagination links
                    document.querySelectorAll('#checkupPagination .page-link').forEach(link => {
                        link.addEventListener('click', function(e) {
                            e.preventDefault();
                            checkupCurrentPage = parseInt(this.getAttribute('data-page'));
                            loadCheckupSubmissions();
                        });
                    });
                }
            } catch (error) {
                console.error('Error loading checkup submissions:', error);
                document.getElementById('checkupSubmissions').innerHTML = \`
                    <tr>
                        <td colspan="9" class="text-center text-danger">Error loading data. Please try again.</td>
                    </tr>
                \`;
            } finally {
                document.getElementById('checkupLoadingSpinner').style.display = 'none';
            }
        }

        // Event listeners
        document.addEventListener('DOMContentLoaded', function() {
            // Load dashboard data
            loadDashboardData();
            
            // Refresh dashboard button
            document.getElementById('refreshDashboard').addEventListener('click', loadDashboardData);
            
            // Tab change event
            document.querySelectorAll('a[data-bs-toggle="tab"]').forEach(tab => {
                tab.addEventListener('shown.bs.tab', function(e) {
                    const target = e.target.getAttribute('href');
                    
                    if (target === '#dental') {
                        loadDentalSubmissions();
                    } else if (target === '#checkup') {
                        loadCheckupSubmissions();
                    } else if (target === '#dashboard') {
                        loadDashboardData();
                    }
                });
            });
            
            // Dental search input
            document.getElementById('dentalSearch').addEventListener('input', function() {
                dentalSearchTerm = this.value;
                dentalCurrentPage = 1; // Reset to first page
                loadDentalSubmissions();
            });
            
            // Dental sort options
            document.getElementById('dentalSortBy').addEventListener('change', function() {
                dentalSortBy = this.value;
                loadDentalSubmissions();
            });
            
            document.getElementById('dentalSortOrder').addEventListener('change', function() {
                dentalSortOrder = this.value;
                loadDentalSubmissions();
            });
            
            // Checkup search input
            document.getElementById('checkupSearch').addEventListener('input', function() {
                checkupSearchTerm = this.value;
                checkupCurrentPage = 1; // Reset to first page
                loadCheckupSubmissions();
            });
            
            // Checkup sort options
            document.getElementById('checkupSortBy').addEventListener('change', function() {
                checkupSortBy = this.value;
                loadCheckupSubmissions();
            });
            
            document.getElementById('checkupSortOrder').addEventListener('change', function() {
                checkupSortOrder = this.value;
                loadCheckupSubmissions();
            });
        });
    </script>
</body>
</html>
  `;
  
  res.send(adminHtml);
});

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`CSV files will be stored in: ${DATA_DIR}`);
  console.log(`Admin dashboard available at: http://localhost:${PORT}/admin`);
});

module.exports = app;

// Test the server
console.log("Enhanced server configured with CSV storage and admin dashboard");
console.log(`Dental form submissions will be saved to: ${DENTAL_CSV_PATH}`);
console.log(`Checkup form submissions will be saved to: ${CHECKUP_CSV_PATH}`);