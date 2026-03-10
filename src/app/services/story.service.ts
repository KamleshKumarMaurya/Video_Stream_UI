import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';

@Injectable({
  providedIn: 'root'
})
export class StoryService {

  private base = `${environment.apiBase}/api`;

  constructor(private http: HttpClient) { }

  getStories(): Observable<any> {
    return this.http.get(`${this.base}/stories`);
  }

  getStory(id: string | number): Observable<any> {
    return this.http.get(`${this.base}/stories/${id}`);
  }

  getEpisodes(storyId: string | number): Observable<any> {
    return this.http.get(`${this.base}/stories/${storyId}/episodes`);
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

    return this.http.post(`${this.base}/upload/episode`, formData);
  }

  /**
   * Convert a possibly-relative path from API into an absolute URL using environment.apiBase.
   * If the path already looks like a full URL (http/https), return as-is.
   */
  toAbsUrl(path?: string|null): string | null {
    if(!path) return null;
    try{
      if(path.startsWith('http://')) return path;
    }catch(e){ /* ignore */ }
    // ensure leading slash
    const p = path.startsWith('/') ? path : '/' + path;
    return `${environment.apiBase}${p}`;
  }

}
