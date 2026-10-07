import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema, Types } from 'mongoose';

// Snapshot of the message being replied to, so the quote still shows when the original
// isn't loaded or has since been deleted
@Schema({ _id: false })
export class ReplyPreview {
  @Prop({ type: MongooseSchema.Types.ObjectId, required: true })
  messageId: Types.ObjectId;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'User' })
  userId?: Types.ObjectId;

  @Prop({ default: '' })
  authorName: string;

  // First ~140 characters of the original
  @Prop({ default: '' })
  content: string;
}

export const ReplyPreviewSchema = SchemaFactory.createForClass(ReplyPreview);

// Read receipt: who has seen the message and when
@Schema({ _id: false })
export class ReadReceipt {
  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'User', required: true })
  userId: Types.ObjectId;

  @Prop({ type: Date, required: true })
  readAt: Date;
}

export const ReadReceiptSchema = SchemaFactory.createForClass(ReadReceipt);

// An earlier version of an edited message, and when that version was written
@Schema({ _id: false })
export class MessageVersion {
  @Prop({ required: true })
  content: string;

  @Prop({ type: Date, required: true })
  writtenAt: Date;
}

export const MessageVersionSchema = SchemaFactory.createForClass(MessageVersion);

// One choice in a poll. `value` holds the machine-readable pick for polls that
// can update the hangout: an ISO date/time for "which time?" or the place text.
@Schema({ _id: true })
export class PollOption {
  _id?: Types.ObjectId;

  @Prop({ required: true })
  text: string;

  @Prop()
  value?: string;

  @Prop({ type: [{ type: MongooseSchema.Types.ObjectId, ref: 'User' }], default: [] })
  votes: Types.ObjectId[];
}

export const PollOptionSchema = SchemaFactory.createForClass(PollOption);

// A poll posted in the group chat. The organizer can turn the winning option of
// a `time` or `place` poll into the hangout's details.
@Schema({ _id: false })
export class Poll {
  @Prop({ required: true })
  question: string;

  @Prop({ type: [PollOptionSchema], default: [] })
  options: PollOption[];

  // What a winning option is allowed to change on the hangout
  @Prop({ enum: ['general', 'time', 'place'], default: 'general' })
  kind: 'general' | 'time' | 'place';

  @Prop({ enum: ['open', 'closed', 'applied'], default: 'open' })
  status: 'open' | 'closed' | 'applied';

  // Optional deadline; votes are refused after this moment
  @Prop({ type: Date })
  closesAt?: Date;

  // Winning option once the organizer applied it to the hangout
  @Prop()
  appliedValue?: string;
}

export const PollSchema = SchemaFactory.createForClass(Poll);

// flattenMaps: send `reactions` to clients as a plain { emoji: userIds[] } object
@Schema({ timestamps: true, toJSON: { flattenMaps: true } })
export class Message extends Document {
  @Prop({ type: Types.ObjectId, ref: 'Hangout', required: true })
  hangoutId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  userId: Types.ObjectId;

  @Prop({ required: true })
  content: string;

  @Prop({ default: 'text', enum: ['text', 'image', 'system', 'poll'] })
  messageType: string;

  @Prop({ default: false })
  isEdited: boolean;

  @Prop({ type: Date })
  editedAt?: Date;

  // Pinned by the hangout organizer (or an admin); at most 3 per hangout
  @Prop({ default: false })
  pinned: boolean;

  @Prop({ type: Types.ObjectId, ref: 'User' })
  pinnedBy?: Types.ObjectId;

  @Prop({ type: Date })
  pinnedAt?: Date;

  // emoji -> ids of users who reacted with it (keys are removed when their list empties)
  @Prop({ type: Map, of: [{ type: MongooseSchema.Types.ObjectId, ref: 'User' }], default: {} })
  reactions: Map<string, Types.ObjectId[]>;

  @Prop({ type: ReplyPreviewSchema })
  replyTo?: ReplyPreview;

  // Everyone except the sender who has seen it
  @Prop({ type: [ReadReceiptSchema], default: [] })
  readBy: ReadReceipt[];

  // Members tagged with @Name (validated: members of the hangout whose @Name is in the text)
  @Prop({ type: [{ type: MongooseSchema.Types.ObjectId, ref: 'User' }], default: [] })
  mentions: Types.ObjectId[];

  // Earlier versions, oldest first (last 20). Loaded only on request, so lists stay small.
  @Prop({ type: [MessageVersionSchema], default: [], select: false })
  editHistory: MessageVersion[];

  // Set when messageType is 'poll'; `content` mirrors the question so search still finds it
  @Prop({ type: PollSchema })
  poll?: Poll;

  @Prop({ default: 0 })
  editCount: number;
}

export const MessageSchema = SchemaFactory.createForClass(Message);
MessageSchema.index({ hangoutId: 1, pinned: 1, pinnedAt: 1 });
// "mark everything up to here as read" scans by hangout + time
MessageSchema.index({ hangoutId: 1, createdAt: 1 });