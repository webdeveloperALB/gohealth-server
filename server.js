// server.js
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const nodemailer = require('nodemailer');

const app = express();
app.use(cors());
app.use(express.json());

const transporter = nodemailer.createTransport({
  host: 'gohealthalbania.com',
  port: 465,
  secure: true, // true for 465, false for other ports
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS
  }
});

app.post('/send-email', async (req, res) => {
  try {
    const { name, email, service, date, time, department, treatment } = req.body;

    const mailOptions = {
      from: `"Website Form" <${process.env.EMAIL_USER}>`,
      to: 'clinic@gohealthalbania.com',
      subject: 'Nuova Prenotazione',
      html: `
        <h3>Nuova Prenotazione</h3>
        <p><strong>Reparto:</strong> ${department}</p>
        <p><strong>Trattamento:</strong> ${treatment}</p>
        <p><strong>Servizio Richiesto:</strong> ${service}</p>
        <p><strong>Nome:</strong> ${name}</p>
        <p><strong>Email:</strong> ${email}</p>
        <p><strong>Data:</strong> ${new Date(date).toLocaleDateString('it-IT')}</p>
        <p><strong>Ora:</strong> ${new Date(time).toLocaleTimeString('it-IT')}</p>
      `
    };

    await transporter.sendMail(mailOptions);
    res.status(200).json({ message: 'Email inviata con successo!' });
  } catch (error) {
    console.error('Error sending email:', error);
    res.status(500).json({ message: 'Errore durante l\'invio dell\'email' });
  }
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});