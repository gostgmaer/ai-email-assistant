export interface JwtPayload {
  sub: string;
  email: string;
  /** The session (RefreshToken row) this token belongs to. JwtStrategy
   * refuses the token once that session is revoked or expired, or the user
   * is deleted. */
  sid?: string;
  /** Set only on a connect ticket (TokenService.issueConnectTicket): a
   * 60-second token for starting an OAuth connect redirect, accepted only
   * from the URL of a /connect/ route and never as an access token. */
  purpose?: 'connect';
}
