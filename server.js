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

// CORS configuration
app.use(cors({
  origin: ["https://lp.gohealthalbania.com", "http://localhost:3000"],
  methods: ["GET", "POST", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
  credentials: true
}));

// Handle OPTIONS requests
app.options("*", cors());

// Parse JSON bodies
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

// Initialize CSV files if they don't exist
function initializeCsvFiles() {
  // Dental CSV
  if (!fs.existsSync(DENTAL_CSV_PATH)) {
    const headers = "ID,Timestamp,Name,Email,Phone,Department,Treatment,Service,AppointmentDate,AppointmentTime\n";
    fs.writeFileSync(DENTAL_CSV_PATH, headers);
    console.log("Created dental submissions CSV file");
  }

  // Checkup CSV
  if (!fs.existsSync(CHECKUP_CSV_PATH)) {
    const headers = "ID,Timestamp,FullName,FirstName,LastName,Email,Mobile,Phone,Age,Address,Branch,Service,AppointmentDate,AppointmentTime,Message\n";
    fs.writeFileSync(CHECKUP_CSV_PATH, headers);
    console.log("Created checkup submissions CSV file");
  }
}

initializeCsvFiles();

// Function to generate a unique ID
function generateId() {
  return Math.random().toString(36).substring(2, 10).toUpperCase();
}

// Function to format date for CSV
function formatDate(date) {
  if (!date) return "";
  const d = new Date(date);
  return d.toISOString().split('T')[0]; // YYYY-MM-DD
}

// Function to format time for CSV
function formatTime(time) {
  if (!time) return "";
  const t = new Date(time);
  return t.toTimeString().split(' ')[0].substring(0, 5); // HH:MM
}

// Function to save dental form data to CSV
function saveDentalToCSV(formData) {
  const id = generateId();
  const timestamp = new Date().toISOString();
  
  const csvLine = [
    id,
    timestamp,
    formData.name || "",
    formData.email || "",
    formData.phone || "",
    formData.department || "",
    formData.treatment || "",
    formData.service || "",
    formatDate(formData.date),
    formatTime(formData.time)
  ].map(field => `"${String(field).replace(/"/g, '""')}"`).join(",") + "\n";
  
  fs.appendFileSync(DENTAL_CSV_PATH, csvLine);
  console.log(`Dental submission saved with ID: ${id}`);
  return id;
}

// Function to save checkup form data to CSV
function saveCheckupToCSV(formData) {
  const id = generateId();
  const timestamp = new Date().toISOString();
  const fullName = `${formData.firstName || ""} ${formData.lastName || ""}`.trim();
  
  const csvLine = [
    id,
    timestamp,
    fullName,
    formData.firstName || "",
    formData.lastName || "",
    formData.email || "",
    formData.mobile || "",
    formData.phone || "",
    formData.age || "",
    formData.address || "",
    formData.branch || "",
    formData.service || "",
    formatDate(formData.selectedDate),
    formatTime(formData.selectedTime),
    formData.message || ""
  ].map(field => `"${String(field).replace(/"/g, '""')}"`).join(",") + "\n";
  
  fs.appendFileSync(CHECKUP_CSV_PATH, csvLine);
  console.log(`Checkup submission saved with ID: ${id}`);
  return id;
}

// Function to read CSV data
function readCSV(filePath) {
  if (!fs.existsSync(filePath)) {
    return [];
  }
  
  const content = fs.readFileSync(filePath, 'utf8');
  const lines = content.trim().split('\n');
  
  if (lines.length <= 1) {
    return [];
  }
  
  const headers = lines[0].split(',').map(h => h.trim().replace(/^"(.*)"$/, '$1'));
  
  return lines.slice(1).map(line => {
    // Handle commas within quoted fields
    const values = [];
    let inQuotes = false;
    let currentValue = '';
    
    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      
      if (char === '"' && (i === 0 || line[i-1] !== '\\')) {
        inQuotes = !inQuotes;
      } else if (char === ',' && !inQuotes) {
        values.push(currentValue.replace(/^"(.*)"$/, '$1'));
        currentValue = '';
      } else {
        currentValue += char;
      }
    }
    
    values.push(currentValue.replace(/^"(.*)"$/, '$1'));
    
    const record = {};
    headers.forEach((header, index) => {
      record[header.toLowerCase()] = values[index] || '';
    });
    
    return record;
  });
}

// reCAPTCHA verification
async function verifyCaptcha(token) {
  if (!token) return false;
  
  try {
    const params = new URLSearchParams();
    params.append("secret", process.env.RECAPTCHA_SECRET_KEY);
    params.append("response", token);

    const response = await axios.post(
      "https://www.google.com/recaptcha/api/siteverify", 
      params.toString(),
      { headers: { "Content-Type": "application/x-www-form-urlencoded" } }
    );

    return response.data.success;
  } catch (error) {
    console.error("reCAPTCHA verification error:", error.message);
    return false;
  }
}

// Unified endpoint for both forms
app.post("/send-email", async (req, res) => {
  try {
    console.log("Received form submission:", req.body);

    // Extract common fields
    const { email, service, recaptchaToken, website = "" } = req.body;

    // Check honeypot
    if (website !== "") {
      console.log("Spam submission detected via honeypot!");
      return res.status(200).json({ message: "Email inviata con successo!" });
    }

    // Verify reCAPTCHA
    const isCaptchaValid = await verifyCaptcha(recaptchaToken);
    if (!isCaptchaValid) {
      console.log("reCAPTCHA verification failed");
      return res.status(400).json({ message: "reCAPTCHA verification failed. Please try again." });
    }

    // Determine form type
    const formType = req.body.firstName || req.body.lastName ? "CHECKUP" : "DENTAL";
    console.log(`Form type detected: ${formType}`);

    // Prepare email content
    let fullName = "";
    let formattedDate = "";
    let formattedTime = "";
    
    if (formType === "DENTAL") {
      fullName = req.body.name || "";
      formattedDate = req.body.date ? new Date(req.body.date).toLocaleDateString("it-IT") : "";
      formattedTime = req.body.time ? new Date(req.body.time).toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" }) : "";
    } else {
      fullName = `${req.body.firstName || ""} ${req.body.lastName || ""}`.trim();
      formattedDate = req.body.selectedDate ? new Date(req.body.selectedDate).toLocaleDateString("it-IT") : "";
      formattedTime = req.body.selectedTime ? new Date(req.body.selectedTime).toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" }) : "";
    }

    // Email content
    const mailOptions = {
      from: `"Website Form" <${process.env.EMAIL_USER}>`,
      to: "clinic@gohealthalbania.com",
      subject: `Nuova Prenotazione - ${formType}`,
      html: `
        <h3>Nuova Prenotazione - ${formType}</h3>
        ${req.body.department ? `<p><strong>Reparto:</strong> ${req.body.department}</p>` : ""}
        ${req.body.treatment ? `<p><strong>Trattamento:</strong> ${req.body.treatment}</p>` : ""}
        ${service ? `<p><strong>Servizio Richiesto:</strong> ${service}</p>` : ""}
        
        <p><strong>Nome:</strong> ${fullName}</p>
        
        ${email ? `<p><strong>Email:</strong> ${email}</p>` : ""}
        ${req.body.phone ? `<p><strong>Telefono:</strong> ${req.body.phone}</p>` : ""}
        ${req.body.mobile ? `<p><strong>Cellulare:</strong> ${req.body.mobile}</p>` : ""}
        ${formattedDate ? `<p><strong>Data:</strong> ${formattedDate}</p>` : ""}
        ${formattedTime ? `<p><strong>Ora:</strong> ${formattedTime}</p>` : ""}
        
        ${req.body.age ? `<p><strong>Età:</strong> ${req.body.age}</p>` : ""}
        ${req.body.address ? `<p><strong>Indirizzo:</strong> ${req.body.address}</p>` : ""}
        ${req.body.branch ? `<p><strong>Filiale:</strong> ${req.body.branch}</p>` : ""}
        ${req.body.message ? `<p><strong>Messaggio:</strong> ${req.body.message}</p>` : ""}
      `,
    };

    // Save to CSV and send email
    let csvSaveResult;
    if (formType === "DENTAL") {
      csvSaveResult = saveDentalToCSV(req.body);
    } else {
      csvSaveResult = saveCheckupToCSV(req.body);
    }

    // Send email
    await transporter.sendMail(mailOptions);
    console.log("Email sent successfully");

    res.status(200).json({ message: "Email inviata con successo!" });
  } catch (error) {
    console.error("Error processing request:", error);
    res.status(500).json({ message: "Errore durante l'elaborazione della richiesta" });
  }
});

// Basic authentication middleware
function basicAuth(req, res, next) {
  // Get auth header
  const authHeader = req.headers.authorization;
  
  if (!authHeader) {
    res.setHeader('WWW-Authenticate', 'Basic realm="Admin Area"');
    return res.status(401).send('Authentication required');
  }
  
  // Parse auth header
  const auth = Buffer.from(authHeader.split(' ')[1], 'base64').toString().split(':');
  const user = auth[0];
  const pass = auth[1];
  
  // Check credentials
  if (user === 'admin' && pass === (process.env.ADMIN_PASSWORD || 'changeme123')) {
    return next();
  }
  
  res.setHeader('WWW-Authenticate', 'Basic realm="Admin Area"');
  return res.status(401).send('Authentication required');
}

// API endpoints for admin dashboard
app.get("/admin/api/submissions/:formType", basicAuth, (req, res) => {
  try {
    const { formType } = req.params;
    const { search, page = 1, limit = 10, sortBy = 'timestamp', sortOrder = 'desc' } = req.query;
    
    // Determine which CSV file to read
    const csvPath = formType.toLowerCase() === "dental" ? DENTAL_CSV_PATH : CHECKUP_CSV_PATH;
    
    // Read CSV data
    let submissions = readCSV(csvPath);
    
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

// Download CSV endpoint
app.get("/download-csv/:formType", basicAuth, (req, res) => {
  try {
    const { formType } = req.params;
    const csvPath = formType.toLowerCase() === "dental" ? DENTAL_CSV_PATH : CHECKUP_CSV_PATH;
    
    if (!fs.existsSync(csvPath)) {
      return res.status(404).json({ message: `No ${formType} submissions found` });
    }
    
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename=${formType.toLowerCase()}_submissions.csv`);
    
    const fileStream = fs.createReadStream(csvPath);
    fileStream.pipe(res);
  } catch (error) {
    console.error("Error downloading CSV:", error);
    res.status(500).json({ message: "Error downloading CSV file" });
  }
});

// Admin dashboard HTML
app.get("/admin", basicAuth, (req, res) => {
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
        body {
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            background-color: #f8f9fa;
        }
        
        .sidebar {
            background-color: #2c3e50;
            color: white;
            min-height: 100vh;
            padding-top: 20px;
            transition: all 0.3s;
        }
        
        .sidebar .nav-link {
            color: rgba(255, 255, 255, 0.8);
            border-radius: 0;
            margin-bottom: 5px;
            padding: 10px 15px;
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
        
        .dashboard-card {
            border-left: 4px solid;
            transition: transform 0.2s;
        }
        
        .dashboard-card:hover {
            transform: translateY(-5px);
        }
        
        .dashboard-card.dental {
            border-left-color: #3498db;
        }
        
        .dashboard-card.checkup {
            border-left-color: #e74c3c;
        }
        
        .dashboard-card .icon {
            font-size: 2.5rem;
            opacity: 0.8;
        }
        
        .dashboard-card.dental .icon {
            color: #3498db;
        }
        
        .dashboard-card.checkup .icon {
            color: #e74c3c;
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
        
        .message-cell {
            max-width: 200px;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
        }
        
        .message-modal .modal-body {
            white-space: pre-wrap;
            max-height: 400px;
            overflow-y: auto;
        }
        
        /* Mobile responsiveness improvements */
        @media (max-width: 767.98px) {
            .sidebar {
                position: fixed;
                top: 0;
                left: -100%;
                width: 80%;
                z-index: 1050;
                transition: left 0.3s ease;
                height: 100%;
                overflow-y: auto;
            }
            
            .sidebar.show {
                left: 0;
            }
            
            .mobile-nav-toggle {
                display: block !important;
                position: fixed;
                left: 10px;
                z-index: 1060;
            }
            
            .main-content {
                padding-top: 60px;
            }
            
            .table-responsive {
                font-size: 0.85rem;
            }
            
            .card-body {
                padding: 0.75rem;
            }
            
            .dashboard-card h2 {
                font-size: 1.5rem;
            }
            
            .dashboard-card .icon {
                font-size: 2rem;
            }
        }
        
        /* Overlay for mobile sidebar */
        .sidebar-overlay {
            display: none;
            position: fixed;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background-color: rgba(0, 0, 0, 0.5);
            z-index: 1040;
        }
        
        /* Mobile header */
        .mobile-header {
            display: none;
            position: fixed;
            top: 0;
            left: 0;
            right: 0;
            background-color: #2c3e50;
            color: white;
            padding: 10px 15px;
            z-index: 1030;
            box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
        }
        
        @media (max-width: 767.98px) {
            .mobile-header {
                display: flex;
                align-items: center;
                justify-content: center;
            }
            
            .mobile-header h4 {
                margin: 0;
                font-size: 1.2rem;
            }
        }
    </style>
</head>
<body>
    <!-- Mobile Header -->
    <div class="mobile-header">
        <button class="btn btn-sm text-white mobile-nav-toggle" id="sidebarToggle">
            <i class="bi bi-list fs-4"></i>
        </button>
        <h4>GoHealth Admin</h4>
    </div>
    
    <!-- Sidebar Overlay -->
    <div class="sidebar-overlay" id="sidebarOverlay"></div>
    
    <div class="container-fluid">
        <div class="row">
            <!-- Sidebar -->
            <div class="col-md-3 col-lg-2 d-md-block sidebar" id="sidebar">
                <div class="position-sticky">
                    <div class="text-center mb-4 d-none d-md-block">
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
                                    <div class="col-md-3 col-6">
                                        <select class="form-select" id="dentalSortBy">
                                            <option value="timestamp">Sort by Date</option>
                                            <option value="name">Sort by Name</option>
                                            <option value="email">Sort by Email</option>
                                            <option value="service">Sort by Service</option>
                                        </select>
                                    </div>
                                    <div class="col-md-3 col-6">
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
                                    <div class="col-md-3 col-6">
                                        <select class="form-select" id="checkupSortBy">
                                            <option value="timestamp">Sort by Date</option>
                                            <option value="fullname">Sort by Name</option>
                                            <option value="email">Sort by Email</option>
                                            <option value="service">Sort by Service</option>
                                        </select>
                                    </div>
                                    <div class="col-md-3 col-6">
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

    <!-- Message Modal -->
    <div class="modal fade message-modal" id="messageModal" tabindex="-1" aria-labelledby="messageModalLabel" aria-hidden="true">
        <div class="modal-dialog">
            <div class="modal-content">
                <div class="modal-header">
                    <h5 class="modal-title" id="messageModalLabel">Message</h5>
                    <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
                </div>
                <div class="modal-body" id="messageModalBody">
                </div>
                <div class="modal-footer">
                    <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Close</button>
                </div>
            </div>
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

        function truncateText(text, maxLength = 50) {
            if (!text) return '-';
            if (text.length <= maxLength) return text;
            return text.substring(0, maxLength) + '...';
        }

        function showMessage(message) {
            const modalBody = document.getElementById('messageModalBody');
            modalBody.textContent = message || 'No message provided';
            
            const modal = new bootstrap.Modal(document.getElementById('messageModal'));
            modal.show();
        }

        // Mobile sidebar toggle
        function toggleSidebar() {
            const sidebar = document.getElementById('sidebar');
            const overlay = document.getElementById('sidebarOverlay');
            
            sidebar.classList.toggle('show');
            
            if (sidebar.classList.contains('show')) {
                overlay.style.display = 'block';
            } else {
                overlay.style.display = 'none';
            }
        }

        // Dashboard functions
        async function loadDashboardData() {
            try {
                document.getElementById('dentalCount').textContent = '...';
                document.getElementById('checkupCount').textContent = '...';
                
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
                        displayName: item.fullname
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
                            <td class="message-cell">
                                \${submission.message ? 
                                    \`<a href="#" class="view-message" data-message="\${submission.message}">\${truncateText(submission.message, 30)}</a>\` : 
                                    '-'}
                            </td>
                        </tr>
                    \`).join('');
                    
                    // Add event listeners to message links
                    document.querySelectorAll('#recentSubmissions .view-message').forEach(link => {
                        link.addEventListener('click', function(e) {
                            e.preventDefault();
                            showMessage(this.getAttribute('data-message'));
                        });
                    });
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
                            <td>\${submission.fullname || '-'}</td>
                            <td>\${submission.email || '-'}</td>
                            <td>\${submission.phone || submission.mobile || '-'}</td>
                            <td>\${submission.age || '-'}</td>
                            <td>\${submission.branch || '-'}</td>
                            <td>\${submission.service || '-'}</td>
                            <td>\${formatAppointment(submission.appointmentdate, submission.appointmenttime)}</td>
                            <td class="message-cell">
                                \${submission.message ? 
                                    \`<a href="#" class="view-message" data-message="\${submission.message}">\${truncateText(submission.message, 30)}</a>\` : 
                                    '-'}
                            </td>
                        </tr>
                    \`).join('');
                    
                    // Add event listeners to message links
                    document.querySelectorAll('#checkupSubmissions .view-message').forEach(link => {
                        link.addEventListener('click', function(e) {
                            e.preventDefault();
                            showMessage(this.getAttribute('data-message'));
                        });
                    });
                    
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
            // Mobile sidebar toggle
            document.getElementById('sidebarToggle').addEventListener('click', toggleSidebar);
            document.getElementById('sidebarOverlay').addEventListener('click', toggleSidebar);
            
            // Close sidebar when clicking a nav link on mobile
            document.querySelectorAll('.sidebar .nav-link').forEach(link => {
                link.addEventListener('click', function() {
                    if (window.innerWidth < 768) {
                        toggleSidebar();
                    }
                });
            });
            
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

const PORT = process.env.PORT || 8080;

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`CSV files will be stored in: ${DATA_DIR}`);
  console.log(`Admin dashboard available at: http://localhost:${PORT}/admin`);
});

module.exports = app;