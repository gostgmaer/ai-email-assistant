import { OAuthProviderName } from './oauth-provider.interface';

export interface OAuthProfile {
  provider: OAuthProviderName;
  providerId: string;
  email: string;
  displayName?: string;
  avatar?: string;
}
