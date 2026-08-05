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
          port: this.configService.getOrThrow<number>('SMTP_PORT'),
          secure: this.configService.getOrThrow<boolean>('SMTP_SECURE'),
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
