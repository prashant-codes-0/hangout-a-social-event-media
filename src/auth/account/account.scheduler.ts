import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { AccountService } from './account.service';

// Erases accounts whose 7-day deletion grace period has elapsed. Runs hourly
// (and once at startup to catch up on anything missed while the server was down).
@Injectable()
export class AccountDeletionScheduler implements OnModuleInit {
  private readonly logger = new Logger(AccountDeletionScheduler.name);

  constructor(private readonly account: AccountService) {}

  async onModuleInit() {
    try {
      const purged = await this.account.purgeDueAccounts();
      if (purged) this.logger.log(`Startup purge removed ${purged} account(s)`);
    } catch (error) {
      this.logger.error(`Startup purge failed: ${(error as Error).message}`);
    }
  }

  @Cron(CronExpression.EVERY_HOUR, { name: 'account-deletion-purge' })
  async handlePurge() {
    try {
      const purged = await this.account.purgeDueAccounts();
      if (purged) this.logger.log(`Purged ${purged} scheduled account(s)`);
    } catch (error) {
      this.logger.error(`Scheduled purge failed: ${(error as Error).message}`);
    }
  }
}
