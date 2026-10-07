import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { User } from '../auth/schemas/user.schema';
import { Hangout } from '../hangouts/schemas/hangout.schema';
import { PrivateChatService } from './private-chat.service';
import { Message } from './schemas/message.schema';
import { PrivateChat, PrivateChatStatus } from './schemas/private-chat.schema';
import { PrivateMessage } from './schemas/private-message.schema';

const MAX_GROUPS = 100;
const MAX_PRIVATE = 100;
const PREVIEW_LENGTH = 100;

export interface InboxItem {
  kind: 'group' | 'private';
  id: string; // hangout id (group) or private chat id
  hangoutId: string;
  title: string; // hangout title, or the other person's name
  subtitle: string;
  hangoutStatus?: string;
  lastMessage: {
    text: string;
    senderName: string;
    mine: boolean;
    createdAt: Date;
  } | null;
  unread: number;
  updatedAt: Date;
  link: string;
}

// Some ids are stored as strings and others as ObjectIds; aggregation doesn't cast, so match both
const forms = (id: unknown) => {
  const text = String(id);
  return Types.ObjectId.isValid(text)
    ? [text, new Types.ObjectId(text)]
    : [text];
};

const preview = (text: string) => {
  const clean = (text ?? '').replace(/\s+/g, ' ').trim();
  return clean.length > PREVIEW_LENGTH
    ? clean.slice(0, PREVIEW_LENGTH - 1) + '…'
    : clean;
};

// Every chat you're in (hangout group chats + accepted private chats), newest activity first,
// each with its last message and how many messages you haven't read
@Injectable()
export class InboxService {
  constructor(
    @InjectModel(Message.name) private messageModel: Model<Message>,
    @InjectModel(PrivateChat.name) private privateChatModel: Model<PrivateChat>,
    @InjectModel(PrivateMessage.name)
    private privateMessageModel: Model<PrivateMessage>,
    @InjectModel(Hangout.name) private hangoutModel: Model<Hangout>,
    @InjectModel(User.name) private userModel: Model<User>,
    private privateChats: PrivateChatService,
  ) {}

  async inbox(userId: string) {
    const [groups, privates] = await Promise.all([
      this.groupChats(userId),
      this.privateChatItems(userId),
    ]);
    const items = [...groups, ...privates].sort(
      (a, b) => b.updatedAt.getTime() - a.updatedAt.getTime(),
    );
    return {
      items,
      totalUnread: items.reduce((sum, item) => sum + item.unread, 0),
    };
  }

  private async groupChats(userId: string): Promise<InboxItem[]> {
    const me = forms(userId);
    const hangouts = await this.hangoutModel
      .find({
        $or: [
          { createdBy: { $in: me } },
          { attendees: new Types.ObjectId(userId) },
        ],
      })
      .select('title status createdAt')
      .sort({ time: -1 })
      .limit(MAX_GROUPS)
      .lean();
    if (!hangouts.length) return [];

    const stats = await this.messageModel.aggregate<{
      _id: string;
      last: { content: string; userId: unknown; createdAt: Date };
      unread: number;
    }>([
      { $match: { hangoutId: { $in: hangouts.flatMap((h) => forms(h._id)) } } },
      { $sort: { createdAt: -1 } },
      {
        $group: {
          _id: { $toString: '$hangoutId' },
          last: {
            $first: {
              content: '$content',
              userId: '$userId',
              createdAt: '$createdAt',
            },
          },
          unread: {
            $sum: {
              $cond: [
                {
                  $and: [
                    { $not: [{ $in: ['$userId', me] }] },
                    {
                      $not: [
                        {
                          $in: [
                            new Types.ObjectId(userId),
                            { $ifNull: ['$readBy.userId', []] },
                          ],
                        },
                      ],
                    },
                  ],
                },
                1,
                0,
              ],
            },
          },
        },
      },
    ]);
    const statsById = new Map(stats.map((s) => [s._id, s]));
    const names = await this.names(stats.map((s) => s.last.userId));

    return hangouts.map((h) => {
      const id = String(h._id);
      const s = statsById.get(id);
      const created = (h as { createdAt?: Date }).createdAt ?? new Date(0);
      return {
        kind: 'group' as const,
        id,
        hangoutId: id,
        title: h.title,
        subtitle: 'Group chat',
        hangoutStatus: h.status,
        lastMessage: s
          ? {
              text: preview(s.last.content),
              senderName: names.get(String(s.last.userId)) ?? 'Someone',
              mine: String(s.last.userId) === userId,
              createdAt: s.last.createdAt,
            }
          : null,
        unread: s?.unread ?? 0,
        updatedAt: s?.last.createdAt ?? created,
        link: `/hangouts/chat/${id}`,
      };
    });
  }

  private async privateChatItems(userId: string): Promise<InboxItem[]> {
    const chats = await this.privateChatModel
      .find({
        status: PrivateChatStatus.ACCEPTED,
        $or: [{ requester: userId }, { recipient: userId }],
      })
      .populate('requester', 'name')
      .populate('recipient', 'name')
      .populate('hangoutId', 'title')
      .sort({ lastMessageAt: -1, updatedAt: -1 })
      .limit(MAX_PRIVATE)
      .exec();
    if (!chats.length) return [];

    const lastMessages = await this.privateMessageModel.aggregate<{
      _id: string;
      content: string;
      senderId: unknown;
      createdAt: Date;
    }>([
      { $match: { chatId: { $in: chats.flatMap((c) => forms(c._id)) } } },
      { $sort: { createdAt: -1 } },
      {
        $group: {
          _id: { $toString: '$chatId' },
          content: { $first: '$content' },
          senderId: { $first: '$senderId' },
          createdAt: { $first: '$createdAt' },
        },
      },
    ]);
    const lastById = new Map(lastMessages.map((m) => [m._id, m]));
    const unread = await Promise.all(
      chats.map((chat) => this.privateChats.unreadCount(chat, userId)),
    );

    return chats.map((chat, i) => {
      const requester = chat.requester as unknown as {
        _id: unknown;
        name: string;
      };
      const recipient = chat.recipient as unknown as {
        _id: unknown;
        name: string;
      };
      const other = String(requester?._id) === userId ? recipient : requester;
      const hangout = chat.hangoutId as unknown as {
        _id: unknown;
        title?: string;
      } | null;
      const hangoutId = String(hangout?._id ?? chat.hangoutId);
      const last = lastById.get(String(chat._id));
      const chatUpdated =
        (chat as unknown as { updatedAt?: Date }).updatedAt ?? new Date(0);
      return {
        kind: 'private' as const,
        id: String(chat._id),
        hangoutId,
        title: other?.name ?? 'Private chat',
        subtitle: hangout?.title
          ? `Private · ${hangout.title}`
          : 'Private chat',
        lastMessage: last
          ? {
              text: preview(last.content),
              senderName:
                String(last.senderId) === userId
                  ? 'You'
                  : (other?.name ?? 'Someone'),
              mine: String(last.senderId) === userId,
              createdAt: last.createdAt,
            }
          : null,
        unread: unread[i],
        updatedAt: last?.createdAt ?? chatUpdated,
        link: `/hangouts/details/${hangoutId}?chat=${String(chat._id)}`,
      };
    });
  }

  private async names(ids: unknown[]): Promise<Map<string, string>> {
    const valid = [...new Set(ids.map(String))].filter((id) =>
      Types.ObjectId.isValid(id),
    );
    if (!valid.length) return new Map();
    const users = await this.userModel
      .find({ _id: { $in: valid.map((id) => new Types.ObjectId(id)) } })
      .select('name')
      .lean();
    return new Map(users.map((u) => [String(u._id), u.name]));
  }
}
