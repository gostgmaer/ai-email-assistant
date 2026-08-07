import { envSchema } from './env.schema';

export default () => {
  const parsed = envSchema.safeParse(process.env);

  if (!parsed.success) {
    console.error(parsed.error.format());
    throw new Error('Invalid environment variables.');
  }

  const env = parsed.data;

  return {
    app: {
      nodeEnv: env.NODE_ENV,
      port: env.PORT,
      logLevel: env.LOG_LEVEL,
    },

    database: {
      url: env.DATABASE_URL,
    },

    redis: {
      host: env.REDIS_HOST,
      port: env.REDIS_PORT,
      password: env.REDIS_PASSWORD,
    },

    jwt: {
      secret: env.JWT_SECRET,
      expiresIn: env.JWT_EXPIRES_IN,
      refreshExpiresIn: env.JWT_REFRESH_EXPIRES_IN,
    },

    frontendUrl: env.FRONTEND_URL,

    google: {
      clientId: env.GOOGLE_CLIENT_ID,
      clientSecret: env.GOOGLE_CLIENT_SECRET,
      callbackUrl: env.GOOGLE_CALLBACK_URL,
    },

    microsoft: {
      clientId: env.MICROSOFT_CLIENT_ID,
      clientSecret: env.MICROSOFT_CLIENT_SECRET,
      callbackUrl: env.MICROSOFT_CALLBACK_URL,
    },

    ai: {
      url: env.AI_SERVICE_URL,
      apiKey: env.AI_SERVICE_API_KEY,
    },

    fileService: {
      url: env.FILE_SERVICE_URL,
      hmacSecret: env.FILE_SERVICE_HMAC_SECRET,
      tenantId: env.FILE_SERVICE_TENANT_ID,
    },

    mailer: {
      host: env.SMTP_HOST,
      port: env.SMTP_PORT,
      secure: env.SMTP_SECURE,
      user: env.SMTP_USER,
      password: env.SMTP_PASSWORD,
      from: env.MAIL_FROM,
    },
  };
};
