import { UnauthorizedException } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import type { Profile } from 'passport-google-oauth20';

import { GoogleStrategy } from './google.strategy';
import type { OAuthStateStore } from '../services/oauth-state.store';

describe('GoogleStrategy', () => {
  function buildStrategy() {
    const configService = {
      getOrThrow: jest.fn((key: string) => {
        const values: Record<string, string> = {
          GOOGLE_CLIENT_ID: 'client-id',
          GOOGLE_CLIENT_SECRET: 'client-secret',
          GOOGLE_CALLBACK_URL: 'https://api.example.com/auth/google/callback',
        };
        return values[key];
      }),
    } as unknown as ConfigService;

    const stateStore = {} as OAuthStateStore;

    return new GoogleStrategy(configService, stateStore);
  }

  function buildProfile(overrides?: Partial<Profile>): Profile {
    return {
      id: 'google-user-1',
      displayName: 'Ada Lovelace',
      emails: [{ value: 'ada@example.com', verified: true }],
      photos: [{ value: 'https://example.com/ada.png' }],
      ...overrides,
    } as Profile;
  }

  describe('validate', () => {
    it('maps a Google profile to a normalized OAuth validation result', () => {
      const strategy = buildStrategy();

      const result = strategy.validate(
        'access-token',
        'refresh-token',
        buildProfile(),
      );

      expect(result).toEqual({
        profile: {
          provider: 'GOOGLE',
          providerId: 'google-user-1',
          email: 'ada@example.com',
          displayName: 'Ada Lovelace',
          avatar: 'https://example.com/ada.png',
        },
        tokens: {
          accessToken: 'access-token',
          refreshToken: 'refresh-token',
        },
      });
    });

    it('rejects a Google account with no accessible email address', () => {
      const strategy = buildStrategy();

      expect(() =>
        strategy.validate(
          'access-token',
          'refresh-token',
          buildProfile({ emails: [] }),
        ),
      ).toThrow(UnauthorizedException);
    });

    it('omits the avatar when the profile has no photo', () => {
      const strategy = buildStrategy();

      const result = strategy.validate(
        'access-token',
        'refresh-token',
        buildProfile({ photos: undefined }),
      );

      expect(result.profile.avatar).toBeUndefined();
    });

    it('normalizes an empty-string refresh token (no new grant) to undefined', () => {
      const strategy = buildStrategy();

      const result = strategy.validate('access-token', '', buildProfile());

      expect(result.tokens.refreshToken).toBeUndefined();
    });
  });
});
