# Email Setup Guide for Hangouts App

## Development Mode (Current Setup)

The app is currently configured for **development mode** where emails are logged to the console instead of being sent. This allows you to test the OTP functionality without setting up real email credentials.

### How it works:
- When a user requests an OTP, you'll see the code in your server console
- No actual emails are sent
- Perfect for development and testing

### Console Output Example:
```
🎉 === DEVELOPMENT EMAIL (OTP) ===
📧 To: user@example.com
👤 Name: John Doe
🔐 OTP Code: 123456
⏰ Expires: 10 minutes
📝 Subject: Verify Your Account - OTP Code
===============================
```

## Production Setup (Gmail SMTP)

When you're ready to send real emails in production, follow these steps:

### 1. Enable 2-Factor Authentication on Gmail
- Go to your Google Account settings
- Enable 2-Factor Authentication

### 2. Generate App Password
- Go to Google Account → Security → 2-Step Verification
- Scroll down to "App passwords"
- Generate a new app password for "Mail"
- Copy the 16-character password

### 3. Update Environment Variables
```env
NODE_ENV=production
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your-email@gmail.com
SMTP_PASS=your-16-character-app-password
SMTP_FROM="Hangouts App" <noreply@hangouts.com>
```

### 4. Alternative Email Services

#### Mailtrap (Recommended for Testing)
```env
SMTP_HOST=smtp.mailtrap.io
SMTP_PORT=2525
SMTP_USER=your-mailtrap-username
SMTP_PASS=your-mailtrap-password
```

#### SendGrid
```env
SMTP_HOST=smtp.sendgrid.net
SMTP_PORT=587
SMTP_USER=apikey
SMTP_PASS=your-sendgrid-api-key
```

#### Mailgun
```env
SMTP_HOST=smtp.mailgun.org
SMTP_PORT=587
SMTP_USER=your-mailgun-smtp-username
SMTP_PASS=your-mailgun-smtp-password
```

## Testing the OTP System

### 1. Start your server
```bash
npm run start:dev
```

### 2. Send OTP request
```bash
curl -X POST http://localhost:3000/auth/send-otp \
  -H "Content-Type: application/json" \
  -d '{"email": "test@example.com"}'
```

### 3. Check console for OTP code
Look for the console output with the 6-digit code.

### 4. Verify OTP
```bash
curl -X POST http://localhost:3000/auth/verify-otp \
  -H "Content-Type: application/json" \
  -d '{"email": "test@example.com", "otpCode": "123456"}'
```

## Troubleshooting

### Gmail "Less Secure Apps" Error
- Gmail no longer supports "less secure apps"
- You MUST use App Passwords (see step 2 above)

### "Invalid Login" Error
- Make sure you're using an App Password, not your regular Gmail password
- Ensure 2-Factor Authentication is enabled

### Development Mode Not Working
- Make sure `NODE_ENV=development` is set in your .env file
- Or ensure `SMTP_USER` is empty in your .env file

## Security Notes

- Never commit real email credentials to version control
- Use environment variables for all sensitive data
- Consider using dedicated email services for production
- App passwords are safer than regular passwords for SMTP