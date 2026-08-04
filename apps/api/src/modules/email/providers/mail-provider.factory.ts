import { Injectable } from '@nestjs/common';

import { EmailAccountModel } from '../../../generated/prisma/models';
import { EmailAccountService } from '../../email-account';
import { MailProviderClient } from '../interfaces';
import { GmailClient } from './gmail.client';
import { ImapClient } from './imap.client';
import { MicrosoftGraphClient } from './microsoft-graph.client';

@Injectable()
export class MailProviderFactory {
  constructor(private readonly emailAccountService: EmailAccountService) {}

  async createClient(account: EmailAccountModel): Promise<MailProviderClient> {
    switch (account.provider) {
      case 'GOOGLE': {
        const accessToken = await this.emailAccountService.getValidAccessToken(
          account.id,
        );
        return new GmailClient(accessToken);
      }
      case 'MICROSOFT': {
        const accessToken = await this.emailAccountService.getValidAccessToken(
          account.id,
        );
        return new MicrosoftGraphClient(accessToken);
      }
      case 'IMAP': {
        const { config, password } =
          await this.emailAccountService.getImapCredentials(account.id);
        return new ImapClient(config, password);
      }
    }
  }
}
