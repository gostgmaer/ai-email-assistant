import { GoogleAuthGuard } from './google-auth.guard';

describe('GoogleAuthGuard', () => {
  it('requests offline access so Google returns a refresh token on first grant', () => {
    const guard = new GoogleAuthGuard();

    expect(guard.getAuthenticateOptions()).toEqual({ accessType: 'offline' });
  });
});
