import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import { Message, SendMessageDto, EditMessageDto, ChatResponse, DeleteMessageResponse } from './chat.model';

@Injectable({
  providedIn: 'root'
})
export class ChatService {
  private http = inject(HttpClient);
  private apiUrl = `${environment.apiUrl}/chat`;

  // Send a message to hangout chat
  sendMessage(sendMessageDto: SendMessageDto): Observable<ChatResponse> {
    return this.http.post<ChatResponse>(`${this.apiUrl}/message`, sendMessageDto);
  }

  // Get messages for a hangout chat
  getMessages(
    hangoutId: string, 
    limit: number = 50, 
    skip: number = 0, 
    restrictHistory: boolean = false
  ): Observable<ChatResponse> {
    let params = new HttpParams()
      .set('limit', limit.toString())
      .set('skip', skip.toString())
      .set('restrictHistory', restrictHistory.toString());

    return this.http.get<ChatResponse>(`${this.apiUrl}/hangout/${hangoutId}/messages`, { params });
  }

  // Get recent messages for a hangout (last 24 hours)
  getRecentMessages(hangoutId: string, hours: number = 24): Observable<ChatResponse> {
    let params = new HttpParams().set('hours', hours.toString());
    return this.http.get<ChatResponse>(`${this.apiUrl}/hangout/${hangoutId}/recent-messages`, { params });
  }

  // Edit a message
  editMessage(messageId: string, editMessageDto: EditMessageDto): Observable<ChatResponse> {
    return this.http.patch<ChatResponse>(`${this.apiUrl}/message/${messageId}`, editMessageDto);
  }

  // Delete a message
  deleteMessage(messageId: string): Observable<DeleteMessageResponse> {
    return this.http.delete<DeleteMessageResponse>(`${this.apiUrl}/message/${messageId}`);
  }
}