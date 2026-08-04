import { OAuthProviderName } from '../../oauth/interfaces';

export interface MailConnectProfile {
  provider: Extract<OAuthProviderName, 'GOOGLE' | 'MICROSOFT'>;
  email: string;
  displayName?: string;
}

export interface MailConnectTokens {
  accessToken: string;
  refreshToken?: string;
  expiresAt?: Date;
}

export interface MailConnectResult {
  userId: string;
  profile: MailConnectProfile;
  tokens: MailConnectTokens;
}
