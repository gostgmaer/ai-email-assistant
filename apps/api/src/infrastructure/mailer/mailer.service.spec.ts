import nodemailer from 'nodemailer';

import { MailerService } from './mailer.service';

jest.mock('nodemailer', () => ({
  __esModule: true,
  default: { createTransport: jest.fn(() => ({ sendMail: jest.fn() })) },
}));

describe('MailerService', () => {
  const createTransport = nodemailer.createTransport as jest.Mock;

  function build(env: Record<string, string | undefined>) {
    const configService = {
      get: jest.fn((key: string) => env[key]),
      getOrThrow: jest.fn((key: string) => env[key]),
    };
    return new MailerService(configService as never);
  }

  beforeEach(() => createTransport.mockClear());

  it('reads SMTP_SECURE="false" as false, not as a truthy string', () => {
    build({ SMTP_HOST: 'mailpit', SMTP_PORT: '1025', SMTP_SECURE: 'false' });

    expect(createTransport).toHaveBeenCalledWith(
      expect.objectContaining({ host: 'mailpit', port: 1025, secure: false }),
    );
  });

  it('turns TLS on only for SMTP_SECURE="true"', () => {
    build({ SMTP_HOST: 'smtp.example.com', SMTP_SECURE: 'true' });

    expect(createTransport).toHaveBeenCalledWith(
      expect.objectContaining({ secure: true }),
    );
  });

  it('defaults to port 587 without TLS when only SMTP_HOST is set', () => {
    build({ SMTP_HOST: 'smtp.example.com' });

    expect(createTransport).toHaveBeenCalledWith(
      expect.objectContaining({ port: 587, secure: false, auth: undefined }),
    );
  });

  it('does not create a transport without SMTP_HOST', () => {
    build({});

    expect(createTransport).not.toHaveBeenCalled();
  });
});
