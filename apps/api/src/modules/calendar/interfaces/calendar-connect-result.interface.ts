import { OAuthProviderName } from '../../oauth/interfaces';

export interface CalendarConnectProfile {
  provider: Extract<OAuthProviderName, 'GOOGLE' | 'MICROSOFT'>;
  email: string;
  displayName?: string;
}

export interface CalendarConnectTokens {
  accessToken: string;
  refreshToken?: string;
  expiresAt?: Date;
}

export interface CalendarConnectResult {
  userId: string;
  profile: CalendarConnectProfile;
  tokens: CalendarConnectTokens;
}
