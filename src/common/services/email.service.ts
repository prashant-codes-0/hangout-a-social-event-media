import {
  Injectable,
  Logger,
  OnModuleInit,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomInt } from 'crypto';
import * as nodemailer from 'nodemailer';

interface MailPreview {
  label: string;
  to: string;
  subject: string;
  otpCode?: string;
  link?: string;
}

/**
 * Delivers account emails.
 *
 * When SMTP_USER and SMTP_PASS are both set, mail is sent through the real
 * SMTP server and reaches the recipient's inbox. When they are missing the
 * service falls back to printing the mail to the console, so local
 * development still works without credentials — but it never pretends that
 * fallback delivered anything.
 */
@Injectable()
export class EmailService implements OnModuleInit {
  private readonly logger = new Logger(EmailService.name);

  private readonly host: string;
  private readonly port: number;
  private readonly user: string;
  private readonly pass: string;
  private readonly from: string;
  /** Dev-only: when set, every mail is redirected here so you can inspect it. */
  private readonly overrideTo: string;
  private readonly configured: boolean;
  private readonly transporter: nodemailer.Transporter | null;

  constructor(config: ConfigService) {
    this.host = config.get<string>('SMTP_HOST', 'smtp.gmail.com');
    this.port = Number(config.get<string>('SMTP_PORT', '587'));
    this.user = (config.get<string>('SMTP_USER') ?? '').trim();
    this.pass = (config.get<string>('SMTP_PASS') ?? '').trim();

    // Gmail rejects a From domain you do not own, so default to the
    // authenticated account unless an override is supplied.
    this.from =
      (config.get<string>('SMTP_FROM') ?? '').trim() ||
      (this.user
        ? `Hangouts <${this.user}>`
        : '"Hangouts App" <noreply@hangouts.com>');

    this.overrideTo = (config.get<string>('SMTP_OVERRIDE_TO') ?? '').trim();
    this.configured = Boolean(this.user && this.pass);
    this.transporter = this.configured
      ? nodemailer.createTransport({
          host: this.host,
          port: this.port,
          secure: this.port === 465,
          requireTLS: this.port === 587,
          tls: { minVersion: 'TLSv1.2' },
          auth: { user: this.user, pass: this.pass },
        })
      : null;
  }

  async onModuleInit(): Promise<void> {
    if (!this.transporter) {
      this.logger.warn(
        'SMTP not configured — set SMTP_USER and SMTP_PASS in .env. ' +
          'Until then, emails are printed to this console instead of being delivered.',
      );
      return;
    }

    try {
      await this.transporter.verify();
      const redirect = this.overrideTo
        ? `; all mail redirected to ${this.overrideTo}`
        : '';
      this.logger.log(
        `SMTP ready: ${this.host}:${this.port} as ${this.user} → OTPs will be delivered by email${redirect}`,
      );
    } catch (error) {
      this.logger.error(
        `SMTP verify failed — no OTP will be delivered. ${this.explain(error)}`,
      );
    }
  }

  async sendOTPEmail(
    email: string,
    name: string,
    otpCode: string,
  ): Promise<void> {
    const mailOptions = {
      from: this.from,
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

    await this.deliver(mailOptions, {
      label: 'OTP',
      to: email,
      subject: mailOptions.subject,
      otpCode,
    });
  }

  async sendWelcomeEmail(email: string, name: string): Promise<void> {
    const mailOptions = {
      from: this.from,
      to: email,
      subject: 'Welcome to Hangouts! 🎉',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <div style="text-align: center; margin-bottom: 30px;">
            <h1 style="color: #333; margin-bottom: 10px;">🎉 Welcome to Hangouts!</h1>
            <h2 style="color: #666; font-weight: normal;">You're all set</h2>
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
      await this.deliver(mailOptions, {
        label: 'welcome',
        to: email,
        subject: mailOptions.subject,
      });
    } catch {
      // The welcome mail is cosmetic — a delivery failure must not block signup.
      this.logger.warn(`Welcome email to ${email} failed; continuing anyway`);
    }
  }

  async sendPasswordResetEmail(
    email: string,
    name: string,
    resetUrl: string,
    expiresMinutes: number,
  ): Promise<void> {
    const mailOptions = {
      from: this.from,
      to: email,
      subject: 'Reset Your Hangouts Password',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <div style="text-align: center; margin-bottom: 30px;">
            <h1 style="color: #333; margin-bottom: 10px;">🎉 Hangouts</h1>
            <h2 style="color: #666; font-weight: normal;">Password Reset</h2>
          </div>

          <div style="background-color: #f8f9fa; padding: 30px; border-radius: 10px; margin-bottom: 30px;">
            <p style="font-size: 16px; color: #333; margin-bottom: 20px;">
              Hi <strong>${name}</strong>,
            </p>

            <p style="font-size: 16px; color: #333; margin-bottom: 20px;">
              We received a request to reset the password for your Hangouts account.
              Choose a new one with the button below:
            </p>

            <div style="text-align: center; margin: 30px 0;">
              <a href="${resetUrl}"
                 style="background-color: #007bff; color: white; padding: 15px 30px; text-decoration: none; border-radius: 5px; font-weight: bold;">
                Reset Password
              </a>
            </div>

            <p style="font-size: 14px; color: #666; text-align: center;">
              This link expires in <strong>${expiresMinutes} minutes</strong> and can be used only once.
            </p>

            <p style="font-size: 14px; color: #666; text-align: center; word-break: break-all;">
              If the button does not work, paste this into your browser:<br>
              ${resetUrl}
            </p>
          </div>

          <div style="border-top: 1px solid #eee; padding-top: 20px;">
            <p style="font-size: 14px; color: #666; margin-bottom: 10px;">
              If you didn't ask to reset your password you can safely ignore this email — your password has not changed.
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

        We received a request to reset the password for your Hangouts account.

        Open this link to choose a new password:
        ${resetUrl}

        The link expires in ${expiresMinutes} minutes and can be used only once.

        If you didn't ask to reset your password you can safely ignore this email — your password has not changed.

        Best regards,
        The Hangouts Team
      `,
    };

    await this.deliver(mailOptions, {
      label: 'password reset',
      to: email,
      subject: mailOptions.subject,
      link: resetUrl,
    });
  }

  generateOTP(): string {
    // crypto, not Math.random: OTPs must not be predictable.
    return randomInt(0, 1000000).toString().padStart(6, '0');
  }

  private async deliver(
    mail: nodemailer.SendMailOptions,
    preview: MailPreview,
  ): Promise<string | null> {
    if (!this.transporter) {
      this.printPreview(preview);
      return null;
    }

    const originalTo = this.formatAddress(mail.to);
    if (this.overrideTo && this.overrideTo !== originalTo) {
      // Keeps the real recipient in the log so you can see who it was for.
      mail = { ...mail, to: this.overrideTo };
      this.logger.warn(
        `${preview.label}: redirecting mail for ${originalTo} to ${this.overrideTo}`,
      );
    }

    try {
      const info = (await this.transporter.sendMail(mail)) as {
        messageId?: string;
      };
      this.logger.log(
        `${preview.label} email delivered to ${originalTo} (messageId ${info.messageId ?? 'unknown'})`,
      );
      return info.messageId ?? null;
    } catch (error) {
      this.logger.error(
        `${preview.label} email to ${preview.to} failed — ${this.explain(error)}`,
      );
      throw new ServiceUnavailableException(
        'Could not send the verification email right now. Please try again shortly.',
      );
    }
  }

  /** Renders a nodemailer `to` value (string | address | array) as plain text. */
  private formatAddress(value: unknown): string {
    if (value === undefined || value === null || value === '') {
      return '(no recipient)';
    }
    const items: unknown[] = Array.isArray(value) ? value : [value];
    const rendered = items
      .map((item) => {
        if (typeof item === 'string') {
          return item;
        }
        const address = item as { name?: string; address?: string };
        if (!address.address) {
          return '';
        }
        return address.name
          ? `${address.name} <${address.address}>`
          : address.address;
      })
      .filter((item) => item !== '');
    return rendered.length > 0 ? rendered.join(', ') : '(no recipient)';
  }

  private printPreview({
    label,
    to,
    subject,
    otpCode,
    link,
  }: MailPreview): void {
    this.logger.warn(
      `SMTP is not configured, so this ${label} email was NOT delivered — it is only printed below. ` +
        'Fill SMTP_USER and SMTP_PASS in .env to send real email.',
    );
    this.logger.log(`  To: ${to}`);
    this.logger.log(`  Subject: ${subject}`);
    if (otpCode) {
      this.logger.log(`  OTP code: ${otpCode} (expires in 10 minutes)`);
    }
    if (link) {
      this.logger.log(`  Link: ${link}`);
    }
  }

  /** Turns nodemailer's raw errors into advice a human can act on. */
  private explain(error: unknown): string {
    const err = error as {
      code?: string;
      responseCode?: number;
      message?: string;
    };
    const detail = err?.message ?? String(error);
    const code = err?.code ?? '';
    const responseCode = err?.responseCode ?? 0;

    if (code === 'EAUTH' || responseCode === 535 || responseCode === 534) {
      return (
        `authentication rejected (${detail}). Gmail no longer accepts normal passwords — ` +
        'create an App Password at https://myaccount.google.com/apppasswords ' +
        '(requires 2-Step Verification) and use it as SMTP_PASS.'
      );
    }
    if (
      code === 'ECONNREFUSED' ||
      code === 'ETIMEDOUT' ||
      code === 'ECONNECTION'
    ) {
      return `cannot reach ${this.host}:${this.port} (${detail}). Check SMTP_HOST / SMTP_PORT.`;
    }
    return detail;
  }
}
