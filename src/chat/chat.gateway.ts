import {
    WebSocketGateway,
    SubscribeMessage,
    MessageBody,
    WebSocketServer,
    ConnectedSocket,
    OnGatewayConnection,
    OnGatewayDisconnect,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';

import { JwtService } from '@nestjs/jwt';
import { ChatService } from './chat.service';
import { PrivateChatService } from './private-chat.service';
import { SendMessageDto, EditMessageDto } from './dto/chat.dto';

type CallType = 'audio' | 'video';

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
export class ChatGateway implements OnGatewayConnection, OnGatewayDisconnect {
    @WebSocketServer()
    server: Server;

    private connectedUsers = new Map<string, string>(); // socketId -> userId

    constructor(
        private chatService: ChatService,
        private privateChatService: PrivateChatService,
        private jwtService: JwtService,
    ) { }

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

            this.connectedUsers.set(client.id, client.userId!);

            // Personal room so private chat events reach all of this user's sockets
            client.join(`user_${client.userId}`);

            console.log(`User ${client.userId} connected to chat`);
        } catch (error) {
            console.log('Invalid token, disconnecting client');
            client.disconnect();
        }
    }

    // Push an event to specific users (used for private chats)
    emitToUsers(userIds: string[], event: string, payload: any) {
        userIds.forEach(userId => this.server.to(`user_${userId}`).emit(event, payload));
    }

    handleDisconnect(client: AuthenticatedSocket) {
        this.connectedUsers.delete(client.id);
        console.log(`User ${client.userId} disconnected from chat`);
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
            const message = await this.chatService.sendMessage(sendMessageDto, client.userId!);

            // Broadcast message to other users in the hangout room (excluding sender)
            client.to(`hangout_${sendMessageDto.hangoutId}`).emit('newMessage', {
                _id: message._id,
                hangoutId: message.hangoutId,
                userId: message.userId,
                content: message.content,
                messageType: message.messageType,
                isEdited: message.isEdited,
                createdAt: (message as any).createdAt,
                updatedAt: (message as any).updatedAt,
            });

            // Send confirmation back to sender
            client.emit('messageSent', {
                _id: message._id,
                hangoutId: message.hangoutId,
                userId: message.userId,
                content: message.content,
                messageType: message.messageType,
                isEdited: message.isEdited,
                createdAt: (message as any).createdAt,
                updatedAt: (message as any).updatedAt,
            });

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
            const { me, peerId } = await this.privateChatService.getCallPeer(data.chatId, client.userId!, true);
            const callType: CallType = data.callType === 'video' ? 'video' : 'audio';

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
            this.server.to(`user_${peerId}`).emit('callRejected', {
                chatId: data.chatId,
                reason: data.reason === 'busy' ? 'busy' : 'declined',
            });
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
        } catch (error) {
            client.emit('callError', { chatId: data?.chatId, message: error.message });
        }
    }
}