"use client";

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
app.use(
  cors({
    origin: ["https://lp.gohealthalbania.com", "http://localhost:3000"],
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
    credentials: true,
  })
);

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
    const headers =
      "ID,Timestamp,Name,Email,Phone,Department,Treatment,Service,AppointmentDate,AppointmentTime\n";
    fs.writeFileSync(DENTAL_CSV_PATH, headers);
    console.log("Created dental submissions CSV file");
  }

  // Checkup CSV
  if (!fs.existsSync(CHECKUP_CSV_PATH)) {
    const headers =
      "ID,Timestamp,FullName,FirstName,LastName,Email,Mobile,Phone,Age,Address,Branch,Service,AppointmentDate,AppointmentTime,Message\n";
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
  return d.toISOString().split("T")[0]; // YYYY-MM-DD
}

// Function to format time for CSV
function formatTime(time) {
  if (!time) return "";
  const t = new Date(time);
  return t.toTimeString().split(" ")[0].substring(0, 5); // HH:MM
}

// Function to save dental form data to CSV
function saveDentalToCSV(formData) {
  const id = generateId();
  const timestamp = new Date().toISOString();

  const csvLine =
    [
      id,
      timestamp,
      formData.name || "",
      formData.email || "",
      formData.phone || "",
      formData.department || "",
      formData.treatment || "",
      formData.service || "",
      formatDate(formData.date),
      formatTime(formData.time),
    ]
      .map((field) => `"${String(field).replace(/"/g, '""')}"`)
      .join(",") + "\n";

  fs.appendFileSync(DENTAL_CSV_PATH, csvLine);
  console.log(`Dental submission saved with ID: ${id}`);
  return id;
}

// Function to save checkup form data to CSV
function saveCheckupToCSV(formData) {
  const id = generateId();
  const timestamp = new Date().toISOString();
  const fullName = `${formData.firstName || ""} ${
    formData.lastName || ""
  }`.trim();

  const csvLine =
    [
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
      formData.message || "",
    ]
      .map((field) => `"${String(field).replace(/"/g, '""')}"`)
      .join(",") + "\n";

  fs.appendFileSync(CHECKUP_CSV_PATH, csvLine);
  console.log(`Checkup submission saved with ID: ${id}`);
  return id;
}

// Function to read CSV data
function readCSV(filePath) {
  if (!fs.existsSync(filePath)) {
    return [];
  }

  const content = fs.readFileSync(filePath, "utf8");
  const lines = content.trim().split("\n");

  if (lines.length <= 1) {
    return [];
  }

  const headers = lines[0]
    .split(",")
    .map((h) => h.trim().replace(/^"(.*)"$/, "$1"));

  return lines.slice(1).map((line, index) => {
    // Handle commas within quoted fields
    const values = [];
    let inQuotes = false;
    let currentValue = "";

    for (let i = 0; i < line.length; i++) {
      const char = line[i];

      if (char === '"' && (i === 0 || line[i - 1] !== "\\")) {
        inQuotes = !inQuotes;
      } else if (char === "," && !inQuotes) {
        values.push(currentValue.replace(/^"(.*)"$/, "$1"));
        currentValue = "";
      } else {
        currentValue += char;
      }
    }

    values.push(currentValue.replace(/^"(.*)"$/, "$1"));

    const record = { _rowIndex: index + 1 }; // Store row index for editing
    headers.forEach((header, index) => {
      record[header.toLowerCase()] = values[index] || "";
    });

    return record;
  });
}

// Function to write CSV data
function writeCSV(filePath, data, headers) {
  const headerLine = headers.join(",") + "\n";
  const dataLines = data
    .map((row) => {
      return headers
        .map((header) => {
          const value = row[header.toLowerCase()] || "";
          return `"${String(value).replace(/"/g, '""')}"`;
        })
        .join(",");
    })
    .join("\n");

  fs.writeFileSync(filePath, headerLine + dataLines + "\n");
}

// Function to update record in CSV
function updateRecordInCSV(filePath, id, updatedData, headers) {
  const records = readCSV(filePath);
  const recordIndex = records.findIndex((record) => record.id === id);

  if (recordIndex === -1) {
    throw new Error("Record not found");
  }

  // Update the record
  Object.keys(updatedData).forEach((key) => {
    if (headers.map((h) => h.toLowerCase()).includes(key.toLowerCase())) {
      records[recordIndex][key.toLowerCase()] = updatedData[key];
    }
  });

  // Write back to CSV
  writeCSV(filePath, records, headers);
  return records[recordIndex];
}

// Function to delete record from CSV
function deleteRecordFromCSV(filePath, id, headers) {
  const records = readCSV(filePath);
  const recordIndex = records.findIndex((record) => record.id === id);

  if (recordIndex === -1) {
    throw new Error("Record not found");
  }

  const deletedRecord = records[recordIndex];
  records.splice(recordIndex, 1);

  // Write back to CSV
  writeCSV(filePath, records, headers);
  return deletedRecord;
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
      {
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
      }
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
      return res
        .status(400)
        .json({ message: "reCAPTCHA verification failed. Please try again." });
    }

    // Determine form type
    const formType =
      req.body.firstName || req.body.lastName ? "CHECKUP" : "DENTAL";
    console.log(`Form type detected: ${formType}`);

    // Prepare email content
    let fullName = "";
    let formattedDate = "";
    let formattedTime = "";

    if (formType === "DENTAL") {
      fullName = req.body.name || "";
      formattedDate = req.body.date
        ? new Date(req.body.date).toLocaleDateString("it-IT")
        : "";
      formattedTime = req.body.time
        ? new Date(req.body.time).toLocaleTimeString("it-IT", {
            hour: "2-digit",
            minute: "2-digit",
          })
        : "";
    } else {
      fullName = `${req.body.firstName || ""} ${
        req.body.lastName || ""
      }`.trim();
      formattedDate = req.body.selectedDate
        ? new Date(req.body.selectedDate).toLocaleDateString("it-IT")
        : "";
      formattedTime = req.body.selectedTime
        ? new Date(req.body.selectedTime).toLocaleTimeString("it-IT", {
            hour: "2-digit",
            minute: "2-digit",
          })
        : "";
    }

    // Email content
    const mailOptions = {
      from: `"Website Form" <${process.env.EMAIL_USER}>`,
      to: "clinic@gohealthalbania.com",
      subject: `Nuova Prenotazione - ${formType}`,
      html: `
        <h3>Nuova Prenotazione - ${formType}</h3>
        ${
          req.body.department
            ? `<p><strong>Reparto:</strong> ${req.body.department}</p>`
            : ""
        }
        ${
          req.body.treatment
            ? `<p><strong>Trattamento:</strong> ${req.body.treatment}</p>`
            : ""
        }
        ${
          service
            ? `<p><strong>Servizio Richiesto:</strong> ${service}</p>`
            : ""
        }
        
        <p><strong>Nome:</strong> ${fullName}</p>
        
        ${email ? `<p><strong>Email:</strong> ${email}</p>` : ""}
        ${
          req.body.phone
            ? `<p><strong>Telefono:</strong> ${req.body.phone}</p>`
            : ""
        }
        ${
          req.body.mobile
            ? `<p><strong>Cellulare:</strong> ${req.body.mobile}</p>`
            : ""
        }
        ${formattedDate ? `<p><strong>Data:</strong> ${formattedDate}</p>` : ""}
        ${formattedTime ? `<p><strong>Ora:</strong> ${formattedTime}</p>` : ""}
        
        ${req.body.age ? `<p><strong>Età:</strong> ${req.body.age}</p>` : ""}
        ${
          req.body.address
            ? `<p><strong>Indirizzo:</strong> ${req.body.address}</p>`
            : ""
        }
        ${
          req.body.branch
            ? `<p><strong>Filiale:</strong> ${req.body.branch}</p>`
            : ""
        }
        ${
          req.body.message
            ? `<p><strong>Messaggio:</strong> ${req.body.message}</p>`
            : ""
        }
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
    res
      .status(500)
      .json({ message: "Errore durante l'elaborazione della richiesta" });
  }
});

// Basic authentication middleware
function basicAuth(req, res, next) {
  // Get auth header
  const authHeader = req.headers.authorization;

  if (!authHeader) {
    res.setHeader("WWW-Authenticate", 'Basic realm="Admin Area"');
    return res.status(401).send("Authentication required");
  }

  // Parse auth header
  const auth = Buffer.from(authHeader.split(" ")[1], "base64")
    .toString()
    .split(":");
  const user = auth[0];
  const pass = auth[1];

  // Check credentials
  if (
    user === "admin" &&
    pass === (process.env.ADMIN_PASSWORD || "changeme123")
  ) {
    return next();
  }

  res.setHeader("WWW-Authenticate", 'Basic realm="Admin Area"');
  return res.status(401).send("Authentication required");
}

// API endpoints for admin dashboard
app.get("/admin/api/submissions/:formType", basicAuth, (req, res) => {
  try {
    const { formType } = req.params;
    const {
      search,
      page = 1,
      limit = 10,
      sortBy = "timestamp",
      sortOrder = "desc",
    } = req.query;

    // Determine which CSV file to read
    const csvPath =
      formType.toLowerCase() === "dental" ? DENTAL_CSV_PATH : CHECKUP_CSV_PATH;

    // Read CSV data
    let submissions = readCSV(csvPath);

    // Apply search filter if provided
    if (search) {
      const searchLower = search.toLowerCase();
      submissions = submissions.filter((sub) => {
        return Object.values(sub).some(
          (value) =>
            value && value.toString().toLowerCase().includes(searchLower)
        );
      });
    }

    // Sort data
    submissions.sort((a, b) => {
      const aValue = a[sortBy.toLowerCase()] || "";
      const bValue = b[sortBy.toLowerCase()] || "";

      if (sortOrder.toLowerCase() === "asc") {
        return aValue.localeCompare(bValue);
      } else {
        return bValue.localeCompare(aValue);
      }
    });

    // Paginate results
    const pageNum = Number.parseInt(page);
    const limitNum = Number.parseInt(limit);
    const startIndex = (pageNum - 1) * limitNum;
    const endIndex = pageNum * limitNum;

    const paginatedSubmissions = submissions.slice(startIndex, endIndex);

    res.json({
      total: submissions.length,
      page: pageNum,
      totalPages: Math.ceil(submissions.length / limitNum),
      data: paginatedSubmissions,
    });
  } catch (error) {
    console.error("Error fetching submissions:", error);
    res.status(500).json({ message: "Error fetching submissions" });
  }
});

// Get single submission by ID
app.get("/admin/api/submissions/:formType/:id", basicAuth, (req, res) => {
  try {
    const { formType, id } = req.params;
    const csvPath =
      formType.toLowerCase() === "dental" ? DENTAL_CSV_PATH : CHECKUP_CSV_PATH;

    const submissions = readCSV(csvPath);
    const submission = submissions.find((sub) => sub.id === id);

    if (!submission) {
      return res.status(404).json({ message: "Submission not found" });
    }

    res.json(submission);
  } catch (error) {
    console.error("Error fetching submission:", error);
    res.status(500).json({ message: "Error fetching submission" });
  }
});

// Update submission
app.put("/admin/api/submissions/:formType/:id", basicAuth, (req, res) => {
  try {
    const { formType, id } = req.params;
    const updatedData = req.body;

    const csvPath =
      formType.toLowerCase() === "dental" ? DENTAL_CSV_PATH : CHECKUP_CSV_PATH;
    const headers =
      formType.toLowerCase() === "dental"
        ? [
            "ID",
            "Timestamp",
            "Name",
            "Email",
            "Phone",
            "Department",
            "Treatment",
            "Service",
            "AppointmentDate",
            "AppointmentTime",
          ]
        : [
            "ID",
            "Timestamp",
            "FullName",
            "FirstName",
            "LastName",
            "Email",
            "Mobile",
            "Phone",
            "Age",
            "Address",
            "Branch",
            "Service",
            "AppointmentDate",
            "AppointmentTime",
            "Message",
          ];

    // Update timestamp
    updatedData.timestamp = new Date().toISOString();

    const updatedRecord = updateRecordInCSV(csvPath, id, updatedData, headers);

    console.log(`${formType} submission updated with ID: ${id}`);
    res.json({
      message: "Submission updated successfully",
      data: updatedRecord,
    });
  } catch (error) {
    console.error("Error updating submission:", error);
    if (error.message === "Record not found") {
      res.status(404).json({ message: "Submission not found" });
    } else {
      res.status(500).json({ message: "Error updating submission" });
    }
  }
});

// Delete submission
app.delete("/admin/api/submissions/:formType/:id", basicAuth, (req, res) => {
  try {
    const { formType, id } = req.params;

    const csvPath =
      formType.toLowerCase() === "dental" ? DENTAL_CSV_PATH : CHECKUP_CSV_PATH;
    const headers =
      formType.toLowerCase() === "dental"
        ? [
            "ID",
            "Timestamp",
            "Name",
            "Email",
            "Phone",
            "Department",
            "Treatment",
            "Service",
            "AppointmentDate",
            "AppointmentTime",
          ]
        : [
            "ID",
            "Timestamp",
            "FullName",
            "FirstName",
            "LastName",
            "Email",
            "Mobile",
            "Phone",
            "Age",
            "Address",
            "Branch",
            "Service",
            "AppointmentDate",
            "AppointmentTime",
            "Message",
          ];

    const deletedRecord = deleteRecordFromCSV(csvPath, id, headers);

    console.log(`${formType} submission deleted with ID: ${id}`);
    res.json({
      message: "Submission deleted successfully",
      data: deletedRecord,
    });
  } catch (error) {
    console.error("Error deleting submission:", error);
    if (error.message === "Record not found") {
      res.status(404).json({ message: "Submission not found" });
    } else {
      res.status(500).json({ message: "Error deleting submission" });
    }
  }
});

// Download CSV endpoint
app.get("/download-csv/:formType", basicAuth, (req, res) => {
  try {
    const { formType } = req.params;
    const csvPath =
      formType.toLowerCase() === "dental" ? DENTAL_CSV_PATH : CHECKUP_CSV_PATH;

    if (!fs.existsSync(csvPath)) {
      return res
        .status(404)
        .json({ message: `No ${formType} submissions found` });
    }

    res.setHeader("Content-Type", "text/csv");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename=${formType.toLowerCase()}_submissions.csv`
    );

    const fileStream = fs.createReadStream(csvPath);
    fileStream.pipe(res);
  } catch (error) {
    console.error("Error downloading CSV:", error);
    res.status(500).json({ message: "Error downloading CSV file" });
  }
});

// Serve the React dashboard
app.get("/admin", basicAuth, (req, res) => {
  res.send(`
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>GoHealth Admin Dashboard</title>
    <script src="https://unpkg.com/react@18/umd/react.development.js"></script>
    <script src="https://unpkg.com/react-dom@18/umd/react-dom.development.js"></script>
    <script src="https://unpkg.com/@babel/standalone/babel.min.js"></script>
    <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/css/bootstrap.min.css" rel="stylesheet">
    <link href="https://cdn.jsdelivr.net/npm/bootstrap-icons@1.11.1/font/bootstrap-icons.css" rel="stylesheet">
    <style>
        body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #f8f9fa; }
        .sidebar { background-color: #2c3e50; color: white; min-height: 100vh; padding-top: 20px; }
        .sidebar .nav-link { color: rgba(255, 255, 255, 0.8); border-radius: 0; margin-bottom: 5px; padding: 10px 15px; }
        .sidebar .nav-link:hover, .sidebar .nav-link.active { background-color: rgba(255, 255, 255, 0.1); color: white; }
        .sidebar .nav-link i { margin-right: 10px; }
        .main-content { padding: 20px; }
        .card { border-radius: 10px; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1); margin-bottom: 20px; border: none; }
        .dashboard-card { border-left: 4px solid; transition: transform 0.2s; }
        .dashboard-card:hover { transform: translateY(-5px); }
        .dashboard-card.dental { border-left-color: #3498db; }
        .dashboard-card.checkup { border-left-color: #e74c3c; }
        .dashboard-card .icon { font-size: 2.5rem; opacity: 0.8; }
        .dashboard-card.dental .icon { color: #3498db; }
        .dashboard-card.checkup .icon { color: #e74c3c; }
        .loading-spinner { display: none; text-align: center; padding: 20px; }
        .empty-state { text-align: center; padding: 40px 20px; color: #6c757d; }
        .empty-state i { font-size: 3rem; margin-bottom: 15px; opacity: 0.5; }
        .message-cell { max-width: 200px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .message-modal .modal-body { white-space: pre-wrap; max-height: 400px; overflow-y: auto; }
        .action-buttons { display: flex; gap: 5px; }
        .btn-sm { padding: 0.25rem 0.5rem; font-size: 0.875rem; }
    </style>
</head>
<body>
    <div id="root"></div>
    
    <script type="text/babel">
        const { useState, useEffect, useCallback } = React;
        
        // API functions
        const api = {
            async fetchSubmissions(formType, params = {}) {
                const queryString = new URLSearchParams(params).toString();
                const response = await fetch(\`/admin/api/submissions/\${formType}?\${queryString}\`);
                return response.json();
            },
            
            async fetchSubmission(formType, id) {
                const response = await fetch(\`/admin/api/submissions/\${formType}/\${id}\`);
                return response.json();
            },
            
            async updateSubmission(formType, id, data) {
                const response = await fetch(\`/admin/api/submissions/\${formType}/\${id}\`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(data)
                });
                return response.json();
            },
            
            async deleteSubmission(formType, id) {
                const response = await fetch(\`/admin/api/submissions/\${formType}/\${id}\`, {
                    method: 'DELETE'
                });
                return response.json();
            }
        };
        
        // Edit Modal Component
        function EditModal({ show, onHide, formType, submissionId, onSave }) {
            const [formData, setFormData] = useState({});
            const [loading, setLoading] = useState(false);
            
            useEffect(() => {
                if (show && submissionId) {
                    loadSubmission();
                }
            }, [show, submissionId]);
            
            const loadSubmission = async () => {
                try {
                    setLoading(true);
                    const data = await api.fetchSubmission(formType, submissionId);
                    setFormData(data);
                } catch (error) {
                    console.error('Error loading submission:', error);
                    alert('Error loading submission data');
                } finally {
                    setLoading(false);
                }
            };
            
            const handleSave = async () => {
                try {
                    setLoading(true);
                    await api.updateSubmission(formType, submissionId, formData);
                    onSave();
                    onHide();
                    alert('Submission updated successfully');
                } catch (error) {
                    console.error('Error updating submission:', error);
                    alert('Error updating submission');
                } finally {
                    setLoading(false);
                }
            };
            
            const handleChange = (field, value) => {
                setFormData(prev => ({ ...prev, [field]: value }));
            };
            
            if (!show) return null;
            
            const renderFormFields = () => {
                if (formType === 'dental') {
                    return (
                        <>
                            <div className="mb-3">
                                <label className="form-label">Name</label>
                                <input 
                                    type="text" 
                                    className="form-control" 
                                    value={formData.name || ''} 
                                    onChange={(e) => handleChange('name', e.target.value)}
                                />
                            </div>
                            <div className="mb-3">
                                <label className="form-label">Email</label>
                                <input 
                                    type="email" 
                                    className="form-control" 
                                    value={formData.email || ''} 
                                    onChange={(e) => handleChange('email', e.target.value)}
                                />
                            </div>
                            <div className="mb-3">
                                <label className="form-label">Phone</label>
                                <input 
                                    type="text" 
                                    className="form-control" 
                                    value={formData.phone || ''} 
                                    onChange={(e) => handleChange('phone', e.target.value)}
                                />
                            </div>
                            <div className="mb-3">
                                <label className="form-label">Department</label>
                                <input 
                                    type="text" 
                                    className="form-control" 
                                    value={formData.department || ''} 
                                    onChange={(e) => handleChange('department', e.target.value)}
                                />
                            </div>
                            <div className="mb-3">
                                <label className="form-label">Treatment</label>
                                <input 
                                    type="text" 
                                    className="form-control" 
                                    value={formData.treatment || ''} 
                                    onChange={(e) => handleChange('treatment', e.target.value)}
                                />
                            </div>
                            <div className="mb-3">
                                <label className="form-label">Service</label>
                                <input 
                                    type="text" 
                                    className="form-control" 
                                    value={formData.service || ''} 
                                    onChange={(e) => handleChange('service', e.target.value)}
                                />
                            </div>
                            <div className="mb-3">
                                <label className="form-label">Appointment Date</label>
                                <input 
                                    type="date" 
                                    className="form-control" 
                                    value={formData.appointmentdate || ''} 
                                    onChange={(e) => handleChange('appointmentdate', e.target.value)}
                                />
                            </div>
                            <div className="mb-3">
                                <label className="form-label">Appointment Time</label>
                                <input 
                                    type="time" 
                                    className="form-control" 
                                    value={formData.appointmenttime || ''} 
                                    onChange={(e) => handleChange('appointmenttime', e.target.value)}
                                />
                            </div>
                        </>
                    );
                } else {
                    return (
                        <>
                            <div className="row">
                                <div className="col-md-6">
                                    <div className="mb-3">
                                        <label className="form-label">First Name</label>
                                        <input 
                                            type="text" 
                                            className="form-control" 
                                            value={formData.firstname || ''} 
                                            onChange={(e) => handleChange('firstname', e.target.value)}
                                        />
                                    </div>
                                </div>
                                <div className="col-md-6">
                                    <div className="mb-3">
                                        <label className="form-label">Last Name</label>
                                        <input 
                                            type="text" 
                                            className="form-control" 
                                            value={formData.lastname || ''} 
                                            onChange={(e) => handleChange('lastname', e.target.value)}
                                        />
                                    </div>
                                </div>
                            </div>
                            <div className="mb-3">
                                <label className="form-label">Email</label>
                                <input 
                                    type="email" 
                                    className="form-control" 
                                    value={formData.email || ''} 
                                    onChange={(e) => handleChange('email', e.target.value)}
                                />
                            </div>
                            <div className="row">
                                <div className="col-md-6">
                                    <div className="mb-3">
                                        <label className="form-label">Mobile</label>
                                        <input 
                                            type="text" 
                                            className="form-control" 
                                            value={formData.mobile || ''} 
                                            onChange={(e) => handleChange('mobile', e.target.value)}
                                        />
                                    </div>
                                </div>
                                <div className="col-md-6">
                                    <div className="mb-3">
                                        <label className="form-label">Phone</label>
                                        <input 
                                            type="text" 
                                            className="form-control" 
                                            value={formData.phone || ''} 
                                            onChange={(e) => handleChange('phone', e.target.value)}
                                        />
                                    </div>
                                </div>
                            </div>
                            <div className="row">
                                <div className="col-md-6">
                                    <div className="mb-3">
                                        <label className="form-label">Age</label>
                                        <input 
                                            type="number" 
                                            className="form-control" 
                                            value={formData.age || ''} 
                                            onChange={(e) => handleChange('age', e.target.value)}
                                        />
                                    </div>
                                </div>
                                <div className="col-md-6">
                                    <div className="mb-3">
                                        <label className="form-label">Branch</label>
                                        <input 
                                            type="text" 
                                            className="form-control" 
                                            value={formData.branch || ''} 
                                            onChange={(e) => handleChange('branch', e.target.value)}
                                        />
                                    </div>
                                </div>
                            </div>
                            <div className="mb-3">
                                <label className="form-label">Address</label>
                                <input 
                                    type="text" 
                                    className="form-control" 
                                    value={formData.address || ''} 
                                    onChange={(e) => handleChange('address', e.target.value)}
                                />
                            </div>
                            <div className="mb-3">
                                <label className="form-label">Service</label>
                                <input 
                                    type="text" 
                                    className="form-control" 
                                    value={formData.service || ''} 
                                    onChange={(e) => handleChange('service', e.target.value)}
                                />
                            </div>
                            <div className="row">
                                <div className="col-md-6">
                                    <div className="mb-3">
                                        <label className="form-label">Appointment Date</label>
                                        <input 
                                            type="date" 
                                            className="form-control" 
                                            value={formData.appointmentdate || ''} 
                                            onChange={(e) => handleChange('appointmentdate', e.target.value)}
                                        />
                                    </div>
                                </div>
                                <div className="col-md-6">
                                    <div className="mb-3">
                                        <label className="form-label">Appointment Time</label>
                                        <input 
                                            type="time" 
                                            className="form-control" 
                                            value={formData.appointmenttime || ''} 
                                            onChange={(e) => handleChange('appointmenttime', e.target.value)}
                                        />
                                    </div>
                                </div>
                            </div>
                            <div className="mb-3">
                                <label className="form-label">Message</label>
                                <textarea 
                                    className="form-control" 
                                    rows="3"
                                    value={formData.message || ''} 
                                    onChange={(e) => handleChange('message', e.target.value)}
                                />
                            </div>
                        </>
                    );
                }
            };
            
            return (
                <div className="modal show d-block" style={{backgroundColor: 'rgba(0,0,0,0.5)'}}>
                    <div className="modal-dialog modal-lg">
                        <div className="modal-content">
                            <div className="modal-header">
                                <h5 className="modal-title">Edit {formType} Submission</h5>
                                <button type="button" className="btn-close" onClick={onHide}></button>
                            </div>
                            <div className="modal-body">
                                {loading ? (
                                    <div className="text-center">
                                        <div className="spinner-border" role="status">
                                            <span className="visually-hidden">Loading...</span>
                                        </div>
                                    </div>
                                ) : (
                                    renderFormFields()
                                )}
                            </div>
                            <div className="modal-footer">
                                <button type="button" className="btn btn-secondary" onClick={onHide}>Cancel</button>
                                <button type="button" className="btn btn-primary" onClick={handleSave} disabled={loading}>
                                    {loading ? 'Saving...' : 'Save Changes'}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            );
        }
        
        // Main Dashboard Component
        function Dashboard() {
            const [activeTab, setActiveTab] = useState('dashboard');
            const [dashboardData, setDashboardData] = useState({ dental: 0, checkup: 0, recent: [] });
            const [dentalData, setDentalData] = useState({ data: [], total: 0, page: 1, totalPages: 1 });
            const [checkupData, setCheckupData] = useState({ data: [], total: 0, page: 1, totalPages: 1 });
            const [loading, setLoading] = useState(false);
            const [editModal, setEditModal] = useState({ show: false, formType: '', submissionId: '' });
            
            // Search and filter states
            const [dentalFilters, setDentalFilters] = useState({ search: '', sortBy: 'timestamp', sortOrder: 'desc', page: 1 });
            const [checkupFilters, setCheckupFilters] = useState({ search: '', sortBy: 'timestamp', sortOrder: 'desc', page: 1 });
            
            const loadDashboardData = useCallback(async () => {
                try {
                    setLoading(true);
                    const [dentalResponse, checkupResponse] = await Promise.all([
                        api.fetchSubmissions('dental'),
                        api.fetchSubmissions('checkup')
                    ]);
                    
                    // Combine recent submissions
                    let recentSubmissions = [];
                    if (dentalResponse.data) {
                        recentSubmissions = [...recentSubmissions, ...dentalResponse.data.map(item => ({
                            ...item, type: 'DENTAL', displayName: item.name
                        }))];
                    }
                    if (checkupResponse.data) {
                        recentSubmissions = [...recentSubmissions, ...checkupResponse.data.map(item => ({
                            ...item, type: 'CHECKUP', displayName: item.fullname
                        }))];
                    }
                    
                    recentSubmissions.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
                    recentSubmissions = recentSubmissions.slice(0, 10);
                    
                    setDashboardData({
                        dental: dentalResponse.total,
                        checkup: checkupResponse.total,
                        recent: recentSubmissions
                    });
                } catch (error) {
                    console.error('Error loading dashboard data:', error);
                } finally {
                    setLoading(false);
                }
            }, []);
            
            const loadDentalData = useCallback(async () => {
                try {
                    setLoading(true);
                    const data = await api.fetchSubmissions('dental', dentalFilters);
                    setDentalData(data);
                } catch (error) {
                    console.error('Error loading dental data:', error);
                } finally {
                    setLoading(false);
                }
            }, [dentalFilters]);
            
            const loadCheckupData = useCallback(async () => {
                try {
                    setLoading(true);
                    const data = await api.fetchSubmissions('checkup', checkupFilters);
                    setCheckupData(data);
                } catch (error) {
                    console.error('Error loading checkup data:', error);
                } finally {
                    setLoading(false);
                }
            }, [checkupFilters]);
            
            useEffect(() => {
                if (activeTab === 'dashboard') {
                    loadDashboardData();
                } else if (activeTab === 'dental') {
                    loadDentalData();
                } else if (activeTab === 'checkup') {
                    loadCheckupData();
                }
            }, [activeTab, loadDashboardData, loadDentalData, loadCheckupData]);
            
            const handleEdit = (formType, id) => {
                setEditModal({ show: true, formType, submissionId: id });
            };
            
            const handleDelete = async (formType, id) => {
                if (confirm('Are you sure you want to delete this submission?')) {
                    try {
                        await api.deleteSubmission(formType, id);
                        alert('Submission deleted successfully');
                        
                        // Reload data
                        if (formType === 'dental') {
                            loadDentalData();
                        } else {
                            loadCheckupData();
                        }
                        loadDashboardData();
                    } catch (error) {
                        console.error('Error deleting submission:', error);
                        alert('Error deleting submission');
                    }
                }
            };
            
            const handleEditSave = () => {
                // Reload data after edit
                if (editModal.formType === 'dental') {
                    loadDentalData();
                } else {
                    loadCheckupData();
                }
                loadDashboardData();
            };
            
            const formatDate = (dateString) => {
                if (!dateString) return '-';
                return new Date(dateString).toLocaleString();
            };
            
            const formatAppointment = (date, time) => {
                if (!date) return '-';
                return \`\${date} \${time || ''}\`.trim();
            };
            
            const truncateText = (text, maxLength = 50) => {
                if (!text) return '-';
                if (text.length <= maxLength) return text;
                return text.substring(0, maxLength) + '...';
            };
            
            return (
                <div className="container-fluid">
                    <div className="row">
                        {/* Sidebar */}
                        <div className="col-md-3 col-lg-2 d-md-block sidebar">
                            <div className="position-sticky">
                                <div className="text-center mb-4">
                                    <h4>GoHealth Admin</h4>
                                </div>
                                <ul className="nav flex-column">
                                    <li className="nav-item">
                                        <a className={\`nav-link \${activeTab === 'dashboard' ? 'active' : ''}\`} 
                                           href="#" onClick={() => setActiveTab('dashboard')}>
                                            <i className="bi bi-speedometer2"></i> Dashboard
                                        </a>
                                    </li>
                                    <li className="nav-item">
                                        <a className={\`nav-link \${activeTab === 'dental' ? 'active' : ''}\`} 
                                           href="#" onClick={() => setActiveTab('dental')}>
                                            <i className="bi bi-tooth"></i> Dental Submissions
                                        </a>
                                    </li>
                                    <li className="nav-item">
                                        <a className={\`nav-link \${activeTab === 'checkup' ? 'active' : ''}\`} 
                                           href="#" onClick={() => setActiveTab('checkup')}>
                                            <i className="bi bi-clipboard2-pulse"></i> Checkup Submissions
                                        </a>
                                    </li>
                                    <li className="nav-item mt-4">
                                        <a className="nav-link" href="/download-csv/dental">
                                            <i className="bi bi-download"></i> Download Dental CSV
                                        </a>
                                    </li>
                                    <li className="nav-item">
                                        <a className="nav-link" href="/download-csv/checkup">
                                            <i className="bi bi-download"></i> Download Checkup CSV
                                        </a>
                                    </li>
                                </ul>
                            </div>
                        </div>
                        
                        {/* Main content */}
                        <main className="col-md-9 ms-sm-auto col-lg-10 px-md-4 main-content">
                            {activeTab === 'dashboard' && (
                                <div>
                                    <div className="d-flex justify-content-between flex-wrap flex-md-nowrap align-items-center pt-3 pb-2 mb-3 border-bottom">
                                        <h1 className="h2">Dashboard</h1>
                                        <button className="btn btn-sm btn-outline-secondary" onClick={loadDashboardData}>
                                            <i className="bi bi-arrow-clockwise"></i> Refresh
                                        </button>
                                    </div>
                                    
                                    <div className="row">
                                        <div className="col-md-6 mb-4">
                                            <div className="card dashboard-card dental">
                                                <div className="card-body">
                                                    <div className="row">
                                                        <div className="col-8">
                                                            <h5 className="card-title">Dental Submissions</h5>
                                                            <h2>{dashboardData.dental}</h2>
                                                            <p>Total submissions</p>
                                                        </div>
                                                        <div className="col-4 text-end">
                                                            <i className="bi bi-tooth icon"></i>
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                        <div className="col-md-6 mb-4">
                                            <div className="card dashboard-card checkup">
                                                <div className="card-body">
                                                    <div className="row">
                                                        <div className="col-8">
                                                            <h5 className="card-title">Checkup Submissions</h5>
                                                            <h2>{dashboardData.checkup}</h2>
                                                            <p>Total submissions</p>
                                                        </div>
                                                        <div className="col-4 text-end">
                                                            <i className="bi bi-clipboard2-pulse icon"></i>
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                    
                                    <div className="card">
                                        <div className="card-header">Recent Submissions</div>
                                        <div className="card-body">
                                            <div className="table-responsive">
                                                <table className="table table-hover">
                                                    <thead>
                                                        <tr>
                                                            <th>Date</th>
                                                            <th>Name</th>
                                                            <th>Email</th>
                                                            <th>Type</th>
                                                            <th>Service</th>
                                                            <th>Actions</th>
                                                        </tr>
                                                    </thead>
                                                    <tbody>
                                                        {dashboardData.recent.length === 0 ? (
                                                            <tr><td colSpan="6" className="text-center">No submissions found</td></tr>
                                                        ) : (
                                                            dashboardData.recent.map(submission => (
                                                                <tr key={\`\${submission.type}-\${submission.id}\`}>
                                                                    <td>{formatDate(submission.timestamp)}</td>
                                                                    <td>{submission.displayName || '-'}</td>
                                                                    <td>{submission.email || '-'}</td>
                                                                    <td>
                                                                        <span className={\`badge \${submission.type === 'DENTAL' ? 'bg-primary' : 'bg-danger'}\`}>
                                                                            {submission.type}
                                                                        </span>
                                                                    </td>
                                                                    <td>{submission.service || '-'}</td>
                                                                    <td>
                                                                        <div className="action-buttons">
                                                                            <button 
                                                                                className="btn btn-sm btn-outline-primary"
                                                                                onClick={() => handleEdit(submission.type.toLowerCase(), submission.id)}
                                                                            >
                                                                                <i className="bi bi-pencil"></i>
                                                                            </button>
                                                                            <button 
                                                                                className="btn btn-sm btn-outline-danger"
                                                                                onClick={() => handleDelete(submission.type.toLowerCase(), submission.id)}
                                                                            >
                                                                                <i className="bi bi-trash"></i>
                                                                            </button>
                                                                        </div>
                                                                    </td>
                                                                </tr>
                                                            ))
                                                        )}
                                                    </tbody>
                                                </table>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            )}
                            
                            {activeTab === 'dental' && (
                                <div>
                                    <div className="d-flex justify-content-between flex-wrap flex-md-nowrap align-items-center pt-3 pb-2 mb-3 border-bottom">
                                        <h1 className="h2">Dental Submissions</h1>
                                        <a href="/download-csv/dental" className="btn btn-sm btn-outline-secondary">
                                            <i className="bi bi-download"></i> Download CSV
                                        </a>
                                    </div>
                                    
                                    <div className="card mb-4">
                                        <div className="card-body">
                                            <div className="row g-3">
                                                <div className="col-md-6">
                                                    <input 
                                                        type="text" 
                                                        className="form-control" 
                                                        placeholder="Search submissions..."
                                                        value={dentalFilters.search}
                                                        onChange={(e) => setDentalFilters(prev => ({ ...prev, search: e.target.value, page: 1 }))}
                                                    />
                                                </div>
                                                <div className="col-md-3">
                                                    <select 
                                                        className="form-select"
                                                        value={dentalFilters.sortBy}
                                                        onChange={(e) => setDentalFilters(prev => ({ ...prev, sortBy: e.target.value }))}
                                                    >
                                                        <option value="timestamp">Sort by Date</option>
                                                        <option value="name">Sort by Name</option>
                                                        <option value="email">Sort by Email</option>
                                                        <option value="service">Sort by Service</option>
                                                    </select>
                                                </div>
                                                <div className="col-md-3">
                                                    <select 
                                                        className="form-select"
                                                        value={dentalFilters.sortOrder}
                                                        onChange={(e) => setDentalFilters(prev => ({ ...prev, sortOrder: e.target.value }))}
                                                    >
                                                        <option value="desc">Newest First</option>
                                                        <option value="asc">Oldest First</option>
                                                    </select>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                    
                                    <div className="card">
                                        <div className="card-body">
                                            {loading ? (
                                                <div className="text-center">
                                                    <div className="spinner-border" role="status">
                                                        <span className="visually-hidden">Loading...</span>
                                                    </div>
                                                </div>
                                            ) : (
                                                <div className="table-responsive">
                                                    <table className="table table-hover">
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
                                                                <th>Actions</th>
                                                            </tr>
                                                        </thead>
                                                        <tbody>
                                                            {dentalData.data.length === 0 ? (
                                                                <tr><td colSpan="9" className="text-center">No submissions found</td></tr>
                                                            ) : (
                                                                dentalData.data.map(submission => (
                                                                    <tr key={submission.id}>
                                                                        <td>{formatDate(submission.timestamp)}</td>
                                                                        <td>{submission.name || '-'}</td>
                                                                        <td>{submission.email || '-'}</td>
                                                                        <td>{submission.phone || '-'}</td>
                                                                        <td>{submission.department || '-'}</td>
                                                                        <td>{submission.treatment || '-'}</td>
                                                                        <td>{submission.service || '-'}</td>
                                                                        <td>{formatAppointment(submission.appointmentdate, submission.appointmenttime)}</td>
                                                                        <td>
                                                                            <div className="action-buttons">
                                                                                <button 
                                                                                    className="btn btn-sm btn-outline-primary"
                                                                                    onClick={() => handleEdit('dental', submission.id)}
                                                                                >
                                                                                    <i className="bi bi-pencil"></i>
                                                                                </button>
                                                                                <button 
                                                                                    className="btn btn-sm btn-outline-danger"
                                                                                    onClick={() => handleDelete('dental', submission.id)}
                                                                                >
                                                                                    <i className="bi bi-trash"></i>
                                                                                </button>
                                                                            </div>
                                                                        </td>
                                                                    </tr>
                                                                ))
                                                            )}
                                                        </tbody>
                                                    </table>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            )}
                            
                            {activeTab === 'checkup' && (
                                <div>
                                    <div className="d-flex justify-content-between flex-wrap flex-md-nowrap align-items-center pt-3 pb-2 mb-3 border-bottom">
                                        <h1 className="h2">Checkup Submissions</h1>
                                        <a href="/download-csv/checkup" className="btn btn-sm btn-outline-secondary">
                                            <i className="bi bi-download"></i> Download CSV
                                        </a>
                                    </div>
                                    
                                    <div className="card mb-4">
                                        <div className="card-body">
                                            <div className="row g-3">
                                                <div className="col-md-6">
                                                    <input 
                                                        type="text" 
                                                        className="form-control" 
                                                        placeholder="Search submissions..."
                                                        value={checkupFilters.search}
                                                        onChange={(e) => setCheckupFilters(prev => ({ ...prev, search: e.target.value, page: 1 }))}
                                                    />
                                                </div>
                                                <div className="col-md-3">
                                                    <select 
                                                        className="form-select"
                                                        value={checkupFilters.sortBy}
                                                        onChange={(e) => setCheckupFilters(prev => ({ ...prev, sortBy: e.target.value }))}
                                                    >
                                                        <option value="timestamp">Sort by Date</option>
                                                        <option value="fullname">Sort by Name</option>
                                                        <option value="email">Sort by Email</option>
                                                        <option value="service">Sort by Service</option>
                                                    </select>
                                                </div>
                                                <div className="col-md-3">
                                                    <select 
                                                        className="form-select"
                                                        value={checkupFilters.sortOrder}
                                                        onChange={(e) => setCheckupFilters(prev => ({ ...prev, sortOrder: e.target.value }))}
                                                    >
                                                        <option value="desc">Newest First</option>
                                                        <option value="asc">Oldest First</option>
                                                    </select>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                    
                                    <div className="card">
                                        <div className="card-body">
                                            {loading ? (
                                                <div className="text-center">
                                                    <div className="spinner-border" role="status">
                                                        <span className="visually-hidden">Loading...</span>
                                                    </div>
                                                </div>
                                            ) : (
                                                <div className="table-responsive">
                                                    <table className="table table-hover">
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
                                                                <th>Actions</th>
                                                            </tr>
                                                        </thead>
                                                        <tbody>
                                                            {checkupData.data.length === 0 ? (
                                                                <tr><td colSpan="10" className="text-center">No submissions found</td></tr>
                                                            ) : (
                                                                checkupData.data.map(submission => (
                                                                    <tr key={submission.id}>
                                                                        <td>{formatDate(submission.timestamp)}</td>
                                                                        <td>{submission.fullname || '-'}</td>
                                                                        <td>{submission.email || '-'}</td>
                                                                        <td>{submission.phone || submission.mobile || '-'}</td>
                                                                        <td>{submission.age || '-'}</td>
                                                                        <td>{submission.branch || '-'}</td>
                                                                        <td>{submission.service || '-'}</td>
                                                                        <td>{formatAppointment(submission.appointmentdate, submission.appointmenttime)}</td>
                                                                        <td className="message-cell">{truncateText(submission.message, 30)}</td>
                                                                        <td>
                                                                            <div className="action-buttons">
                                                                                <button 
                                                                                    className="btn btn-sm btn-outline-primary"
                                                                                    onClick={() => handleEdit('checkup', submission.id)}
                                                                                >
                                                                                    <i className="bi bi-pencil"></i>
                                                                                </button>
                                                                                <button 
                                                                                    className="btn btn-sm btn-outline-danger"
                                                                                    onClick={() => handleDelete('checkup', submission.id)}
                                                                                >
                                                                                    <i className="bi bi-trash"></i>
                                                                                </button>
                                                                            </div>
                                                                        </td>
                                                                    </tr>
                                                                ))
                                                            )}
                                                        </tbody>
                                                    </table>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            )}
                        </main>
                    </div>
                    
                    <EditModal 
                        show={editModal.show}
                        onHide={() => setEditModal({ show: false, formType: '', submissionId: '' })}
                        formType={editModal.formType}
                        submissionId={editModal.submissionId}
                        onSave={handleEditSave}
                    />
                </div>
            );
        }
        
        ReactDOM.render(<Dashboard />, document.getElementById('root'));
    </script>
</body>
</html>
  `);
});

// Health check endpoint
app.get("/health", (req, res) => {
  res.status(200).json({
    status: "ok",
    environment: process.env.NODE_ENV || "development",
    emailTransport: transporter ? "configured" : "not configured",
    csvStorage: {
      dentalPath: DENTAL_CSV_PATH,
      checkupPath: CHECKUP_CSV_PATH,
    },
  });
});

const PORT = process.env.PORT || 8080;

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`CSV files will be stored in: ${DATA_DIR}`);
  console.log(`Admin dashboard available at: http://localhost:${PORT}/admin`);
});

module.exports = app;
