import { Injectable } from '@nestjs/common';
import * as nodemailer from 'nodemailer';

@Injectable()
export class EmailService {
  private transporter: nodemailer.Transporter;

  constructor() {
    // For development, use a test account or console logging
    if (process.env.NODE_ENV === 'development' || !process.env.SMTP_USER) {
      // Development mode - log emails to console instead of sending
      this.transporter = nodemailer.createTransport({
        streamTransport: true,
        newline: 'unix',
        buffer: true
      });
    } else {
      // Production mode - use real SMTP
      this.transporter = nodemailer.createTransport({
        host: process.env.SMTP_HOST || 'smtp.gmail.com',
        port: parseInt(process.env.SMTP_PORT || '587'),
        secure: false, // true for 465, false for other ports
        auth: {
          user: process.env.SMTP_USER,
          pass: process.env.SMTP_PASS,
        },
      });
    }
  }

  async sendOTPEmail(email: string, name: string, otpCode: string): Promise<void> {
    const mailOptions = {
      from: process.env.SMTP_FROM || '"Hangouts App" <noreply@hangouts.com>',
      to: email,
      subject: 'Verify Your Account - OTP Code',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <div style="text-align: center; margin-bottom: 30px;">
            <h1 style="color: #333; margin-bottom: 10px;">🎉 Hangouts</h1>
            <h2 style="color: #666; font-weight: normal;">Account Verification</h2>
          </div>
          
          <div style="background-color: #f8f9fa; padding: 30px; border-radius: 10px; margin-bottom: 30px;">
            <p style="font-size: 16px; color: #333; margin-bottom: 20px;">
              Hi <strong>${name}</strong>,
            </p>
            
            <p style="font-size: 16px; color: #333; margin-bottom: 20px;">
              Welcome to Hangouts! To complete your account verification, please use the OTP code below:
            </p>
            
            <div style="text-align: center; margin: 30px 0;">
              <div style="background-color: #007bff; color: white; font-size: 32px; font-weight: bold; padding: 20px; border-radius: 8px; letter-spacing: 5px; display: inline-block;">
                ${otpCode}
              </div>
            </div>
            
            <p style="font-size: 14px; color: #666; text-align: center;">
              This code will expire in <strong>10 minutes</strong>
            </p>
          </div>
          
          <div style="border-top: 1px solid #eee; padding-top: 20px;">
            <p style="font-size: 14px; color: #666; margin-bottom: 10px;">
              If you didn't request this verification, please ignore this email.
            </p>
            
            <p style="font-size: 14px; color: #666;">
              Best regards,<br>
              The Hangouts Team
            </p>
          </div>
          
          <div style="text-align: center; margin-top: 30px; padding-top: 20px; border-top: 1px solid #eee;">
            <p style="font-size: 12px; color: #999;">
              This is an automated email. Please do not reply to this message.
            </p>
          </div>
        </div>
      `,
      text: `
        Hi ${name},
        
        Welcome to Hangouts! To complete your account verification, please use this OTP code: ${otpCode}
        
        This code will expire in 10 minutes.
        
        If you didn't request this verification, please ignore this email.
        
        Best regards,
        The Hangouts Team
      `,
    };

    try {
      if (process.env.NODE_ENV === 'development' || !process.env.SMTP_USER) {
        // Development mode - log email content to console
        console.log('\n🎉 === DEVELOPMENT EMAIL (OTP) ===');
        console.log(`📧 To: ${email}`);
        console.log(`👤 Name: ${name}`);
        console.log(`🔐 OTP Code: ${otpCode}`);
        console.log(`⏰ Expires: 10 minutes`);
        console.log('📝 Subject:', mailOptions.subject);
        console.log('===============================\n');
      } else {
        // Production mode - actually send email
        await this.transporter.sendMail(mailOptions);
        console.log(`OTP email sent successfully to ${email}`);
      }
    } catch (error) {
      console.error('Error sending OTP email:', error);
      throw new Error('Failed to send verification email');
    }
  }

  async sendWelcomeEmail(email: string, name: string): Promise<void> {
    const mailOptions = {
      from: process.env.SMTP_FROM || '"Hangouts App" <noreply@hangouts.com>',
      to: email,
      subject: 'Welcome to Hangouts! 🎉',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <div style="text-align: center; margin-bottom: 30px;">
            <h1 style="color: #333; margin-bottom: 10px;">🎉 Welcome to Hangouts!</h1>
          </div>
          
          <div style="background-color: #f8f9fa; padding: 30px; border-radius: 10px; margin-bottom: 30px;">
            <p style="font-size: 16px; color: #333; margin-bottom: 20px;">
              Hi <strong>${name}</strong>,
            </p>
            
            <p style="font-size: 16px; color: #333; margin-bottom: 20px;">
              Congratulations! Your account has been successfully verified. You can now:
            </p>
            
            <ul style="font-size: 16px; color: #333; margin-bottom: 20px;">
              <li>Create amazing hangouts</li>
              <li>Join events that interest you</li>
              <li>Connect with like-minded people</li>
              <li>Chat with other attendees</li>
            </ul>
            
            <div style="text-align: center; margin: 30px 0;">
              <a href="${process.env.FRONTEND_URL || 'http://localhost:4200'}" 
                 style="background-color: #007bff; color: white; padding: 15px 30px; text-decoration: none; border-radius: 5px; font-weight: bold;">
                Start Exploring Hangouts
              </a>
            </div>
          </div>
          
          <div style="border-top: 1px solid #eee; padding-top: 20px;">
            <p style="font-size: 14px; color: #666;">
              Best regards,<br>
              The Hangouts Team
            </p>
          </div>
        </div>
      `,
    };

    try {
      if (process.env.NODE_ENV === 'development' || !process.env.SMTP_USER) {
        // Development mode - log email content to console
        console.log('\n🎉 === DEVELOPMENT EMAIL (WELCOME) ===');
        console.log(`📧 To: ${email}`);
        console.log(`👤 Name: ${name}`);
        console.log(`🎊 Welcome to Hangouts!`);
        console.log(`📝 Subject:`, mailOptions.subject);
        console.log('====================================\n');
      } else {
        // Production mode - actually send email
        await this.transporter.sendMail(mailOptions);
        console.log(`Welcome email sent successfully to ${email}`);
      }
    } catch (error) {
      console.error('Error sending welcome email:', error);
      // Don't throw error for welcome email as it's not critical
    }
  }

  generateOTP(): string {
    return Math.floor(100000 + Math.random() * 900000).toString();
  }
}