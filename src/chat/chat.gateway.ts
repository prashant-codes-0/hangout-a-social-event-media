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
import { SendMessageDto, EditMessageDto } from './dto/chat.dto';

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

            console.log(`User ${client.userId} connected to chat`);
        } catch (error) {
            console.log('Invalid token, disconnecting client');
            client.disconnect();
        }
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
}