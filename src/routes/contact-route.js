import { Router } from 'express';
import nodemailer from 'nodemailer';

let cachedTransporter = null;

function getTransporter() {
  if (cachedTransporter) return cachedTransporter;

  const host = process.env.SMTP_HOST;
  const port = Number.parseInt(process.env.SMTP_PORT ?? '465', 10);
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;

  if (!host || !user || !pass) {
    return null;
  }

  cachedTransporter = nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: { user, pass },
  });

  return cachedTransporter;
}

function escapeHtml(value = '') {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function createContactRouter() {
  const router = Router();

  router.post('/contact', async (request, response) => {
    try {
      const { name = '', game = '', phone = '', email = '', message = '' } = request.body ?? {};

      // Basic validation
      if (!name || !phone || !email || !message) {
        return response.status(400).json({
          success: false,
          message: 'Missing required fields',
        });
      }

      if (String(name).length > 200 || String(message).length > 5000) {
        return response.status(400).json({
          success: false,
          message: 'Field length exceeded',
        });
      }

      const transporter = getTransporter();
      if (!transporter) {
        return response.status(503).json({
          success: false,
          message: 'Email service is not configured',
        });
      }

      const recipient = process.env.CONTACT_EMAIL_TO || 'support@matkaking.cc';
      const sender = process.env.SMTP_FROM || process.env.SMTP_USER;

      await transporter.sendMail({
        from: `MatkaKing Contact <${sender}>`,
        to: recipient,
        replyTo: email,
        subject: `Contact Form: ${name}`,
        text:
          `Customer Name: ${name}\n` +
          `Game Name: ${game}\n` +
          `Phone Number: ${phone}\n` +
          `Email: ${email}\n\n` +
          `Message:\n${message}`,
        html: `
          <h2>New Contact Form Submission</h2>
          <p><strong>Customer Name:</strong> ${escapeHtml(name)}</p>
          <p><strong>Game Name:</strong> ${escapeHtml(game)}</p>
          <p><strong>Phone Number:</strong> ${escapeHtml(phone)}</p>
          <p><strong>Email:</strong> ${escapeHtml(email)}</p>
          <p><strong>Message:</strong></p>
          <p>${escapeHtml(message).replace(/\n/g, '<br>')}</p>
        `,
      });

      return response.json({ success: true, message: 'Message sent successfully' });
    } catch (error) {
      console.error('contact_form_error', error);
      return response.status(500).json({
        success: false,
        message: 'Failed to send message. Please try again.',
      });
    }
  });

  return router;
}
