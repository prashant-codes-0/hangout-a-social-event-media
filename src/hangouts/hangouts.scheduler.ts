import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { HangoutsService } from './hangouts.service';

// Keeps hangout lifecycle state in sync with the clock and delivers the
// "tomorrow / in 2 hours / starting soon" reminders.
//
// Timings are deliberately staggered:
//  - lifecycle first, so a hangout that starts inside this tick is already
//    marked ongoing and is not also sent a reminder
//  - the reminder tolerance (15 min) is wider than the reminder cron (10 min),
//    so exactly one tick can ever fall inside a given window
@Injectable()
export class HangoutsScheduler implements OnModuleInit {
  private readonly logger = new Logger(HangoutsScheduler.name);

  constructor(private readonly hangouts: HangoutsService) {}

  async onModuleInit() {
    try {
      await this.hangouts.backfillLegacyStatuses();
      // Catch up on anything missed while the server was down
      await this.hangouts.syncStatuses();
      await this.hangouts.sendDueReminders();
    } catch (error) {
      this.logger.error(`Startup catch-up failed: ${(error as Error).message}`);
    }
  }

  @Cron(CronExpression.EVERY_5_MINUTES, { name: 'hangout-lifecycle' })
  async handleLifecycle() {
    try {
      await this.hangouts.syncStatuses();
    } catch (error) {
      this.logger.error(`Lifecycle sync failed: ${(error as Error).message}`);
    }
  }

  @Cron(CronExpression.EVERY_10_MINUTES, { name: 'hangout-reminders' })
  async handleReminders() {
    try {
      await this.hangouts.sendDueReminders();
    } catch (error) {
      this.logger.error(`Reminder sweep failed: ${(error as Error).message}`);
    }
  }
}