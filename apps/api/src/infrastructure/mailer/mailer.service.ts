import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import nodemailer, { Transporter } from 'nodemailer';

@Injectable()
export class MailerService {
  private readonly logger = new Logger(MailerService.name);
  private readonly transporter: Transporter | null;
  private readonly from: string;

  constructor(private readonly configService: ConfigService) {
    const host = this.configService.get<string>('SMTP_HOST');
    this.from =
      this.configService.get<string>('MAIL_FROM') ??
      'AI Email Assistant <no-reply@localhost>';

    this.transporter = host
      ? nodemailer.createTransport({
          host,
          // Raw env strings, so parsed here: "false" is truthy, and both
          // are optional (env.schema.ts defaults them to 587 / false).
          port: Number(this.configService.get<string>('SMTP_PORT') ?? 587),
          secure: this.configService.get<string>('SMTP_SECURE') === 'true',
          auth: this.configService.get<string>('SMTP_USER')
            ? {
                user: this.configService.get<string>('SMTP_USER'),
                pass: this.configService.get<string>('SMTP_PASSWORD'),
              }
            : undefined,
        })
      : null;
  }

  async sendVerificationEmail(to: string, link: string): Promise<void> {
    await this.send(
      to,
      'Verify your email',
      `<p>Confirm your email address to finish setting up your account.</p>
       <p><a href="${link}">Verify email</a></p>`,
      `Verify your email: ${link}`,
    );
  }

  async sendPasswordResetEmail(to: string, link: string): Promise<void> {
    await this.send(
      to,
      'Reset your password',
      `<p>We received a request to reset your password.</p>
       <p><a href="${link}">Reset password</a></p>
       <p>If you didn't request this, you can ignore this email.</p>`,
      `Reset your password: ${link}`,
    );
  }

  async sendEmailChangeConfirmation(to: string, link: string): Promise<void> {
    await this.send(
      to,
      'Confirm your new email address',
      `<p>Confirm this address to finish changing the email on your account.</p>
       <p><a href="${link}">Confirm email change</a></p>`,
      `Confirm your new email address: ${link}`,
    );
  }

  /** A notification delivered by email (NotificationPreference EMAIL).
   * Title and body can contain text from incoming mail (subjects, sender
   * names), so they're escaped, never used as HTML. */
  async sendNotificationEmail(
    to: string,
    title: string,
    body: string,
  ): Promise<void> {
    const appUrl = this.configService.get<string>('FRONTEND_URL') ?? '';
    await this.send(
      to,
      title,
      `<p><strong>${escapeHtml(title)}</strong></p>
       <p>${escapeHtml(body)}</p>
       ${appUrl ? `<p><a href="${escapeHtml(appUrl)}">Open AI Email Assistant</a></p>` : ''}
       <p style="color:#71717a;font-size:12px">You can change which notifications are emailed to you in your profile settings.</p>`,
      `${title}\n\n${body}${appUrl ? `\n\n${appUrl}` : ''}`,
    );
  }

  private async send(
    to: string,
    subject: string,
    html: string,
    text: string,
  ): Promise<void> {
    if (!this.transporter) {
      this.logger.warn(
        `[DEV] SMTP not configured, not sending "${subject}" to ${to}: ${text}`,
      );
      return;
    }

    await this.transporter.sendMail({
      from: this.from,
      to,
      subject,
      html,
      text,
    });
  }
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
