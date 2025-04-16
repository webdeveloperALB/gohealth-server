require('dotenv').config()
const express = require('express')
const cors = require('cors')
const nodemailer = require('nodemailer')
const axios = require('axios')

const app = express()
const corsOptions = {
  origin: [
    'https://landing-page-gohealth.vercel.app',
    'http://localhost:3000'
  ],
  methods: ['POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
};
app.use(cors(corsOptions));
app.options('*', cors(corsOptions));
app.use(express.json());

const transporter = nodemailer.createTransport({
  host: 'gohealthalbania.com',
  port: 465,
  secure: true,
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS
  }
})

// reCAPTCHA verification function
async function verifyCaptcha(token) {
  try {
    const response = await axios.post(
      'https://www.google.com/recaptcha/api/siteverify',
      null,
      {
        params: {
          secret: process.env.RECAPTCHA_SECRET_KEY || '6LfefxorAAAAAKT56qOeHMjJklSz5SWaehdsEAzF',
          response: token
        }
      }
    );
    
    return response.data.success;
  } catch (error) {
    console.error('reCAPTCHA verification error:', error);
    return false;
  }
}

app.post('/send-email', async (req, res) => {
  try {
    const {
      // Existing fields
      name,
      email,
      service,
      date,
      time,
      department = '',
      treatment = '',
      
      // New fields
      firstName = '',
      lastName = '',
      age = '',
      mobile = '',
      address = '',
      branch = '',
      message = '',
      
      // reCAPTCHA token
      recaptchaToken
    } = req.body;

    // Verify reCAPTCHA
    if (!recaptchaToken) {
      return res.status(400).json({ message: 'reCAPTCHA token is required' });
    }

    const isCaptchaValid = await verifyCaptcha(recaptchaToken);
    if (!isCaptchaValid) {
      return res.status(400).json({ message: 'reCAPTCHA verification failed' });
    }

    const mailOptions = {
      from: `"Website Form" <${process.env.EMAIL_USER}>`,
      to: 'clinic@gohealthalbania.com',
      subject: 'Nuova Prenotazione',
      html: `
        <h3>Nuova Prenotazione</h3>
        ${department ? `<p><strong>Reparto:</strong> ${department}</p>` : ''}
        ${treatment ? `<p><strong>Trattamento:</strong> ${treatment}</p>` : ''}
        ${service ? `<p><strong>Servizio Richiesto:</strong> ${service}</p>` : ''}
        
        ${firstName || lastName ? `
          <p><strong>Nome:</strong> ${firstName} ${lastName}</p>
        ` : name ? `<p><strong>Nome:</strong> ${name}</p>` : ''}
        
        ${email ? `<p><strong>Email:</strong> ${email}</p>` : ''}
        ${date ? `<p><strong>Data:</strong> ${new Date(date).toLocaleDateString('it-IT')}</p>` : ''}
        ${time ? `<p><strong>Ora:</strong> ${new Date(time).toLocaleTimeString('it-IT')}</p>` : ''}
        
        <!-- New fields -->
        ${age ? `<p><strong>Età:</strong> ${age}</p>` : ''}
        ${mobile ? `<p><strong>Telefono:</strong> ${mobile}</p>` : ''}
        ${address ? `<p><strong>Indirizzo:</strong> ${address}</p>` : ''}
        ${branch ? `<p><strong>Filiale:</strong> ${branch}</p>` : ''}
        ${message ? `<p><strong>Messaggio:</strong> ${message}</p>` : ''}
      `
    }

    await transporter.sendMail(mailOptions)
    res.status(200).json({ message: 'Email inviata con successo!' })
  } catch (error) {
    console.error('Error sending email:', error)
    res.status(500).json({ message: 'Errore durante l\'invio dell\'email' })
  }
})

const PORT = process.env.PORT || 5000
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`)
})