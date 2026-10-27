import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';

import { Request, Response } from 'express';

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();

    const response = ctx.getResponse<Response>();

    const request = ctx.getRequest<Request>();

    const status =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;

    const message =
      exception instanceof HttpException
        ? exception.message
        : 'Internal server error';

    if (!(exception instanceof HttpException)) {
      // As an object, not (message, stack): nestjs-pino drops a second
      // string argument unless it looks like a stack trace, so anything
      // thrown that isn't a plain Error was logged with no cause at all.
      this.logger.error(
        { err: exception },
        `Unhandled exception on ${request.method} ${request.url}`,
      );
    }

    response.status(status).json({
      success: false,

      statusCode: status,

      path: request.url,

      method: request.method,

      timestamp: new Date().toISOString(),

      message,
    });
  }
}
