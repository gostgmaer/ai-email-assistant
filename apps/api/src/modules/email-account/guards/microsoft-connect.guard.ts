import { ExecutionContext, Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Request } from 'express';

import { JwtPayload } from '../../auth/interfaces/jwt-payload.interface';
import { ConnectStateService } from '../services/connect-state.service';

@Injectable()
export class MicrosoftConnectGuard extends AuthGuard('microsoft-connect') {
  constructor(private readonly connectStateService: ConnectStateService) {
    super();
  }

  async getAuthenticateOptions(context: ExecutionContext) {
    const req = context.switchToHttp().getRequest<Request>();

    // Callback leg: the provider's `code`/`state` drive verification, not
    // these options, and `req.user` (from JwtAuthGuard) isn't present here.
    if (req.query.code) {
      return {};
    }

    const user = req.user as JwtPayload;
    const state = await this.connectStateService.createState(
      'email-connect',
      'MICROSOFT',
      user.sub,
    );

    return { state };
  }
}
