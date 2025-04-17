require("dotenv").config();
const express = require("express");
const cors = require("cors");
const nodemailer = require("nodemailer");
const axios = require("axios");

const app = express();

// Updated CORS configuration
const corsOptions = {
  origin: [
    "https://lp.gohealthalbania.com/",
    "http://localhost:3000",
    // Add any other domains that need access here
  ],
  methods: ["GET", "POST", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
  credentials: true, // Allow cookies if needed
  preflightContinue: false,
  optionsSuccessStatus: 204,
};

// Apply CORS middleware
app.use(cors(corsOptions));

// Handle OPTIONS requests explicitly
app.options("*", cors(corsOptions));

app.use(express.json());


const transporter = nodemailer.createTransport({
  host: "gohealthalbania.com",
  port: 465,
  secure: true,
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

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

      // New fields
      firstName = "",
      lastName = "",
      age = "",
      mobile = "",
      address = "",
      branch = "",
      message = "",

      // reCAPTCHA token
      recaptchaToken,
    } = req.body;

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
        ${formattedDate ? `<p><strong>Data:</strong> ${formattedDate}</p>` : ""}
        ${formattedTime ? `<p><strong>Ora:</strong> ${formattedTime}</p>` : ""}
        
        <!-- Additional fields -->
        ${age ? `<p><strong>Età:</strong> ${age}</p>` : ""}
        ${mobile ? `<p><strong>Telefono:</strong> ${mobile}</p>` : ""}
        ${address ? `<p><strong>Indirizzo:</strong> ${address}</p>` : ""}
        ${branch ? `<p><strong>Filiale:</strong> ${branch}</p>` : ""}
        ${message ? `<p><strong>Messaggio:</strong> ${message}</p>` : ""}
      `,
    };

    await transporter.sendMail(mailOptions);
    res.status(200).json({ message: "Email inviata con successo!" });
  } catch (error) {
    console.error("Error sending email:", error);
    res.status(500).json({ message: "Errore durante l'invio dell'email" });
  }
});

// Health check endpoint
app.get("/health", (req, res) => {
  res.status(200).json({ status: "ok" });
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
