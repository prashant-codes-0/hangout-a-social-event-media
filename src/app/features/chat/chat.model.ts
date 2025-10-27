export interface Message {
  _id: string;
  hangoutId: string;
  userId: User;
  content: string;
  messageType: 'text' | 'image' | 'system';
  isEdited: boolean;
  editedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface User {
  _id: string;
  name: string;
  email: string;
}

export interface SendMessageDto {
  hangoutId: string;
  content: string;
  messageType?: 'text' | 'image' | 'system';
}

export interface EditMessageDto {
  content: string;
}

export interface ChatResponse {
  success: boolean;
  statusCode: number;
  message: string;
  data: Message | Message[];
  timestamp: string;
}

export interface DeleteMessageResponse {
  success: boolean;
  statusCode: number;
  message: string;
  data: {
    message: string;
    messageId: string;
  };
  timestamp: string;
}