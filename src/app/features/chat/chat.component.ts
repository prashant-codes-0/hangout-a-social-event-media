import { Component, Input, Output, EventEmitter, OnInit, OnDestroy, inject, signal, effect, ViewChild, ElementRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ChatService } from './chat.service';
import { AuthService } from '../auth/auth.service';
import { SocketService } from './socket.service';
import { Message, SendMessageDto } from './chat.model';
import { Subscription } from 'rxjs';

@Component({
  selector: 'app-chat',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="chat-container bg-base-100 rounded-lg shadow-lg flex flex-col h-96">
      <!-- Chat Header -->
      @if (showHeader) {
        <div class="chat-header bg-primary text-primary-content p-4 rounded-t-lg">
          <div class="flex items-center justify-between">
            <h3 class="font-semibold flex items-center gap-2">
              <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-3.582 8-8 8a8.955 8.955 0 01-2.697-.413l-2.725.725c-.138.037-.274-.014-.334-.14-.06-.126-.016-.276.108-.334l.725-2.725A8.955 8.955 0 013 12c0-4.418 3.582-8 8-8s8 3.582 8 8z" />
              </svg>
              Hangout Chat
              @if (isSocketConnected()) {
                <span class="badge badge-xs badge-success animate-pulse">🔌 Live</span>
              } @else {
                <span class="badge badge-xs badge-warning">📡 HTTP Mode</span>
              }
              @if (typingUsers().length > 0) {
                <span class="text-xs opacity-70">{{ typingUsers().join(', ') }} typing...</span>
              }
            </h3>
            <div class="flex gap-1">
              <button class="btn btn-ghost btn-sm" (click)="refreshMessages()" title="Refresh Messages">
                <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
              </button>
              <button class="btn btn-ghost btn-xs" (click)="forceRefresh()" title="Force Reload All">
                <svg xmlns="http://www.w3.org/2000/svg" class="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v1m6 11h-1m-6 6v-1m-6-11h1m5-5.5L12 4l1.5 1.5M18.5 12L20 12l-1.5 1.5M12 20l-1.5-1.5L12 20l1.5-1.5M5.5 12L4 12l1.5-1.5" />
                </svg>
              </button>
            </div>
          </div>
        </div>
      }

      <!-- Quick Actions (Always Visible) -->
      <div class="chat-controls bg-base-200 p-2 border-b border-base-300">
        <div class="flex gap-2 justify-center">
          <button 
            class="btn btn-outline btn-xs"
            (click)="loadAllMessages()"
            [disabled]="loading() || loadingMore()"
            title="Load complete message history"
          >
            <svg xmlns="http://www.w3.org/2000/svg" class="h-3 w-3 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 10v6m0 0l-3-3m3 3l3-3M3 17V7a2 2 0 012-2h6l2 2h6a2 2 0 012 2v10a2 2 0 01-2 2H5a2 2 0 01-2-2z" />
            </svg>
            All History
          </button>
          <button 
            class="btn btn-ghost btn-xs"
            (click)="clearMessages()"
            title="Clear messages from view"
          >
            <svg xmlns="http://www.w3.org/2000/svg" class="h-3 w-3 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
            Clear
          </button>
        </div>
      </div>

      <!-- Messages Area -->
      <div class="chat-messages flex-1 p-4 overflow-y-auto space-y-3" #messagesContainer (scroll)="onScroll()">

        <!-- Load More Messages Button (Pagination) - Shows when 30+ messages and scrolled up -->
        @if (hasMoreMessages() && messages().length > 30 && showPaginationButtons()) {
          <div class="text-center py-2 space-y-2 load-more-section">
            <button 
              class="btn btn-ghost btn-sm"
              (click)="loadMoreMessages()"
              [disabled]="loadingMore() || loading()"
              [class.loading]="loadingMore()"
            >
              @if (!loadingMore()) {
                <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 16l-4-4m0 0l4-4m0 4h18" />
                </svg>
              }
              Load More Messages
            </button>
            <button 
              class="btn btn-outline btn-xs"
              (click)="loadAllMessages()"
              [disabled]="loading() || loadingMore()"
            >
              <svg xmlns="http://www.w3.org/2000/svg" class="h-3 w-3 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 10v6m0 0l-3-3m3 3l3-3M3 17V7a2 2 0 012-2h6l2 2h6a2 2 0 012 2v10a2 2 0 01-2 2H5a2 2 0 01-2-2z" />
              </svg>
              Load All History
            </button>
          </div>
        }
        @if (loading()) {
          <div class="flex justify-center py-4">
            <span class="loading loading-spinner loading-md"></span>
          </div>
        }

        @if (error()) {
          <div class="alert alert-error">
            <svg xmlns="http://www.w3.org/2000/svg" class="stroke-current shrink-0 h-6 w-6" fill="none" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <span>{{ error() }}</span>
          </div>
        }

        @for (message of messages(); track message._id) {
          <div class="chat" [class.chat-end]="isMyMessage(message)" [class.chat-start]="!isMyMessage(message)">
            <div class="chat-image avatar">
              <div class="w-8 rounded-full bg-primary text-primary-content flex items-center justify-center">
                <span class="text-xs font-bold">{{ message.userId.name.charAt(0).toUpperCase() }}</span>
              </div>
            </div>
            <div class="chat-header">
              {{ message.userId.name }}
              <time class="text-xs opacity-50 ml-2">{{ formatTime(message.createdAt) }}</time>
              @if (message.isEdited) {
                <span class="text-xs opacity-50 ml-1">(edited)</span>
              }
            </div>
            <div class="chat-bubble" [class.chat-bubble-primary]="isMyMessage(message)">
              {{ message.content }}
            </div>
            @if (canEditMessage(message)) {
              <div class="chat-footer opacity-50">
                <div class="dropdown dropdown-end">
                  <div tabindex="0" role="button" class="btn btn-ghost btn-xs">
                    <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 5v.01M12 12v.01M12 19v.01" />
                    </svg>
                  </div>
                  <ul tabindex="0" class="dropdown-content z-[1] menu p-2 shadow bg-base-100 rounded-box w-32">
                    <li><a (click)="startEditMessage(message)">Edit</a></li>
                    <li><a (click)="deleteMessage(message._id)" class="text-error">Delete</a></li>
                  </ul>
                </div>
              </div>
            }
          </div>
        }

        @if (messages().length === 0 && !loading()) {
          <div class="text-center py-8 opacity-60">
            <svg xmlns="http://www.w3.org/2000/svg" class="h-12 w-12 mx-auto mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-3.582 8-8 8a8.955 8.955 0 01-2.697-.413l-2.725.725c-.138.037-.274-.014-.334-.14-.06-.126-.016-.276.108-.334l.725-2.725A8.955 8.955 0 013 12c0-4.418 3.582-8 8-8s8 3.582 8 8z" />
            </svg>
            <p>No messages yet. Start the conversation!</p>
          </div>
        }
      </div>

      <!-- Message Input -->
      <div class="chat-input border-t border-base-300 p-4">
        @if (editingMessage()) {
          <div class="mb-2 p-2 bg-warning/20 rounded text-sm">
            <span class="font-medium">Editing message:</span>
            <button class="btn btn-ghost btn-xs float-right" (click)="cancelEdit()">Cancel</button>
          </div>
        }
        
        <div class="flex gap-2">
          <input
            type="text"
            class="input input-bordered flex-1"
            placeholder="Type your message..."
            [(ngModel)]="newMessage"
            (keydown.enter)="sendMessage()"
            (input)="onTyping()"
            (blur)="onStopTyping()"
            [disabled]="sending()"
            #messageInput
          />
          <button
            class="btn btn-primary"
            (click)="sendMessage()"
            [disabled]="!newMessage.trim() || sending()"
            [class.loading]="sending()"
          >
            @if (!sending()) {
              <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
              </svg>
            }
            {{ editingMessage() ? 'Update' : 'Send' }}
          </button>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .chat-container {
      max-height: 500px;
    }
    
    .chat-messages {
      scroll-behavior: smooth;
    }
    
    .chat-messages::-webkit-scrollbar {
      width: 4px;
    }
    
    .chat-messages::-webkit-scrollbar-track {
      background: transparent;
    }
    
    .chat-messages::-webkit-scrollbar-thumb {
      background: hsl(var(--bc) / 0.2);
      border-radius: 2px;
    }
    
    .chat-messages::-webkit-scrollbar-thumb:hover {
      background: hsl(var(--bc) / 0.3);
    }

    .load-more-section {
      border-bottom: 1px solid hsl(var(--bc) / 0.1);
      margin-bottom: 1rem;
      padding-bottom: 0.5rem;
    }
  `]
})
export class ChatComponent implements OnInit, OnDestroy {
  @Input({ required: true }) hangoutId!: string;
  @Input() showHeader: boolean = true;
  @Output() newMessageEvent = new EventEmitter<Message>();
  @ViewChild('messagesContainer') messagesContainer!: ElementRef;
  @ViewChild('messageInput') messageInput!: ElementRef;

  private chatService = inject(ChatService);
  private authService = inject(AuthService);
  private socketService = inject(SocketService);

  // State
  messages = signal<Message[]>([]);
  loading = signal(false);
  loadingMore = signal(false);
  sending = signal(false);
  error = signal<string | null>(null);
  hasMoreMessages = signal(true);

  // Scroll detection for pagination
  showPaginationButtons = signal(false);
  private scrollThreshold = 100; // pixels from bottom to show pagination

  // Message input
  newMessage = '';
  editingMessage = signal<Message | null>(null);

  // Pagination
  private currentSkip = 0;
  private readonly pageSize = 50;
  private isLoadingHistory = false; // Flag to track history loading

  // Socket subscriptions
  private subscriptions: Subscription[] = [];
  isSocketConnected = signal(false);
  typingUsers = signal<string[]>([]);

  // Fallback polling
  private fallbackPollInterval: any;

  constructor() {
    // Auto-scroll to bottom when new messages arrive (but not when loading history)
    effect(() => {
      if (this.messages().length > 0 && !this.loadingMore() && !this.isLoadingHistory) {
        setTimeout(() => this.scrollToBottom(), 100);
      }
    });
  }

  ngOnInit() {
    this.loadMessages();
    this.initializeSocket();

    // Initial scroll detection setup
    setTimeout(() => {
      this.onScroll();
    }, 500);
  }

  ngOnDestroy() {
    this.cleanupSocket();
  }

  loadMessages(reset: boolean = true) {
    if (reset) {
      this.loading.set(true);
      this.currentSkip = 0;
      this.hasMoreMessages.set(true);
      this.isLoadingHistory = false; // Initial load, allow auto-scroll
    } else {
      this.loadingMore.set(true);
      this.isLoadingHistory = true; // Loading history, prevent auto-scroll
    }

    this.error.set(null);

    // Load all messages without restriction to show full history
    this.chatService.getMessages(this.hangoutId, this.pageSize, this.currentSkip, false).subscribe({
      next: (response) => {
        if (response.success && Array.isArray(response.data)) {
          const newMessages = response.data;

          if (reset) {
            // Initial load - reverse to show oldest first
            this.messages.set(newMessages.reverse());
          } else {
            // Loading more - prepend older messages and scroll to top
            this.messages.update(msgs => [...newMessages.reverse(), ...msgs]);
            // Scroll to top to show the newly loaded older messages
            setTimeout(() => {
              this.scrollToTop();
              this.isLoadingHistory = false; // Reset flag after scrolling
            }, 100);
          }

          // Check if there are more messages to load
          if (newMessages.length < this.pageSize) {
            this.hasMoreMessages.set(false);
          } else {
            this.currentSkip += this.pageSize;
          }
        }

        this.loading.set(false);
        this.loadingMore.set(false);

        // Reset history loading flag if not already reset
        if (reset) {
          this.isLoadingHistory = false;
        }
      },
      error: (err) => {
        this.error.set(err.error?.message || 'Failed to load messages');
        this.loading.set(false);
        this.loadingMore.set(false);
        this.isLoadingHistory = false; // Reset flag on error
      }
    });
  }

  // Load more older messages
  loadMoreMessages() {
    if (!this.hasMoreMessages() || this.loadingMore()) return;
    this.loadMessages(false);
  }

  // Manually refresh socket connection
  refreshMessages() {
    console.log('🔄 Manual socket reconnection triggered');
    this.socketService.reconnect();
  }

  // Force complete reload of messages
  forceRefresh() {
    console.log('🔄 Force refresh - reloading all messages');
    this.loadMessages(true);
  }

  // Typing indicator methods
  private typingTimeout: any;

  onTyping() {
    // Send typing indicator
    this.socketService.sendTypingIndicator(this.hangoutId, true);

    // Clear existing timeout
    if (this.typingTimeout) {
      clearTimeout(this.typingTimeout);
    }

    // Set timeout to stop typing after 2 seconds of inactivity
    this.typingTimeout = setTimeout(() => {
      this.onStopTyping();
    }, 2000);
  }

  onStopTyping() {
    this.socketService.sendTypingIndicator(this.hangoutId, false);
    if (this.typingTimeout) {
      clearTimeout(this.typingTimeout);
      this.typingTimeout = null;
    }
  }

  // Fallback method to send message via HTTP API
  private sendViaHttpApi() {
    const messageDto: SendMessageDto = {
      hangoutId: this.hangoutId,
      content: this.newMessage.trim(),
      messageType: 'text'
    };

    this.chatService.sendMessage(messageDto).subscribe({
      next: (response) => {
        if (response.success && !Array.isArray(response.data)) {
          this.messages.update(msgs => [...msgs, response.data as Message]);
          this.newMessage = '';
        }
        this.sending.set(false);
      },
      error: (err) => {
        this.error.set(err.error?.message || 'Failed to send message');
        this.sending.set(false);
      }
    });
  }

  // Load all messages at once (for complete history)
  loadAllMessages() {
    this.loading.set(true);
    this.error.set(null);
    this.isLoadingHistory = true; // Loading all history, prevent auto-scroll

    // Load with a very high limit to get all messages
    this.chatService.getMessages(this.hangoutId, 1000, 0, false).subscribe({
      next: (response) => {
        if (response.success && Array.isArray(response.data)) {
          // Reverse to show oldest first
          this.messages.set(response.data.reverse());
          this.hasMoreMessages.set(false);
          this.currentSkip = response.data.length;
          // Scroll to top to show the beginning of the conversation
          setTimeout(() => {
            this.scrollToTop();
            this.isLoadingHistory = false; // Reset flag after scrolling
          }, 100);
        }
        this.loading.set(false);
      },
      error: (err) => {
        this.error.set(err.error?.message || 'Failed to load all messages');
        this.loading.set(false);
        this.isLoadingHistory = false; // Reset flag on error
      }
    });
  }

  // Load recent messages by hours
  loadRecentMessages(hours: number) {
    this.loading.set(true);
    this.error.set(null);
    this.isLoadingHistory = true;

    this.chatService.getRecentMessages(this.hangoutId, hours).subscribe({
      next: (response) => {
        if (response.success && Array.isArray(response.data)) {
          // Reverse to show oldest first
          this.messages.set(response.data.reverse());
          this.hasMoreMessages.set(false);
          this.currentSkip = response.data.length;
          setTimeout(() => {
            this.scrollToBottom();
            this.isLoadingHistory = false;
          }, 100);
        }
        this.loading.set(false);
      },
      error: (err) => {
        this.error.set(err.error?.message || `Failed to load messages from last ${hours} hours`);
        this.loading.set(false);
        this.isLoadingHistory = false;
      }
    });
  }

  // Load restricted history
  loadRestrictedHistory() {
    this.loading.set(true);
    this.error.set(null);
    this.isLoadingHistory = true;

    this.chatService.getMessages(this.hangoutId, 50, 0, true).subscribe({
      next: (response) => {
        if (response.success && Array.isArray(response.data)) {
          // Reverse to show oldest first
          this.messages.set(response.data.reverse());
          this.hasMoreMessages.set(false);
          this.currentSkip = response.data.length;
          setTimeout(() => {
            this.scrollToBottom();
            this.isLoadingHistory = false;
          }, 100);
        }
        this.loading.set(false);
      },
      error: (err) => {
        this.error.set(err.error?.message || 'Failed to load restricted history');
        this.loading.set(false);
        this.isLoadingHistory = false;
      }
    });
  }

  // Clear messages from view
  clearMessages() {
    this.messages.set([]);
    this.hasMoreMessages.set(true);
    this.currentSkip = 0;
    console.log('🗑️ Messages cleared from view');
  }

  sendMessage() {
    if (!this.newMessage.trim()) return;

    const editingMsg = this.editingMessage();

    if (editingMsg) {
      // Edit existing message
      this.editMessage(editingMsg._id, this.newMessage.trim());
    } else {
      // Send new message
      this.sending.set(true);

      // Check if socket is connected, otherwise use HTTP API
      if (this.socketService.isConnected()) {
        try {
          // Send message via Socket.IO for instant delivery
          this.socketService.sendMessage(this.hangoutId, this.newMessage.trim(), 'text');

          // Clear the input immediately
          this.newMessage = '';
          this.sending.set(false);

          console.log('� FMessage sent via Socket.IO');
        } catch (error) {
          console.error('💥 Failed to send message via socket:', error);
          this.sendViaHttpApi();
        }
      } else {
        console.log('📡 Socket not connected, using HTTP API');
        this.sendViaHttpApi();
      }
    }
  }

  startEditMessage(message: Message) {
    this.editingMessage.set(message);
    this.newMessage = message.content;
    this.messageInput.nativeElement.focus();
  }

  editMessage(messageId: string, content: string) {
    this.sending.set(true);

    this.chatService.editMessage(messageId, { content }).subscribe({
      next: (response) => {
        if (response.success && !Array.isArray(response.data)) {
          // Update message in the list
          this.messages.update(msgs =>
            msgs.map(msg => msg._id === messageId ? response.data as Message : msg)
          );
          this.cancelEdit();
        }
        this.sending.set(false);
      },
      error: (err) => {
        this.error.set(err.error?.message || 'Failed to edit message');
        this.sending.set(false);
      }
    });
  }

  deleteMessage(messageId: string) {
    if (!confirm('Are you sure you want to delete this message?')) return;

    this.chatService.deleteMessage(messageId).subscribe({
      next: (response) => {
        if (response.success) {
          // Remove message from the list
          this.messages.update(msgs => msgs.filter(msg => msg._id !== messageId));
        }
      },
      error: (err) => {
        this.error.set(err.error?.message || 'Failed to delete message');
      }
    });
  }

  cancelEdit() {
    this.editingMessage.set(null);
    this.newMessage = '';
  }

  isMyMessage(message: Message): boolean {
    const currentUser = this.authService.currentUser();
    return currentUser?._id === message.userId._id;
  }

  canEditMessage(message: Message): boolean {
    const currentUser = this.authService.currentUser();
    return currentUser?._id === message.userId._id || currentUser?.role === 'admin';
  }

  formatTime(dateString: string): string {
    const date = new Date(dateString);
    return date.toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: true
    });
  }

  private scrollToBottom() {
    if (this.messagesContainer) {
      const element = this.messagesContainer.nativeElement;
      element.scrollTo({
        top: element.scrollHeight,
        behavior: 'smooth'
      });
    }
  }

  private scrollToTop() {
    if (this.messagesContainer) {
      const element = this.messagesContainer.nativeElement;
      element.scrollTo({
        top: 0,
        behavior: 'smooth'
      });
    }
  }

  // Detect scroll position to show/hide pagination buttons
  onScroll() {
    if (!this.messagesContainer) return;

    const element = this.messagesContainer.nativeElement;
    const scrollTop = element.scrollTop;
    const scrollHeight = element.scrollHeight;
    const clientHeight = element.clientHeight;

    // Calculate distance from bottom
    const distanceFromBottom = scrollHeight - (scrollTop + clientHeight);

    // Show pagination buttons when user scrolls up more than threshold and has 30+ messages
    const shouldShowPagination = distanceFromBottom > this.scrollThreshold && this.messages().length > 30;
    this.showPaginationButtons.set(shouldShowPagination);
  }

  private initializeSocket() {
    console.log('🔌 Initializing Socket.IO for hangout:', this.hangoutId);

    // Connect to socket if not already connected
    this.socketService.connect();

    // Wait a bit for connection, then join room
    setTimeout(() => {
      if (this.socketService.isConnected()) {
        this.socketService.joinHangoutRoom(this.hangoutId);
      } else {
        console.log('⚠️ Socket not connected, will use HTTP API fallback');
      }
    }, 1000);

    // Subscribe to connection status
    const connectionSub = this.socketService.isConnected$.subscribe(connected => {
      this.isSocketConnected.set(connected);
      console.log('🔌 Socket connection status:', connected);

      if (connected) {
        // Socket connected, stop fallback polling
        this.stopFallbackPolling();
        // Join room now that we're connected
        this.socketService.joinHangoutRoom(this.hangoutId);
      } else {
        // Socket disconnected, start fallback polling
        this.startFallbackPolling();
      }
    });
    this.subscriptions.push(connectionSub);

    // Subscribe to new messages
    const messagesSub = this.socketService.onNewMessage().subscribe(message => {
      console.log('📥 Received new message via socket:', message);
      this.messages.update(msgs => [...msgs, message]);
      this.newMessageEvent.emit(message);
    });
    this.subscriptions.push(messagesSub);

    // Subscribe to message updates
    const updatesSub = this.socketService.onMessageUpdated().subscribe(updatedMessage => {
      console.log('✏️ Message updated via socket:', updatedMessage);
      this.messages.update(msgs =>
        msgs.map(msg => msg._id === updatedMessage._id ? updatedMessage : msg)
      );
    });
    this.subscriptions.push(updatesSub);

    // Subscribe to message deletions
    const deletionsSub = this.socketService.onMessageDeleted().subscribe(({ messageId }) => {
      console.log('🗑️ Message deleted via socket:', messageId);
      this.messages.update(msgs => msgs.filter(msg => msg._id !== messageId));
    });
    this.subscriptions.push(deletionsSub);

    // Subscribe to typing indicators
    const typingSub = this.socketService.onUserTyping().subscribe(({ userId, userName, isTyping }) => {
      const currentUser = this.authService.currentUser();
      if (currentUser && userId !== currentUser._id) {
        if (isTyping) {
          this.typingUsers.update(users => [...users.filter(u => u !== userName), userName]);
        } else {
          this.typingUsers.update(users => users.filter(u => u !== userName));
        }
      }
    });
    this.subscriptions.push(typingSub);
  }

  private cleanupSocket() {
    console.log('🧹 Cleaning up socket connections');

    // Leave the hangout room
    this.socketService.leaveHangoutRoom(this.hangoutId);

    // Stop fallback polling
    this.stopFallbackPolling();

    // Unsubscribe from all subscriptions
    this.subscriptions.forEach(sub => sub.unsubscribe());
    this.subscriptions = [];
  }

  // Fallback polling when socket is not available
  private startFallbackPolling() {
    if (this.fallbackPollInterval) return; // Already polling

    console.log('📡 Starting fallback HTTP polling (socket unavailable)');
    this.fallbackPollInterval = setInterval(() => {
      this.loadRecentMessagesHttp();
    }, 3000); // Poll every 3 seconds as fallback
  }

  private stopFallbackPolling() {
    if (this.fallbackPollInterval) {
      console.log('⏹️ Stopping fallback HTTP polling');
      clearInterval(this.fallbackPollInterval);
      this.fallbackPollInterval = null;
    }
  }

  private loadRecentMessagesHttp() {
    // Use HTTP API to get recent messages as fallback
    this.chatService.getMessages(this.hangoutId, 10, 0, false).subscribe({
      next: (response) => {
        if (response.success && Array.isArray(response.data)) {
          const latestMessages = response.data.reverse();
          const currentMessages = this.messages();
          const currentMessageIds = new Set(currentMessages.map(msg => msg._id));
          const newMessages = latestMessages.filter(latest =>
            !currentMessageIds.has(latest._id)
          );

          if (newMessages.length > 0) {
            console.log('📥 Found new messages via HTTP fallback:', newMessages.length);
            this.messages.update(msgs => [...msgs, ...newMessages.reverse()]);
            newMessages.forEach(msg => this.newMessageEvent.emit(msg));
          }
        }
      },
      error: (err) => {
        console.error('💥 Fallback polling failed:', err);
      }
    });
  }


}