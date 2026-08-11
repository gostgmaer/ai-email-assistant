import { Module, forwardRef } from '@nestjs/common';

// Leaf-file import rather than the '../auth' barrel — that barrel
// re-exports auth.module.ts, which sits in a forwardRef() cycle with
// EmailAccountModule/CalendarModule (see documents.controller.ts's
// identical comment for the same issue). forwardRef() here is still
// required even with the leaf import — see integration.module.ts's
// comment for why: AuthModule's own load reaches this module
// transitively (through EmailAccountModule/EmailModule) before its
// class body finishes.
import { AuthModule } from '../auth/auth.module';
import { EmailAccountModule } from '../email-account';
import { EmailModule } from '../email/email.module';
import { NotificationModule } from '../notification';
import { ApprovalChainController } from './controllers/approval-chain.controller';
import { ApprovalChainService } from './services/approval-chain.service';

@Module({
  imports: [
    EmailAccountModule,
    EmailModule,
    NotificationModule,
    forwardRef(() => AuthModule),
  ],

  controllers: [ApprovalChainController],

  providers: [ApprovalChainService],

  exports: [ApprovalChainService],
})
export class ApprovalModule {}
