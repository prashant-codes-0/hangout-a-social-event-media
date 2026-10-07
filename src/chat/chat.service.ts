import { Injectable, NotFoundException, ForbiddenException, BadRequestException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Message } from './schemas/message.schema';

// Pinned messages per chat; pinning one more unpins the oldest
export const MAX_PINNED = 3;

// Length of the quoted text kept with a reply
const REPLY_SNIPPET_LENGTH = 140;
// Different emoji allowed on one message
const MAX_REACTION_KINDS = 20;
// A single emoji, optionally with skin tone / gender / ZWJ sequences / keycaps / flags
const EMOJI =
  /^(?:\p{Extended_Pictographic}|\p{Regional_Indicator}|[#*0-9]️?⃣)(?:\p{Emoji_Modifier}|️|‍(?:\p{Extended_Pictographic}|\p{Regional_Indicator})|\p{Regional_Indicator}|⃣)*$/u;
import { Hangout, HangoutStatus } from '../hangouts/schemas/hangout.schema';
import { User } from '../auth/schemas/user.schema';
import { SendMessageDto, EditMessageDto, CreatePollDto, VotePollDto } from './dto/chat.dto';
import { NotificationsService } from '../notifications/notifications.service';
import { NotificationType } from '../notifications/schemas/notification.schema';
import { RealtimeService } from '../realtime/realtime.service';
import { escapeRegex } from '../hangouts/hangout-search';
import { deriveHangoutStatus, formatHangoutWhen } from '../hangouts/hangout-status';
import { firstUrlIn, sanitizeAttachment } from './media.util';
import { LinkPreviewService } from './link-preview.service';
import { UploadService } from './upload.service';

// Earlier versions kept per edited message
const MAX_EDIT_HISTORY = 20;
const SEARCH_LIMIT = 30;
const MINUTE = 60 * 1000;

@Injectable()
export class ChatService {
  constructor(
    @InjectModel(Message.name)
    private messageModel: Model<Message>,
    @InjectModel(Hangout.name)
    private hangoutModel: Model<Hangout>,
    @InjectModel(User.name)
    private userModel: Model<User>,
    private notifications: NotificationsService,
    private realtime: RealtimeService,
    private linkPreviews: LinkPreviewService,
    private uploads: UploadService,
  ) {}

  async sendMessage(sendMessageDto: SendMessageDto, userId: string) {
    const { hangoutId, content, messageType = 'text', replyToId, mentions } = sendMessageDto;

    // The socket path skips the ValidationPipe, so the attachment is re-checked here
    const attachment = sanitizeAttachment(sendMessageDto.attachment);
    if (!attachment && !(content ?? '').trim()) {
      throw new BadRequestException('A message needs some text or an attachment');
    }

    // Access validation is now handled by HangoutAccessGuard at the controller level
    // Create message
    const message = new this.messageModel({
      hangoutId,
      userId,
      content: content ?? '',
      messageType: attachment ? attachment.kind : messageType,
      attachment,
      replyTo: replyToId ? await this.replyPreview(hangoutId, replyToId) : undefined,
      mentions: await this.resolveMentions(hangoutId, content ?? '', mentions, userId),
    });

    await message.save();

    // Populate user info for response
    await message.populate('userId', 'name email');

    // Fire and forget: scrape link metadata and push it when it arrives
    void this.attachLinkPreview(message);

    return message;
  }

  // Scrapes og-tags for the first link in the message and pushes the update to the
  // room. Best-effort: a slow or unreadable page never affects the message itself.
  private async attachLinkPreview(message: Message) {
    try {
      const url = firstUrlIn(message.content);
      if (!url) return;
      const preview = await this.linkPreviews.fetchPreview(url);
      if (!preview) return;
      message.linkPreview = preview;
      await message.save();
      this.realtime.emitToRoom(`hangout_${message.hangoutId.toString()}`, 'messageEdited', message.toJSON());
    } catch {
      // Previews are optional; swallow fetch/store failures
    }
  }

  // Keep only real mentions: members of this hangout (not the author) whose "@Name" is in the text.
  // The client says who was picked from the @ list; the text decides whether it still counts.
  private async resolveMentions(
    hangoutId: string,
    content: string,
    candidateIds: string[] | undefined,
    authorId: string,
  ): Promise<Types.ObjectId[]> {
    // The socket path skips DTO validation, so don't trust the shape
    const list = Array.isArray(candidateIds) ? candidateIds.slice(0, 20) : [];
    const ids = [...new Set(list)].filter(
      id => typeof id === 'string' && Types.ObjectId.isValid(id) && id !== authorId,
    );
    if (!ids.length) return [];

    const hangout = await this.hangoutModel.findById(hangoutId).select('createdBy attendees').lean();
    if (!hangout) return [];
    const members = new Set([hangout.createdBy, ...(hangout.attendees ?? [])].map(String));
    const users = await this.userModel
      .find({ _id: { $in: ids.filter(id => members.has(id)).map(id => new Types.ObjectId(id)) } })
      .select('name')
      .lean();
    const text = content.toLowerCase();
    return users
      .filter(u => u.name && text.includes('@' + u.name.toLowerCase()))
      .map(u => u._id as Types.ObjectId);
  }

  // Snapshot of the replied-to message; it must be in the same hangout
  private async replyPreview(hangoutId: string, replyToId: string) {
    // The socket path isn't covered by the HTTP ValidationPipe
    if (!Types.ObjectId.isValid(replyToId)) {
      throw new BadRequestException('Invalid message to reply to');
    }
    const original = await this.messageModel
      .findOne({ _id: replyToId, hangoutId })
      .populate('userId', 'name');
    if (!original) {
      throw new BadRequestException('The message you are replying to was not found in this hangout');
    }
    const author = original.userId as unknown as { _id: Types.ObjectId; name?: string };
    const text = original.content.replace(/\s+/g, ' ').trim();
    return {
      messageId: original._id,
      userId: author?._id,
      authorName: author?.name ?? '',
      content: text.length > REPLY_SNIPPET_LENGTH ? text.slice(0, REPLY_SNIPPET_LENGTH - 1) + '…' : text,
    };
  }

  async getMessages(hangoutId: string, userId: string, limit = 50, skip = 0, restrictHistory = false) {
    // Access validation is handled by HangoutAccessGuard
    
    // Build query
    const query: any = { hangoutId };
    
    // Option: Restrict to last 24 hours for new users
    if (restrictHistory) {
      const last24Hours = new Date();
      last24Hours.setHours(last24Hours.getHours() - 24);
      query.createdAt = { $gte: last24Hours };
    }

    return this.messageModel
      .find(query)
      .populate('userId', 'name email')
      .populate('readBy.userId', 'name')
      .sort({ createdAt: -1 })
      .limit(limit)
      .skip(skip)
      .exec();
  }

  async getRecentMessages(hangoutId: string, userId: string, hours = 24) {
    // Access validation is handled by HangoutAccessGuard
    
    const fromTime = new Date();
    fromTime.setHours(fromTime.getHours() - hours);
    
    const query = { 
      hangoutId,
      createdAt: { $gte: fromTime }
    };

    return this.messageModel
      .find(query)
      .populate('userId', 'name email')
      .populate('readBy.userId', 'name')
      .sort({ createdAt: -1 })
      .limit(50)
      .exec();
  }

  async editMessage(messageId: string, editMessageDto: EditMessageDto, userId: string, isAdmin: boolean = false) {
    const message = await this.messageModel.findById(messageId);
    
    if (!message) {
      throw new NotFoundException('Message not found');
    }

    // Admins can edit any message, regular users can only edit their own
    if (!isAdmin && message.userId.toString() !== userId) {
      throw new ForbiddenException('You can only edit your own messages');
    }

    const hangoutId = String(message.hangoutId);
    const content = editMessageDto.content;
    if (content === message.content) {
      await message.populate('userId', 'name email');
      return message;
    }

    // Mentions still in the text stay; newly tagged members are added (and alerted below)
    const before = new Set((message.mentions ?? []).map(String));
    const mentions = await this.resolveMentions(
      hangoutId,
      content,
      [...before, ...(editMessageDto.mentions ?? [])],
      String(message.userId),
    );

    // Atomic, so two quick edits can't lose a version
    // A link that's gone means its preview goes too; a new/changed link is re-scraped below
    const newPreviewUrl = firstUrlIn(content);
    const update: Record<string, any> = {
      $set: { content, isEdited: true, editedAt: new Date(), mentions },
      $inc: { editCount: 1 },
      $push: {
        editHistory: {
          $each: [{ content: message.content, writtenAt: message.editedAt ?? (message as any).createdAt }],
          $slice: -MAX_EDIT_HISTORY,
        },
      },
    };
    if (!newPreviewUrl) update.$unset = { linkPreview: '' };

    const updated = await this.messageModel
      .findOneAndUpdate(
        { _id: message._id },
        update,
        { new: true },
      )
      .populate('userId', 'name email')
      .populate('readBy.userId', 'name');
    if (!updated) throw new NotFoundException('Message not found');

    // Everyone viewing the chat sees the new text right away
    this.realtime.emitToRoom(`hangout_${hangoutId}`, 'messageEdited', updated.toJSON());

    if (newPreviewUrl && updated.linkPreview?.url !== newPreviewUrl) {
      void this.attachLinkPreview(updated);
    }

    const added = mentions.map(String).filter(id => !before.has(id));
    if (added.length) void this.notifyMentions(updated, added);
    return updated;
  }

  // Every version of a message, oldest first, ending with the current text. Members only.
  async getEditHistory(messageId: string, userId: string, isAdmin = false) {
    if (!Types.ObjectId.isValid(messageId)) throw new NotFoundException('Message not found');
    const message = await this.messageModel.findById(messageId).select('+editHistory');
    if (!message) throw new NotFoundException('Message not found');
    if (!isAdmin && !(await this.checkUserAccess(String(message.hangoutId), userId))) {
      throw new ForbiddenException('You are not a member of this hangout');
    }
    return {
      messageId: String(message._id),
      versions: [
        ...(message.editHistory ?? []).map(v => ({ content: v.content, writtenAt: v.writtenAt })),
        { content: message.content, writtenAt: message.editedAt ?? (message as any).createdAt, current: true },
      ],
    };
  }

  // Text search in one hangout's chat, newest first
  async searchMessages(hangoutId: string, query: string) {
    const text = (query ?? '').trim();
    if (text.length < 2) return { items: [] };
    const items = await this.messageModel
      .find({
        hangoutId,
        messageType: { $ne: 'system' },
        content: { $regex: escapeRegex(text.slice(0, 100)), $options: 'i' },
      })
      .sort({ createdAt: -1 })
      .limit(SEARCH_LIMIT)
      .select('content userId createdAt isEdited')
      .populate('userId', 'name')
      .lean();
    return { items };
  }

  async deleteMessage(messageId: string, userId: string, isAdmin: boolean = false) {
    const message = await this.messageModel.findById(messageId);
    
    if (!message) {
      throw new NotFoundException('Message not found');
    }

    // Admins can delete any message, regular users can only delete their own
    if (!isAdmin && message.userId.toString() !== userId) {
      throw new ForbiddenException('You can only delete your own messages');
    }

    await this.messageModel.findByIdAndDelete(messageId);

    // The stored file goes with its message (best-effort)
    if (message.attachment?.publicId) {
      void this.uploads.destroy(message.attachment.publicId, message.attachment.mimeType);
    }

    // Drop it from everyone's pinned bar
    if (message.pinned) {
      this.realtime.emitToRoom(`hangout_${message.hangoutId}`, 'messagePinned', {
        hangoutId: message.hangoutId.toString(),
        messageId,
        pinned: false,
      });
    }

    return { message: 'Message deleted successfully', messageId };
  }

  // ---- Pinned messages (organizer or admin; at most MAX_PINNED per hangout) ----

  async setPinned(messageId: string, userId: string, pinned: boolean, isAdmin = false) {
    if (!Types.ObjectId.isValid(messageId)) {
      throw new NotFoundException('Message not found');
    }
    const message = await this.messageModel.findById(messageId);
    if (!message) {
      throw new NotFoundException('Message not found');
    }
    const hangout = await this.hangoutModel.findById(message.hangoutId).select('createdBy');
    if (!hangout) {
      throw new NotFoundException('Hangout not found');
    }
    if (!isAdmin && hangout.createdBy.toString() !== userId) {
      throw new ForbiddenException('Only the hangout organizer can pin messages');
    }

    // Pinning past the limit unpins the oldest pin
    const unpinnedMessageIds: string[] = [];
    if (pinned && !message.pinned) {
      const current = await this.messageModel
        .find({ hangoutId: message.hangoutId, pinned: true })
        .sort({ pinnedAt: 1 });
      for (const old of current.slice(0, Math.max(0, current.length - MAX_PINNED + 1))) {
        old.pinned = false;
        old.pinnedBy = undefined;
        old.pinnedAt = undefined;
        await old.save();
        unpinnedMessageIds.push(String(old._id));
      }
      message.pinned = true;
      message.pinnedBy = userId as any;
      message.pinnedAt = new Date();
    } else if (!pinned) {
      message.pinned = false;
      message.pinnedBy = undefined;
      message.pinnedAt = undefined;
    }
    await message.save();
    await message.populate([
      { path: 'userId', select: 'name email' },
      { path: 'pinnedBy', select: 'name' },
    ]);

    const hangoutId = message.hangoutId.toString();
    // Everyone viewing the hangout chat updates their pinned bar
    const event = { hangoutId, messageId: String(message._id), pinned: message.pinned, pinnedMessage: message, unpinnedMessageIds };
    this.realtime.emitToRoom(`hangout_${hangoutId}`, 'messagePinned', event);
    // Not "message": the response interceptor treats a top-level `message` key as the status text
    return event;
  }

  // ---- Reactions ----

  /**
   * Adds the user's reaction with this emoji, or removes it if already there.
   * Uses atomic $addToSet/$pull on `reactions.<emoji>` so two people reacting at
   * the same moment can't overwrite each other.
   */
  async toggleReaction(messageId: string, userId: string, emoji: string) {
    emoji = (emoji ?? '').trim();
    if (!EMOJI.test(emoji)) {
      throw new BadRequestException('Reactions must be a single emoji');
    }
    if (!Types.ObjectId.isValid(messageId)) {
      throw new NotFoundException('Message not found');
    }
    const message = await this.messageModel.findById(messageId).select('hangoutId reactions');
    if (!message) {
      throw new NotFoundException('Message not found');
    }
    const hangoutId = message.hangoutId.toString();
    if (!(await this.checkUserAccess(hangoutId, userId))) {
      throw new ForbiddenException('You must be part of this hangout to react');
    }

    const uid = new Types.ObjectId(userId);
    const path = `reactions.${emoji}`;
    const current = message.reactions?.get(emoji) ?? [];
    const alreadyReacted = current.some((id) => id.toString() === userId);

    if (alreadyReacted) {
      await this.messageModel.updateOne({ _id: messageId }, { $pull: { [path]: uid } });
      // Drop the emoji once nobody uses it
      await this.messageModel.updateOne({ _id: messageId, [path]: { $size: 0 } }, { $unset: { [path]: '' } });
    } else {
      if (!message.reactions?.has(emoji) && (message.reactions?.size ?? 0) >= MAX_REACTION_KINDS) {
        throw new BadRequestException(`A message can have at most ${MAX_REACTION_KINDS} different reactions`);
      }
      await this.messageModel.updateOne({ _id: messageId }, { $addToSet: { [path]: uid } });
    }

    const updated = await this.messageModel.findById(messageId).select('reactions');
    const event = {
      hangoutId,
      messageId,
      reactions: (updated?.toJSON() as unknown as { reactions?: Record<string, string[]> })?.reactions ?? {},
    };
    this.realtime.emitToRoom(`hangout_${hangoutId}`, 'messageReactions', event);
    return event;
  }

  // ---- Read receipts ----

  /**
   * Marks every message in the hangout up to (and including) `upToMessageId` as
   * read by this user, in one update, and tells everyone viewing the chat.
   * The user's own messages are skipped.
   */
  async markRead(hangoutId: string, userId: string, upToMessageId: string) {
    const upTo = await this.messageModel.findOne({ _id: upToMessageId, hangoutId }).select('createdAt');
    if (!upTo) {
      throw new NotFoundException('Message not found in this hangout');
    }
    const upToTime = (upTo as unknown as { createdAt: Date }).createdAt;
    const uid = new Types.ObjectId(userId);
    const readAt = new Date();

    const result = await this.messageModel.updateMany(
      {
        hangoutId,
        createdAt: { $lte: upToTime },
        userId: { $ne: userId },
        'readBy.userId': { $ne: uid },
      },
      { $push: { readBy: { userId: uid, readAt } } },
    );

    if (result.modifiedCount > 0) {
      const reader = await this.userModel.findById(userId).select('name').lean();
      this.realtime.emitToRoom(`hangout_${hangoutId}`, 'messagesRead', {
        hangoutId,
        reader: { _id: userId, name: reader?.name ?? '' },
        upTo: upToTime.toISOString(),
        readAt: readAt.toISOString(),
      });
    }
    return { updated: result.modifiedCount };
  }

  async getPinned(hangoutId: string) {
    return this.messageModel
      .find({ hangoutId, pinned: true })
      .sort({ pinnedAt: -1 })
      .populate('userId', 'name email')
      .populate('pinnedBy', 'name')
      .exec();
  }

  // Alert hangout members about a group message, except the sender and anyone currently viewing
  // this hangout's chat (they're in its socket room). Grouped: one unread alert per hangout.
  // Never throws: alerts must not break sending.
  async notifyGroupMessage(message: Message, senderId: string) {
    try {
      const hangoutId = message.hangoutId.toString();
      const hangout = await this.hangoutModel.findById(hangoutId).select('title attendees createdBy').lean();
      if (!hangout) return;

      const viewing = await this.realtime.userIdsInRoom(`hangout_${hangoutId}`);
      const memberIds = new Set([hangout.createdBy, ...hangout.attendees].map(id => id.toString()));
      const senderName = (message.userId as any)?.name ?? 'Someone';
      // Mentioned members get their own alert instead of the grouped one
      const mentioned = new Set((message.mentions ?? []).map(String));
      void this.notifyMentions(message, [...mentioned], hangout.title, viewing);

      await Promise.all(
        [...memberIds]
          .filter(id => id !== senderId && !viewing.has(id) && !mentioned.has(id))
          .map(id => this.notifications.notifyGrouped(id, {
            type: NotificationType.GROUP_MESSAGE,
            actorId: senderId,
            hangoutId,
            title: `New messages in ${hangout.title}`,
            body: `${senderName}: ${message.content}`,
            link: `/hangouts/details/${hangoutId}`,
          })),
      );
    } catch (error) {
      console.error('Failed to send group message alerts:', error.message);
    }
  }

  // "Asha mentioned you in Momo Friday". Skips people who are looking at the chat right now.
  private async notifyMentions(
    message: Message,
    userIds: string[],
    hangoutTitle?: string,
    viewing?: Set<string>,
  ) {
    try {
      if (!userIds.length) return;
      const hangoutId = String(message.hangoutId);
      const title =
        hangoutTitle ?? (await this.hangoutModel.findById(hangoutId).select('title').lean())?.title ?? 'a hangout';
      const watching = viewing ?? (await this.realtime.userIdsInRoom(`hangout_${hangoutId}`));
      const author = message.userId as unknown as { _id?: unknown; name?: string };
      const senderId = String(author?._id ?? message.userId);
      await Promise.all(
        userIds
          .filter(id => id !== senderId && !watching.has(id))
          .map(id =>
            this.notifications.notify(id, {
              type: NotificationType.MENTION,
              actorId: senderId,
              hangoutId,
              title: `${author?.name ?? 'Someone'} mentioned you in ${title}`,
              body: message.content,
              link: `/hangouts/details/${hangoutId}`,
            }),
          ),
      );
    } catch (error) {
      console.error('Failed to send mention alerts:', (error as Error).message);
    }
  }

  async checkUserAccess(hangoutId: string, userId: string): Promise<boolean> {
    const hangout = await this.hangoutModel.findById(hangoutId);
    if (!hangout) {
      return false;
    }

    const isAttendee = hangout.attendees.some(
      attendeeId => attendeeId.toString() === userId
    );
    const isCreator = hangout.createdBy.toString() === userId;

    return isAttendee || isCreator;
  }

  // ---- Polls ----

  /** Every poll posted in this hangout, newest first (the chat feed shows only the results). */
  async getPolls(hangoutId: string) {
    // Access validation is handled by HangoutAccessGuard
    // Polls stop voting when the hangout itself starts: flip them closed lazily on read
    await this.closePollsOfStartedHangout(hangoutId);
    return this.messageModel
      .find({ hangoutId, messageType: 'poll' })
      .populate('userId', 'name email')
      .sort({ createdAt: -1 })
      .limit(50)
      .exec();
  }

  // Polls are pointless once the hangout is underway: mark still-open polls closed.
  private async closePollsOfStartedHangout(hangoutId: string) {
    const hangout = await this.hangoutModel.findById(hangoutId).select('time').lean();
    if (!hangout?.time || hangout.time.getTime() > Date.now()) return;
    await this.messageModel.updateMany(
      { hangoutId, messageType: 'poll', 'poll.status': 'open' },
      { $set: { 'poll.status': 'closed' } },
    );
  }

  /**
   * Posts a poll as a chat message. `kind: 'time' | 'place'` polls can later be
   * applied to the hangout details by the organizer.
   */
  async createPoll(hangoutId: string, userId: string, dto: CreatePollDto) {
    if (!(await this.checkUserAccess(hangoutId, userId))) {
      throw new ForbiddenException('You must be part of this hangout to start a poll');
    }
    const kind = dto.kind ?? 'general';
    const question = (dto.question ?? '').trim();
    if (!question) {
      throw new BadRequestException('A poll needs a question');
    }

    const seen = new Set<string>();
    const options: { text: string; value?: string }[] = [];
    for (const option of dto.options) {
      const text = (option.text ?? '').trim();
      if (!text) {
        throw new BadRequestException('Poll options cannot be empty');
      }
      if (seen.has(text.toLowerCase())) {
        throw new BadRequestException('Poll options must be different');
      }
      seen.add(text.toLowerCase());
      const value = option.value?.trim();
      if (kind === 'time' && (!value || isNaN(new Date(value).getTime()))) {
        throw new BadRequestException('Every option of a time poll needs a valid date and time');
      }
      if (kind === 'place' && !value) {
        throw new BadRequestException('Every option of a place poll needs a value');
      }
      options.push({ text, value: value || undefined });
    }

    const message = new this.messageModel({
      hangoutId,
      userId,
      content: question,
      messageType: 'poll',
      poll: {
        question,
        kind,
        status: 'open',
        closesAt: dto.expiresInHours ? new Date(Date.now() + dto.expiresInHours * 3600 * 1000) : undefined,
        options: options.map(o => ({ ...o, votes: [] })),
      },
    });
    await message.save();
    await message.populate('userId', 'name email');

    // People watching the chat get it live; the creator dedupes against the HTTP response
    this.realtime.emitToRoom(`hangout_${hangoutId}`, 'newMessage', message.toJSON());
    void this.notifyGroupMessage(message, userId);
    return message;
  }

  /**
   * Records one vote (single choice): the member's vote is cleared from every
   * option first, then added to the chosen one, so changing your mind works.
   */
  async votePoll(messageId: string, userId: string, dto: VotePollDto) {
    const message = await this.loadPoll(messageId);
    const hangoutId = message.hangoutId.toString();
    if (!(await this.checkUserAccess(hangoutId, userId))) {
      throw new ForbiddenException('You must be part of this hangout to vote');
    }
    // Voting stops the moment the hangout's start time passes (same idea as closesAt)
    const hangout = await this.hangoutModel.findById(hangoutId).select('time').lean();
    if (hangout?.time && hangout.time.getTime() <= Date.now()) {
      await this.messageModel.updateMany(
        { hangoutId, messageType: 'poll', 'poll.status': 'open' },
        { $set: { 'poll.status': 'closed' } },
      );
      throw new BadRequestException('Voting is closed — this hangout has already started');
    }
    const poll = message.poll!;
    if (poll.status !== 'open') {
      throw new BadRequestException('This poll is closed');
    }
    if (poll.closesAt && poll.closesAt.getTime() < Date.now()) {
      throw new BadRequestException('Voting time is up for this poll');
    }
    const optionOid = new Types.ObjectId(dto.optionId);
    if (!poll.options.some(o => String(o._id) === dto.optionId)) {
      throw new BadRequestException('That option is not part of this poll');
    }

    const uid = new Types.ObjectId(userId);
    // One pipeline update: drop this member's vote everywhere, then record it on the pick
    const updated = await this.messageModel.findOneAndUpdate(
      { _id: message._id, 'poll.status': 'open' },
      [
        {
          $set: {
            'poll.options': {
              $map: {
                input: '$poll.options',
                as: 'opt',
                in: {
                  $mergeObjects: [
                    '$$opt',
                    {
                      votes: {
                        $let: {
                          vars: {
                            withoutMe: {
                              $filter: {
                                input: { $ifNull: ['$$opt.votes', []] },
                                as: 'v',
                                cond: { $ne: ['$$v', uid] },
                              },
                            },
                          },
                          in: {
                            $cond: [
                              { $eq: ['$$opt._id', optionOid] },
                              { $setUnion: ['$$withoutMe', [uid]] },
                              '$$withoutMe',
                            ],
                          },
                        },
                      },
                    },
                  ],
                },
              },
            },
          },
        },
      ],
      { new: true },
    );
    if (!updated) {
      throw new BadRequestException('This poll is closed');
    }

    const event = { hangoutId, messageId, poll: updated.poll };
    this.realtime.emitToRoom(`hangout_${hangoutId}`, 'pollUpdated', event);
    return event;
  }

  /** Closes voting early (poll creator, hangout organizer, or an admin). */
  async closePoll(messageId: string, userId: string, isAdmin = false) {
    const message = await this.loadPoll(messageId);
    const poll = message.poll!;
    if (poll.status !== 'open') {
      throw new BadRequestException('This poll is already closed');
    }
    const hangoutId = message.hangoutId.toString();
    const hangout = await this.hangoutModel.findById(hangoutId).select('createdBy').lean();
    if (!hangout) {
      throw new NotFoundException('Hangout not found');
    }
    const isOrganizer = String(hangout.createdBy) === userId;
    if (!isAdmin && !isOrganizer && String(message.userId) !== userId) {
      throw new ForbiddenException('Only the poll creator, the organizer, or an admin can close this poll');
    }

    poll.status = 'closed';
    message.markModified('poll');
    await message.save();

    const event = { hangoutId, messageId, poll };
    this.realtime.emitToRoom(`hangout_${hangoutId}`, 'pollUpdated', event);
    return event;
  }

  /**
   * Organizer-only: applies the winning option of a `time` or `place` poll to the
   * hangout, posts the result as a system message, and alerts the members.
   */
  async applyPoll(messageId: string, userId: string, isAdmin = false) {
    const message = await this.loadPoll(messageId);
    const poll = message.poll!;
    const hangoutId = message.hangoutId.toString();

    if (poll.kind === 'general') {
      throw new BadRequestException('This poll does not change the hangout details');
    }
    if (poll.status === 'applied') {
      throw new BadRequestException('This poll has already been applied');
    }
    const hangout = await this.hangoutModel.findById(hangoutId);
    if (!hangout) {
      throw new NotFoundException('Hangout not found');
    }
    if (!isAdmin && hangout.createdBy.toString() !== userId) {
      throw new ForbiddenException('Only the hangout organizer can apply a poll result');
    }

    const ranked = [...poll.options].sort((a, b) => b.votes.length - a.votes.length);
    const winner = ranked[0];
    if (!winner || winner.votes.length === 0) {
      throw new BadRequestException('Nobody has voted yet');
    }

    let appliedValue: string;
    const $set: Record<string, unknown> = {};
    if (poll.kind === 'place') {
      appliedValue = (winner.value ?? winner.text).trim();
      $set.place = appliedValue;
    } else {
      const start = new Date(winner.value ?? winner.text);
      if (isNaN(start.getTime())) {
        throw new BadRequestException('The winning time is not a valid date');
      }
      if (start.getTime() < Date.now() - MINUTE) {
        throw new BadRequestException('The winning time is in the past');
      }
      appliedValue = start.toISOString();
      $set.time = start;
      $set.remindersSent = [];
      $set.status = deriveHangoutStatus(start, hangout.durationMinutes, hangout.status);
    }

    const update: Record<string, unknown> = { $set };
    if (poll.kind === 'time' && $set.status !== HangoutStatus.COMPLETED) {
      update.$unset = { completedAt: '' };
    }
    await this.hangoutModel.updateOne({ _id: hangoutId }, update as any);

    poll.status = 'applied';
    poll.appliedValue = appliedValue;
    message.markModified('poll');
    await message.save();

    const whenText =
      poll.kind === 'time' ? formatHangoutWhen(new Date(appliedValue)) : appliedValue;
    const summary =
      poll.kind === 'time'
        ? `📅 Time updated from the poll: ${whenText}`
        : `📍 Place updated from the poll: ${appliedValue}`;
    const note = new this.messageModel({ hangoutId, userId, content: summary, messageType: 'system' });
    await note.save();
    await note.populate('userId', 'name email');
    this.realtime.emitToRoom(`hangout_${hangoutId}`, 'newMessage', note.toJSON());

    const event = { hangoutId, messageId, poll, applied: { kind: poll.kind, value: appliedValue, label: whenText } };
    this.realtime.emitToRoom(`hangout_${hangoutId}`, 'pollUpdated', event);
    void this.notifyHangoutUpdate(hangout, userId, event.applied);
    return event;
  }

  // Message must exist and carry a poll
  private async loadPoll(messageId: string) {
    if (!Types.ObjectId.isValid(messageId)) {
      throw new NotFoundException('Poll not found');
    }
    const message = await this.messageModel.findById(messageId).populate('userId', 'name email');
    if (!message || message.messageType !== 'poll' || !message.poll) {
      throw new NotFoundException('Poll not found');
    }
    return message;
  }

  // "New place set from the poll: ..." for everyone not watching the chat. Never throws.
  private async notifyHangoutUpdate(
    hangout: Hangout,
    actorId: string,
    applied: { kind: string; value: string; label: string },
  ) {
    try {
      const memberIds = new Set([hangout.createdBy, ...(hangout.attendees ?? [])].map(id => String(id)));
      const viewing = await this.realtime.userIdsInRoom(`hangout_${hangout._id}`);
      await Promise.all(
        [...memberIds]
          .filter(id => id !== actorId && !viewing.has(id))
          .map(id =>
            this.notifications.notify(id, {
              type: NotificationType.HANGOUT_UPDATED,
              actorId,
              hangoutId: String(hangout._id),
              title: `${hangout.title} was updated`,
              body: applied.kind === 'time' ? `New time: ${applied.label}` : `New place: ${applied.label}`,
              link: `/hangouts/details/${hangout._id}`,
            }),
          ),
      );
    } catch (error) {
      console.error('Failed to send hangout update alerts:', (error as Error).message);
    }
  }
}