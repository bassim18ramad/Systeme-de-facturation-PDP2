const nodemailer = require("nodemailer");

// Create reusable transporter object using the default SMTP transport
const createTransporter = async () => {
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST || "smtp.gmail.com",
    port: parseInt(process.env.SMTP_PORT || "587"),
    secure: process.env.SMTP_PORT === "465",
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });
};

const sendVerificationEmail = async (email, token) => {
  try {
    const transporter = await createTransporter();

    // Setup email data
    const verifyLink = `${process.env.CLIENT_URL || process.env.FRONTEND_URL || "http://localhost:5173"}/verify-email?token=${token}`;

    // Use the configured sender from env, or fallback to the SMTP user, or a default
    const sender =
      process.env.SMTP_FROM ||
      process.env.SMTP_USER ||
      '"Support" <support@example.com>';

    const info = await transporter.sendMail({
      from: sender, // sender address
      to: email, // list of receivers
      subject: "Verify your email address", // Subject line
      text: `Please click the link to verify your email: ${verifyLink}`, // plain text body
      html: `
        <div style="font-family: Arial, sans-serif; padding: 20px;">
          <h2>Email Verification</h2>
          <p>Thank you for registering. Please confirm your email address by clicking the link below:</p>
          <a href="${verifyLink}" style="display: inline-block; padding: 10px 20px; background-color: #007bff; color: white; text-decoration: none; border-radius: 5px;">Verify Email</a>
          <p>Or verify using this code: <strong>${token}</strong></p>
          <p>If you didn't request this, please ignore this email.</p>
        </div>
      `, // html body
    });

    console.log("Message sent: %s", info.messageId);
    console.log("Preview URL: %s", nodemailer.getTestMessageUrl(info));
    return info;
  } catch (error) {
    console.error("Error sending email:", error);
    throw error;
  }
};

const sendRecoveryEmail = async (email, token) => {
  try {
    const transporter = await createTransporter();

    // Setup email data
    const recoveryLink = `${process.env.CLIENT_URL || process.env.FRONTEND_URL || "http://localhost:5173"}/reset-password?token=${token}`;

    const sender =
      process.env.SMTP_FROM ||
      process.env.SMTP_USER ||
      '"Support" <support@example.com>';

    const info = await transporter.sendMail({
      from: sender,
      to: email,
      subject: "Réinitialisation de votre mot de passe",
      text: `Cliquez ici pour réinitialiser votre mot de passe : ${recoveryLink}`,
      html: `
        <div style="font-family: Arial, sans-serif; padding: 20px;">
          <h2>Réinitialisation du mot de passe</h2>
          <p>Vous avez demandé à réinitialiser votre mot de passe.</p>
          <p>Cliquez sur le lien ci-dessous pour choisir un nouveau mot de passe :</p>
          <a href="${recoveryLink}" style="display: inline-block; padding: 10px 20px; background-color: #007bff; color: white; text-decoration: none; border-radius: 5px;">Réinitialiser le mot de passe</a>
          <p>Si vous n'êtes pas à l'origine de cette demande, vous pouvez ignorer cet email.</p>
        </div>
      `,
    });

    console.log("Recovery email sent: %s", info.messageId);
    return info;
  } catch (error) {
    console.error("Error sending recovery email:", error);
    throw error;
  }
};

module.exports = {
  sendVerificationEmail,
  sendRecoveryEmail,
};
