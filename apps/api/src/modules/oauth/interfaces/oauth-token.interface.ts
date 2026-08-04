export interface OAuthTokenSet {
  accessToken: string;
  refreshToken?: string;
  expiresAt?: Date;
}
