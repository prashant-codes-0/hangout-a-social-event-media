import { Injectable, Logger } from '@nestjs/common';
import type { Server } from 'socket.io';

// Holds the chat socket.io server so any module can push events to users
// without importing ChatModule (which would create module cycles).
@Injectable()
export class RealtimeService {
  private readonly logger = new Logger(RealtimeService.name);
  private server: Server | null = null;

  // Called by ChatGateway once the socket server is ready
  attach(server: Server) {
    this.server = server;
  }

  // Every socket of a user joins `user_<id>` on connect (see ChatGateway.handleConnection)
  emitToUser(userId: string, event: string, payload: any) {
    if (!this.server) {
      this.logger.warn(
        `Socket server not ready; dropped "${event}" for ${userId}`,
      );
      return;
    }
    this.server.to(`user_${userId}`).emit(event, payload);
  }

  emitToUsers(userIds: string[], event: string, payload: any) {
    userIds.forEach((userId) => this.emitToUser(userId, event, payload));
  }

  // Ids of users with at least one socket currently in a room (e.g. viewing a hangout chat)
  async userIdsInRoom(room: string): Promise<Set<string>> {
    if (!this.server) return new Set();
    const sockets = await this.server.in(room).fetchSockets();
    return new Set(sockets.map((s) => (s as any).data?.userId).filter(Boolean));
  }
}
