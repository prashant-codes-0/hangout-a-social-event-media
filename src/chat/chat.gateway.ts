import {
    WebSocketGateway,
    SubscribeMessage,
    MessageBody,
    WebSocketServer,
    ConnectedSocket,
    OnGatewayConnection,
    OnGatewayDisconnect,
    OnGatewayInit,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';

import { JwtService } from '@nestjs/jwt';
import { ChatService } from './chat.service';
import { PrivateChatService } from './private-chat.service';
import { SendMessageDto, EditMessageDto } from './dto/chat.dto';
import { RealtimeService } from '../realtime/realtime.service';
import { NotificationsService } from '../notifications/notifications.service';
import { NotificationType } from '../notifications/schemas/notification.schema';

type CallType = 'audio' | 'video';

// A call that is ringing or in progress, used to tell the callee about calls they missed
interface TrackedCall {
    callerId: string;
    calleeId: string;
    callerName: string;
    hangoutId: string;
    callType: CallType;
    answered: boolean;
    answeredAt?: number; // for the talk time shown in the chat history
    timer: ReturnType<typeof setTimeout>;
}

// Why a tracked call stopped
type CallEndReason = 'ended' | 'declined' | 'busy' | 'timeout' | 'offline';

// Private-typing checks are cached so every keystroke doesn't hit the database
const TYPING_ACCESS_TTL_MS = 10 * 60_000;

// Clients give up ringing after 45s; this is a server-side backstop
const MISSED_CALL_TIMEOUT_MS = 60_000;

interface AuthenticatedSocket extends Socket {
    userId?: string;
    user?: any;
}

@WebSocketGateway({
    cors: {
        origin: '*', // Configure this for production
    },
    namespace: '/chat',
})
export class ChatGateway implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect {
    @WebSocketServer()
    server: Server;

    private connectedUsers = new Map<string, string>(); // socketId -> userId
    private onlineSocketCounts = new Map<string, number>(); // userId -> number of connected sockets
    private lastSeen = new Map<string, Date>(); // userId -> when their last socket disconnected
    private calls = new Map<string, TrackedCall>(); // chatId -> call

    constructor(
        private chatService: ChatService,
        private privateChatService: PrivateChatService,
        private jwtService: JwtService,
        private realtime: RealtimeService,
        private notifications: NotificationsService,
    ) { }

    afterInit(server: Server) {
        // Let other modules (notifications) push events to users
        this.realtime.attach(server);
    }

    async handleConnection(client: AuthenticatedSocket) {
        try {
            // Extract JWT token from handshake
            const authHeader = client.handshake.headers?.authorization as string;
            const token = client.handshake.auth?.token || authHeader?.replace('Bearer ', '');

            if (!token) {
                client.disconnect();
                return;
            }

            // Verify JWT token
            const payload = this.jwtService.verify(token);
            client.userId = payload.sub;
            client.user = payload;
            // Also on socket.data so it is readable via fetchSockets() (who is viewing a hangout chat)
            client.data.userId = payload.sub;

            this.connectedUsers.set(client.id, client.userId!);

            // Personal room so private chat events reach all of this user's sockets
            client.join(`user_${client.userId}`);

            // Online while at least one tab/device is connected
            const sockets = (this.onlineSocketCounts.get(client.userId!) ?? 0) + 1;
            this.onlineSocketCounts.set(client.userId!, sockets);
            if (sockets === 1) {
                this.server.emit('presenceChanged', { userId: client.userId, online: true });
            }

            console.log(`User ${client.userId} connected to chat`);
        } catch (error) {
            console.log('Invalid token, disconnecting client');
            client.disconnect();
        }
    }

    // Push an event to specific users (used for private chats)
    emitToUsers(userIds: string[], event: string, payload: any) {
        this.realtime.emitToUsers(userIds, event, payload);
    }

    // Online status + last seen for the given users (in-memory, per server instance)
    getPresence(userIds: string[]) {
        return userIds.map(userId => ({
            userId,
            online: this.onlineSocketCounts.has(userId),
            lastSeen: this.lastSeen.get(userId)?.toISOString() ?? null,
        }));
    }

    handleDisconnect(client: AuthenticatedSocket) {
        this.connectedUsers.delete(client.id);

        // Sockets rejected in handleConnection never counted as online
        if (client.userId && this.onlineSocketCounts.has(client.userId)) {
            const sockets = this.onlineSocketCounts.get(client.userId)! - 1;
            if (sockets <= 0) {
                const lastSeen = new Date();
                this.onlineSocketCounts.delete(client.userId);
                this.lastSeen.set(client.userId, lastSeen);
                this.server.emit('presenceChanged', {
                    userId: client.userId,
                    online: false,
                    lastSeen: lastSeen.toISOString(),
                });
            } else {
                this.onlineSocketCounts.set(client.userId, sockets);
            }

            if (sockets <= 0) {
                this.endCallsForOfflineUser(client.userId);
            }
        }

        console.log(`User ${client.userId} disconnected from chat`);
    }

    // The user has no sockets left (closed the app, lost connection): end their calls so the other
    // side stops ringing (an unanswered call counts as missed)
    private endCallsForOfflineUser(userId: string) {
        this.calls.forEach((call, chatId) => {
            if (call.callerId !== userId && call.calleeId !== userId) return;
            const otherId = call.callerId === userId ? call.calleeId : call.callerId;
            this.realtime.emitToUser(otherId, 'callEnded', { chatId });
            this.finishCall(chatId, 'offline');
        });
    }

    // Stop tracking a call: add it to the private chat's history and, if the callee missed it,
    // send them a "missed call" alert. Safe to call twice (the second call is a no-op).
    private finishCall(chatId: string, reason: CallEndReason) {
        const call = this.calls.get(chatId);
        if (!call) return;
        clearTimeout(call.timer);
        this.calls.delete(chatId);

        const status = call.answered ? 'completed'
            : reason === 'declined' ? 'declined'
                : reason === 'busy' ? 'busy'
                    : 'missed';
        const durationSeconds = call.answered && call.answeredAt ? (Date.now() - call.answeredAt) / 1000 : 0;
        this.privateChatService
            .addCallLog(chatId, call.callerId, { callType: call.callType, status, durationSeconds })
            .then(entry => this.realtime.emitToUsers([call.callerId, call.calleeId], 'newPrivateMessage', entry))
            .catch(err => console.error('Failed to save call history:', (err as Error).message));

        const missed = status === 'missed' || status === 'busy';
        if (missed) {
            this.notifications.notify(call.calleeId, {
                type: NotificationType.MISSED_CALL,
                actorId: call.callerId,
                hangoutId: call.hangoutId,
                chatId,
                callType: call.callType,
                title: `Missed ${call.callType === 'video' ? 'video' : 'audio'} call`,
                body: `${call.callerName} tried to call you`,
                link: `/hangouts/details/${call.hangoutId}?chat=${chatId}`,
            });
        }
    }

    @SubscribeMessage('joinHangout')
    async handleJoinHangout(
        @ConnectedSocket() client: AuthenticatedSocket,
        @MessageBody() data: { hangoutId: string },
    ) {
        const { hangoutId } = data;

        // Check if user has access to this hangout
        const hasAccess = await this.chatService.checkUserAccess(hangoutId, client.userId!);

        if (!hasAccess) {
            client.emit('error', { message: 'You do not have access to this hangout chat. You must be an attendee or creator of this hangout.' });
            return;
        }

        // Join the hangout room
        client.join(`hangout_${hangoutId}`);

        // Notify others in the room
        client.to(`hangout_${hangoutId}`).emit('userJoined', {
            userId: client.userId,
            user: client.user,
            message: `${client.user.email} joined the chat`,
        });

        client.emit('joinedHangout', { hangoutId, message: 'Successfully joined hangout chat' });
    }

    @SubscribeMessage('leaveHangout')
    async handleLeaveHangout(
        @ConnectedSocket() client: AuthenticatedSocket,
        @MessageBody() data: { hangoutId: string },
    ) {
        const { hangoutId } = data;

        client.leave(`hangout_${hangoutId}`);

        // Notify others in the room
        client.to(`hangout_${hangoutId}`).emit('userLeft', {
            userId: client.userId,
            user: client.user,
            message: `${client.user.email} left the chat`,
        });

        client.emit('leftHangout', { hangoutId, message: 'Left hangout chat' });
    }

    @SubscribeMessage('sendMessage')
    async handleSendMessage(
        @ConnectedSocket() client: AuthenticatedSocket,
        @MessageBody() sendMessageDto: SendMessageDto,
    ) {
        try {
            // The REST endpoint is protected by HangoutAccessGuard; the socket path needs the same check
            const hasAccess = await this.chatService.checkUserAccess(sendMessageDto.hangoutId, client.userId!);
            if (!hasAccess) {
                client.emit('error', { message: 'You must be an attendee or creator of this hangout to send messages.' });
                return;
            }

            const message = await this.chatService.sendMessage(sendMessageDto, client.userId!);
            // Alert members who aren't looking at this chat (fire and forget)
            this.chatService.notifyGroupMessage(message, client.userId!);

            // Full message (incl. replyTo, reactions, readBy), with reactions as a plain object
            const payload = message.toJSON();

            // Broadcast message to other users in the hangout room (excluding sender)
            client.to(`hangout_${sendMessageDto.hangoutId}`).emit('newMessage', payload);

            // Send confirmation back to sender
            client.emit('messageSent', payload);

        } catch (error) {
            client.emit('error', { message: error.message });
        }
    }

    @SubscribeMessage('editMessage')
    async handleEditMessage(
        @ConnectedSocket() client: AuthenticatedSocket,
        @MessageBody() data: { messageId: string; editMessageDto: EditMessageDto },
    ) {
        try {
            const { messageId, editMessageDto } = data;
            const message = await this.chatService.editMessage(messageId, editMessageDto, client.userId!);

            // Broadcast edited message to other users in the hangout room (excluding sender)
            client.to(`hangout_${message.hangoutId}`).emit('messageEdited', {
                _id: message._id,
                hangoutId: message.hangoutId,
                userId: message.userId,
                content: message.content,
                messageType: message.messageType,
                isEdited: message.isEdited,
                editedAt: message.editedAt,
                createdAt: (message as any).createdAt,
                updatedAt: (message as any).updatedAt,
            });

            // Send confirmation back to sender
            client.emit('messageEditConfirmed', {
                _id: message._id,
                hangoutId: message.hangoutId,
                userId: message.userId,
                content: message.content,
                messageType: message.messageType,
                isEdited: message.isEdited,
                editedAt: message.editedAt,
                createdAt: (message as any).createdAt,
                updatedAt: (message as any).updatedAt,
            });

        } catch (error) {
            client.emit('error', { message: error.message });
        }
    }

    @SubscribeMessage('deleteMessage')
    async handleDeleteMessage(
        @ConnectedSocket() client: AuthenticatedSocket,
        @MessageBody() data: { messageId: string },
    ) {
        try {
            const { messageId } = data;
            const result = await this.chatService.deleteMessage(messageId, client.userId!);

            // Broadcast message deletion to all users in the hangout room
            // Note: We need to get the hangout ID from the message before deletion
            // This is a simplified version - you might want to modify the service to return hangoutId
            client.emit('messageDeleted', result);

        } catch (error) {
            client.emit('error', { message: error.message });
        }
    }

    // "typing…" in a private chat: relayed only to the other participant
    @SubscribeMessage('privateTyping')
    async handlePrivateTyping(
        @ConnectedSocket() client: AuthenticatedSocket,
        @MessageBody() data: { chatId: string; isTyping: boolean },
    ) {
        if (!data?.chatId) return;
        try {
            const peerId = await this.typingPeer(data.chatId, client.userId!);
            this.realtime.emitToUser(peerId, 'privateTyping', {
                chatId: data.chatId,
                userId: client.userId,
                isTyping: !!data.isTyping,
            });
        } catch {
            // Not a participant of an accepted chat: ignore silently
        }
    }

    private typingAccess = new Map<string, { peerId: string; expires: number }>();

    private async typingPeer(chatId: string, userId: string): Promise<string> {
        const key = `${chatId}:${userId}`;
        const cached = this.typingAccess.get(key);
        if (cached && cached.expires > Date.now()) return cached.peerId;

        const { peerId } = await this.privateChatService.getCallPeer(chatId, userId);
        this.typingAccess.set(key, { peerId, expires: Date.now() + TYPING_ACCESS_TTL_MS });
        return peerId;
    }

    @SubscribeMessage('typing')
    handleTyping(
        @ConnectedSocket() client: AuthenticatedSocket,
        @MessageBody() data: { hangoutId: string; isTyping: boolean },
    ) {
        const { hangoutId, isTyping } = data;

        client.to(`hangout_${hangoutId}`).emit('userTyping', {
            userId: client.userId,
            user: client.user,
            isTyping,
        });
    }

    // ---- WebRTC call signaling (private chats only) ----
    // The server only relays signaling between the two participants of an accepted private chat;
    // the audio/video itself flows peer-to-peer.

    @SubscribeMessage('callOffer')
    async handleCallOffer(
        @ConnectedSocket() client: AuthenticatedSocket,
        @MessageBody() data: { chatId: string; sdp: any; callType: CallType },
    ) {
        try {
            const { chat, me, peerId } = await this.privateChatService.getCallPeer(data.chatId, client.userId!, true);
            const callType: CallType = data.callType === 'video' ? 'video' : 'audio';

            // Track it so an unanswered call becomes a "missed call" alert
            const previous = this.calls.get(data.chatId);
            if (previous) clearTimeout(previous.timer);
            this.calls.set(data.chatId, {
                callerId: client.userId!,
                calleeId: peerId,
                callerName: me.name,
                hangoutId: chat.hangoutId.toString(),
                callType,
                answered: false,
                timer: setTimeout(() => {
                    const call = this.calls.get(data.chatId);
                    if (call && !call.answered) this.finishCall(data.chatId, 'timeout');
                }, MISSED_CALL_TIMEOUT_MS),
            });

            this.server.to(`user_${peerId}`).emit('incomingCall', {
                chatId: data.chatId,
                from: { _id: me._id.toString(), name: me.name, email: me.email },
                callType,
                sdp: data.sdp,
            });
        } catch (error) {
            client.emit('callError', { chatId: data?.chatId, message: error.message });
        }
    }

    @SubscribeMessage('callAnswer')
    async handleCallAnswer(
        @ConnectedSocket() client: AuthenticatedSocket,
        @MessageBody() data: { chatId: string; sdp: any },
    ) {
        try {
            const { peerId } = await this.privateChatService.getCallPeer(data.chatId, client.userId!);
            const call = this.calls.get(data.chatId);
            if (call && call.calleeId === client.userId) {
                call.answered = true;
                call.answeredAt = Date.now();
                clearTimeout(call.timer); // no longer a candidate for "missed"
            }
            this.server.to(`user_${peerId}`).emit('callAnswered', { chatId: data.chatId, sdp: data.sdp });

            // Stop the call ringing in this user's other tabs/devices
            client.to(`user_${client.userId}`).emit('callHandledElsewhere', { chatId: data.chatId });
        } catch (error) {
            client.emit('callError', { chatId: data?.chatId, message: error.message });
        }
    }

    @SubscribeMessage('callIceCandidate')
    async handleCallIceCandidate(
        @ConnectedSocket() client: AuthenticatedSocket,
        @MessageBody() data: { chatId: string; candidate: any },
    ) {
        try {
            const { peerId } = await this.privateChatService.getCallPeer(data.chatId, client.userId!);
            this.server.to(`user_${peerId}`).emit('callIceCandidate', { chatId: data.chatId, candidate: data.candidate });
        } catch (error) {
            client.emit('callError', { chatId: data?.chatId, message: error.message });
        }
    }

    @SubscribeMessage('callReject')
    async handleCallReject(
        @ConnectedSocket() client: AuthenticatedSocket,
        @MessageBody() data: { chatId: string; reason?: 'declined' | 'busy' },
    ) {
        try {
            const { peerId } = await this.privateChatService.getCallPeer(data.chatId, client.userId!);
            const reason = data.reason === 'busy' ? 'busy' : 'declined';
            this.server.to(`user_${peerId}`).emit('callRejected', { chatId: data.chatId, reason });

            // Declining on purpose isn't "missed"; being on another call is
            const call = this.calls.get(data.chatId);
            if (call && call.calleeId === client.userId) {
                this.finishCall(data.chatId, reason);
            }
            client.to(`user_${client.userId}`).emit('callHandledElsewhere', { chatId: data.chatId });
        } catch (error) {
            client.emit('callError', { chatId: data?.chatId, message: error.message });
        }
    }

    @SubscribeMessage('callEnd')
    async handleCallEnd(
        @ConnectedSocket() client: AuthenticatedSocket,
        @MessageBody() data: { chatId: string },
    ) {
        try {
            const { peerId } = await this.privateChatService.getCallPeer(data.chatId, client.userId!);
            this.server.to(`user_${peerId}`).emit('callEnded', { chatId: data.chatId });

            // Caller hanging up (or giving up after ringing) before an answer = missed call
            const call = this.calls.get(data.chatId);
            if (call) {
                this.finishCall(data.chatId, 'ended');
            }
        } catch (error) {
            client.emit('callError', { chatId: data?.chatId, message: error.message });
        }
    }
}