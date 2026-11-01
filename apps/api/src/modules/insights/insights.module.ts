import { forwardRef, Module } from '@nestjs/common';

// Leaf-file imports and forwardRef — same reasoning as AutomationModule's.
import { AuthModule } from '../auth/auth.module';
import { EmailAccountModule } from '../email-account/email-account.module';
import { InsightsController } from './controllers/insights.controller';
import { InsightsService } from './services/insights.service';

@Module({
  imports: [EmailAccountModule, forwardRef(() => AuthModule)],
  controllers: [InsightsController],
  providers: [InsightsService],
  exports: [InsightsService],
})
export class InsightsModule {}
