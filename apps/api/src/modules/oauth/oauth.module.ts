import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PassportModule } from '@nestjs/passport';

import { GoogleAuthGuard } from './guards/google-auth.guard';
import { MicrosoftAuthGuard } from './guards/microsoft-auth.guard';
import { OAuthStateStore } from './services/oauth-state.store';
import { GoogleStrategy } from './strategies/google.strategy';
import { MicrosoftStrategy } from './strategies/microsoft.strategy';

@Module({
  imports: [ConfigModule, PassportModule],

  providers: [
    OAuthStateStore,
    GoogleStrategy,
    MicrosoftStrategy,
    GoogleAuthGuard,
    MicrosoftAuthGuard,
  ],

  exports: [GoogleAuthGuard, MicrosoftAuthGuard],
})
export class OAuthModule {}
