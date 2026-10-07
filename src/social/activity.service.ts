import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Hangout } from '../hangouts/schemas/hangout.schema';
import { Activity, ActivityVerb } from './schemas/activity.schema';

// Writes the activity log the feed is built from. Never throws: recording activity must not
// break the action behind it (creating, joining, following).
@Injectable()
export class ActivityService implements OnModuleInit {
  private readonly logger = new Logger(ActivityService.name);

  constructor(
    @InjectModel(Activity.name) private activityModel: Model<Activity>,
    @InjectModel(Hangout.name) private hangoutModel: Model<Hangout>,
  ) {}

  async onModuleInit() {
    try {
      await this.backfillFromHangouts();
    } catch (error) {
      this.logger.error(
        `Activity backfill failed: ${(error as Error).message}`,
      );
    }
  }

  async record(
    actorId: string,
    verb: ActivityVerb,
    ref: { hangoutId?: string; targetUserId?: string },
  ) {
    try {
      const filter = this.key(actorId, verb, ref);
      if (!filter) return;
      // Doing it again moves it back to the top of the feed
      await this.activityModel.updateOne(
        filter,
        { $set: { createdAt: new Date() } },
        { upsert: true, timestamps: false },
      );
    } catch (error) {
      this.logger.error(
        `Failed to record ${verb} by ${actorId}: ${(error as Error).message}`,
      );
    }
  }

  async remove(
    actorId: string,
    verb: ActivityVerb,
    ref: { hangoutId?: string; targetUserId?: string },
  ) {
    try {
      const filter = this.key(actorId, verb, ref);
      if (filter) await this.activityModel.deleteOne(filter);
    } catch (error) {
      this.logger.error(
        `Failed to remove ${verb} by ${actorId}: ${(error as Error).message}`,
      );
    }
  }

  // The hangout was deleted: nothing about it should stay in anyone's feed
  async removeForHangout(hangoutId: string) {
    try {
      if (Types.ObjectId.isValid(hangoutId)) {
        await this.activityModel.deleteMany({
          hangoutId: new Types.ObjectId(hangoutId),
        });
      }
    } catch (error) {
      this.logger.error(
        `Failed to clear activity for ${hangoutId}: ${(error as Error).message}`,
      );
    }
  }

  private key(
    actorId: string,
    verb: ActivityVerb,
    ref: { hangoutId?: string; targetUserId?: string },
  ) {
    const ids = [actorId, ref.hangoutId, ref.targetUserId].filter(
      Boolean,
    ) as string[];
    if (!ids.every((id) => Types.ObjectId.isValid(id))) return null;
    return {
      actor: new Types.ObjectId(actorId),
      verb,
      hangoutId: ref.hangoutId ? new Types.ObjectId(ref.hangoutId) : null,
      targetUser: ref.targetUserId
        ? new Types.ObjectId(ref.targetUserId)
        : null,
    };
  }

  // First run only: seed the log from existing hangouts so feeds aren't empty on day one.
  // Join times were never stored, so "going" uses the hangout's last update as an estimate.
  async backfillFromHangouts() {
    if (await this.activityModel.estimatedDocumentCount())
      return { inserted: 0 };

    const hangouts = await this.hangoutModel
      .find({})
      .select('createdBy attendees createdAt updatedAt')
      .lean()
      .exec();

    const rows: Record<string, unknown>[] = [];
    for (const hangout of hangouts) {
      const { createdAt, updatedAt } = hangout as {
        createdAt?: Date;
        updatedAt?: Date;
      };
      const creator = String(hangout.createdBy ?? '');
      const hangoutId = hangout._id as Types.ObjectId;
      if (Types.ObjectId.isValid(creator)) {
        rows.push({
          actor: new Types.ObjectId(creator),
          verb: ActivityVerb.HOSTING,
          hangoutId,
          targetUser: null,
          createdAt: createdAt ?? new Date(),
        });
      }
      for (const attendee of new Set((hangout.attendees ?? []).map(String))) {
        if (attendee === creator || !Types.ObjectId.isValid(attendee)) continue;
        rows.push({
          actor: new Types.ObjectId(attendee),
          verb: ActivityVerb.GOING,
          hangoutId,
          targetUser: null,
          createdAt: updatedAt ?? createdAt ?? new Date(),
        });
      }
    }
    if (!rows.length) return { inserted: 0 };

    // Raw insert keeps the historical createdAt values
    await this.activityModel.collection.insertMany(rows, { ordered: false });
    this.logger.log(
      `Backfilled ${rows.length} feed activities from existing hangouts`,
    );
    return { inserted: rows.length };
  }
}
