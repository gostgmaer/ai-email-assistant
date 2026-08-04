import { OAuthProfile } from './oauth-profile.interface';
import { OAuthTokenSet } from './oauth-token.interface';

export type OAuthProviderName = 'GOOGLE' | 'MICROSOFT';

export interface OAuthValidationResult {
  profile: OAuthProfile;
  tokens: OAuthTokenSet;
}
