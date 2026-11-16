const nodemailer = require('nodemailer');

let transporter = null; // The object that knows how to talk to the mail server

const getMissingMailConfiguration = () => [
  !process.env.SMTP_HOST && 'SMTP_HOST',
  !process.env.MAIL_FROM && 'MAIL_FROM'
].filter(Boolean);

const isMailConfigured = () => getMissingMailConfiguration().length === 0;

const getTransporter = () => {
  if (!transporter) {
    const port = Number(process.env.SMTP_PORT) || 587;

    transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port,
      secure: process.env.SMTP_SECURE
        ? process.env.SMTP_SECURE === 'true'
        : port === 465,  // Port 465 uses implicit TLS.
      auth: process.env.SMTP_USER
        ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
        : undefined
    });
  }

  return transporter;
};

const sendMail = async ({ to, subject, text, html }) => {
  if (!isMailConfigured()) {
    throw new Error(`Mail configuration is missing: ${getMissingMailConfiguration().join(', ')}`);
  }

  return getTransporter().sendMail({
    from: process.env.MAIL_FROM,
    to,
    subject,
    text,
    html
  });
};

module.exports = {
  isMailConfigured,
  getMissingMailConfiguration,
  sendMail
};
