import { Params } from 'nestjs-pino';
import { randomUUID } from 'crypto';

export const loggerConfig: Params = {
  pinoHttp: {
    level: process.env.LOG_LEVEL ?? 'debug',

    transport:
      process.env.NODE_ENV !== 'production'
        ? {
            target: 'pino-pretty',
            options: {
              colorize: true,
              singleLine: false,
              translateTime: 'SYS:standard',
              ignore: 'pid,hostname',
            },
          }
        : undefined,

    genReqId: (req) => req.headers['x-request-id'] ?? randomUUID(),

    autoLogging: true,

    redact: [
      'req.headers.authorization',
      'req.headers.cookie',
      'req.body.password',
      'req.body.accessToken',
      'req.body.refreshToken',
    ],
  },
};
