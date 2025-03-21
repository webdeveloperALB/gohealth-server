require('dotenv').config()
const express = require('express')
const cors = require('cors')
const nodemailer = require('nodemailer')

const app = express()
const corsOptions = {
  origin: [
    'https://landing-page-gohealth.vercel.app',
    'http://localhost:3000'
  ],
  methods: ['POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
};
app.use(cors(corsOptions)); // ← Now using the options
app.options('*', cors(corsOptions)); // ← Add this for preflight
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
      message = ''
    } = req.body

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

const PORT = process.env.PORT || 3001
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`)
})