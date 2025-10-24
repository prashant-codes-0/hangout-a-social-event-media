import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { Hangout, CreateHangoutDto, HangoutFilters } from './hangout.model';

@Injectable({
    providedIn: 'root'
})
export class HangoutService {
    private http = inject(HttpClient);
    private apiUrl = 'http://localhost:3000/hangouts';

    getAllHangouts(filters?: HangoutFilters): Observable<{ success: boolean; data: Hangout[] }> {
        let params = new HttpParams();

        if (filters?.purpose) {
            params = params.set('purpose', filters.purpose);
        }
        if (filters?.place) {
            params = params.set('place', filters.place);
        }
        if (filters?.date) {
            params = params.set('date', filters.date);
        }

        return this.http.get<{ success: boolean; data: Hangout[] }>(this.apiUrl, { params });
    }

    getHangoutById(id: string): Observable<{ success: boolean; data: Hangout }> {
        return this.http.get<{ success: boolean; data: Hangout }>(`${this.apiUrl}/${id}`);
    }

    createHangout(hangout: CreateHangoutDto): Observable<{ success: boolean; data: Hangout }> {
        return this.http.post<{ success: boolean; data: Hangout }>(this.apiUrl, hangout);
    }

    updateHangout(id: string, hangout: Partial<CreateHangoutDto>): Observable<{ success: boolean; data: Hangout }> {
        return this.http.patch<{ success: boolean; data: Hangout }>(`${this.apiUrl}/${id}`, hangout);
    }

    deleteHangout(id: string): Observable<{ success: boolean; message: string }> {
        return this.http.delete<{ success: boolean; message: string }>(`${this.apiUrl}/${id}`);
    }

    joinHangout(id: string): Observable<any> {
        return this.http.post(`${this.apiUrl}/${id}/join`, {});
    }

    leaveHangout(id: string): Observable<any> {
        return this.http.post(`${this.apiUrl}/${id}/leave`, {});
    }

    toggleBlast(id: string): Observable<any> {
        return this.http.post(`${this.apiUrl}/${id}/blast`, {});
    }

    getMyHangouts(): Observable<{ success: boolean; data: Hangout[] }> {
        return this.http.get<{ success: boolean; data: Hangout[] }>(`${this.apiUrl}/my-hangouts`);
    }

    getJoinedHangouts(): Observable<{ success: boolean; data: Hangout[] }> {
        return this.http.get<{ success: boolean; data: Hangout[] }>(`${this.apiUrl}/joined-hangouts`);
    }

    searchHangouts(query: string, filters?: HangoutFilters): Observable<{ success: boolean; data: Hangout[] }> {
        let params = new HttpParams();
        
        if (query) {
            params = params.set('q', query);
        }
        if (filters?.purpose) {
            params = params.set('purpose', filters.purpose);
        }
        if (filters?.place) {
            params = params.set('place', filters.place);
        }
        if (filters?.date) {
            params = params.set('date', filters.date);
        }

        return this.http.get<{ success: boolean; data: Hangout[] }>(`${this.apiUrl}/search`, { params });
    }
}