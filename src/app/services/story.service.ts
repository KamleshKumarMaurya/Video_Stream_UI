import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpHeaders, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';

@Injectable({
  providedIn: 'root'
})
export class StoryService {

  private base = `${environment.apiBase}/api`;

  private http = inject(HttpClient);

  private buildHeaders(): HttpHeaders {
    let headers = new HttpHeaders({
      'ngrok-skip-browser-warning': 'true',
    });

    const token = this.getAuthToken();
    if (token) headers = headers.set('Authorization', `Bearer ${token}`);

    return headers;
  }

  private getAuthToken(): string | null {
    try {
      return (
        localStorage.getItem('vs_auth_token') ||
        localStorage.getItem('vs_token') ||
        localStorage.getItem('auth_token') ||
        localStorage.getItem('token')
      );
    } catch {
      return null;
    }
  }

  extractStories(res: any): any[] {
    if (!res) return [];
    if (Array.isArray(res)) return res;
    const content = res?.content ?? res?.data ?? res?.stories;
    return Array.isArray(content) ? content : [];
  }

  getStories(opts?: { page?: number; size?: number }): Observable<any> {
    let params = new HttpParams();
    if (opts?.page != null) params = params.set('page', String(opts.page));
    if (opts?.size != null) params = params.set('size', String(opts.size));
    return this.http.get(`${this.base}/stories`, { headers: this.buildHeaders(), params });
  }

  getStory(id: string | number): Observable<any> {
    return this.http.get(`${this.base}/stories/${id}`, { headers: this.buildHeaders() });
  }

  getEpisodes(storyId: string | number): Observable<any> {
    return this.http.get(`${this.base}/stories/${storyId}/episodes`, { headers: this.buildHeaders() });
  }

  createStory(payload: { title: string; description: string; thumbnail: File }): Observable<any> {
    const formData = new FormData();
    formData.append('title', payload.title);
    formData.append('description', payload.description);
    formData.append('thumbnail', payload.thumbnail);

    return this.http.post(`${this.base}/stories`, formData, { headers: this.buildHeaders() });
  }

  uploadEpisode(payload: {
    storyId: string | number;
    episodeNumber: string | number;
    title: string;
    file: File;
    thumbnail: File;
  }): Observable<any> {
    const formData = new FormData();
    formData.append('storyId', String(payload.storyId));
    formData.append('episodeNumber', String(payload.episodeNumber));
    formData.append('title', payload.title);
    formData.append('file', payload.file);
    formData.append('thumbnail', payload.thumbnail);

    return this.http.post(`${this.base}/stories/upload-episode`, formData, { headers: this.buildHeaders() });
  }

  /**
   * Convert a possibly-relative path from API into an absolute URL using environment.apiBase.
   * If the path already looks like a full URL (http/https), return as-is.
   */
 toAbsUrl(path?: string | null): string | null {
  if (!path) return null;

  const trimmed = path.trim();
  if (!trimmed) return null;

  const base = environment.apiBase.replace(/\/$/, '');
  const p = trimmed.startsWith('/') ? trimmed : '/' + trimmed;

  return `${base}${p}?ngrok-skip-browser-warning=true`;
}
}
