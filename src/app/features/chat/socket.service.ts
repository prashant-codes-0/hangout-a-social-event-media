import { Injectable, inject } from '@angular/core';
import { io, Socket } from 'socket.io-client';
import { Observable, BehaviorSubject } from 'rxjs';
import { environment } from '../../../environments/environment';
import { AuthService } from '../auth/auth.service';
import { Message } from './chat.model';

@Injectable({
    providedIn: 'root'
})
export class SocketService {
    private authService = inject(AuthService);
    private socket: Socket | null = null;
    private connectionStatus = new BehaviorSubject<boolean>(false);

    // Connection status observable
    public isConnected$ = this.connectionStatus.asObservable();

    constructor() {
        this.initializeConnection();
    }

    private initializeConnection() {
        if (this.authService.isAuthenticated()) {
            this.connect();
        }
    }

    connect() {
        if (this.socket?.connected) {
            console.log('🔌 Socket already connected');
            return;
        }

        const token = this.authService.getToken();
        if (!token) {
            console.error('❌ No auth token available for socket connection');
            return;
        }

        console.log('🔌 Connecting to Socket.IO server...');

        this.socket = io(`${environment.apiUrl}/chat`, {
            auth: {
                token: token
            },
            transports: ['websocket', 'polling']
        });

        this.socket.on('connect', () => {
            console.log('✅ Socket connected:', this.socket?.id);
            this.connectionStatus.next(true);
        });

        this.socket.on('disconnect', (reason) => {
            console.log('❌ Socket disconnected:', reason);
            this.connectionStatus.next(false);
        });

        this.socket.on('connect_error', (error) => {
            console.error('💥 Socket connection error:', error);
            console.log('📡 Will use HTTP API as fallback');
            this.connectionStatus.next(false);
        });

        this.socket.on('error', (error) => {
            console.error('💥 Socket error:', error);
        });

        // Listen for hangout join/leave confirmations
        this.socket.on('joinedHangout', (data) => {
            console.log('✅ Successfully joined hangout:', data.hangoutId);
        });

        this.socket.on('leftHangout', (data) => {
            console.log('❌ Left hangout:', data.hangoutId);
        });

        // Listen for user join/leave notifications
        this.socket.on('userJoined', (data) => {
            console.log('👋 User joined:', data.message);
        });

        this.socket.on('userLeft', (data) => {
            console.log('👋 User left:', data.message);
        });
    }

    disconnect() {
        if (this.socket) {
            console.log('🔌 Disconnecting socket...');
            this.socket.disconnect();
            this.socket = null;
            this.connectionStatus.next(false);
        }
    }

    // Join a hangout room for real-time chat
    joinHangoutRoom(hangoutId: string) {
        if (this.socket?.connected) {
            console.log('🏠 Joining hangout room:', hangoutId);
            this.socket.emit('joinHangout', { hangoutId });
        } else {
            console.log('📡 Cannot join room - socket not connected, using HTTP fallback');
        }
    }

    // Leave a hangout room
    leaveHangoutRoom(hangoutId: string) {
        if (this.socket?.connected) {
            console.log('🚪 Leaving hangout room:', hangoutId);
            this.socket.emit('leaveHangout', { hangoutId });
        }
    }

    // Send a message via socket
    sendMessage(hangoutId: string, content: string, messageType: string = 'text') {
        if (this.socket?.connected) {
            console.log('📤 Sending message via socket:', { hangoutId, content });
            this.socket.emit('sendMessage', {
                hangoutId,
                content,
                messageType
            });
        } else {
            console.log('📡 Cannot send message - socket not connected, will use HTTP fallback');
            throw new Error('Socket not connected');
        }
    }

    // Listen for new messages
    onNewMessage(): Observable<Message> {
        return new Observable(observer => {
            if (!this.socket) {
                observer.error('Socket not initialized');
                return;
            }

            // Listen for both newMessage (from others) and messageSent (confirmation of own messages)
            this.socket.on('newMessage', (message: Message) => {
                console.log('📥 Received new message via socket:', message);
                observer.next(message);
            });

            this.socket.on('messageSent', (message: Message) => {
                console.log('✅ Message sent confirmation via socket:', message);
                observer.next(message);
            });

            // Cleanup function
            return () => {
                if (this.socket) {
                    this.socket.off('newMessage');
                    this.socket.off('messageSent');
                }
            };
        });
    }

    // Listen for message updates (edits)
    onMessageUpdated(): Observable<Message> {
        return new Observable(observer => {
            if (!this.socket) {
                observer.error('Socket not initialized');
                return;
            }

            this.socket.on('messageEdited', (message: Message) => {
                console.log('✏️ Received message update via socket:', message);
                observer.next(message);
            });

            this.socket.on('messageEditConfirmed', (message: Message) => {
                console.log('✅ Message edit confirmed via socket:', message);
                observer.next(message);
            });

            return () => {
                if (this.socket) {
                    this.socket.off('messageEdited');
                    this.socket.off('messageEditConfirmed');
                }
            };
        });
    }

    // Listen for message deletions
    onMessageDeleted(): Observable<{ messageId: string }> {
        return new Observable(observer => {
            if (!this.socket) {
                observer.error('Socket not initialized');
                return;
            }

            this.socket.on('messageDeleted', (data: { messageId: string }) => {
                console.log('🗑️ Received message deletion via socket:', data);
                observer.next(data);
            });

            return () => {
                if (this.socket) {
                    this.socket.off('messageDeleted');
                }
            };
        });
    }

    // Listen for typing indicators
    onUserTyping(): Observable<{ userId: string, userName: string, isTyping: boolean }> {
        return new Observable(observer => {
            if (!this.socket) {
                observer.error('Socket not initialized');
                return;
            }

            this.socket.on('userTyping', (data) => {
                observer.next(data);
            });

            return () => {
                if (this.socket) {
                    this.socket.off('userTyping');
                }
            };
        });
    }

    // Send typing indicator
    sendTypingIndicator(hangoutId: string, isTyping: boolean) {
        if (this.socket?.connected) {
            this.socket.emit('typing', { hangoutId, isTyping });
        }
    }

    // Get connection status
    isConnected(): boolean {
        return this.socket?.connected || false;
    }

    // Reconnect if needed
    reconnect() {
        if (!this.socket?.connected) {
            console.log('🔄 Attempting to reconnect socket...');
            this.connect();
        }
    }
}