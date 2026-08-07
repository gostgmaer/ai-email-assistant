import { Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

@Injectable()
export class GoogleAuthGuard extends AuthGuard('google') {
  getAuthenticateOptions() {
    // No forced prompt=consent (unlike the mail/calendar-connect guards):
    // that would show the consent screen on every login, not just the
    // first. accessType=offline is enough — Google issues a refresh token
    // on first grant (or whenever a not-yet-granted scope is requested,
    // which is exactly what happens for existing users the first time
    // they log in after LOGIN_SCOPES grew to include Gmail/Calendar), and
    // AuthController's auto-connect only replaces the stored refresh
    // token when one actually comes back, keeping the old one otherwise.
    return { accessType: 'offline' };
  }
}
