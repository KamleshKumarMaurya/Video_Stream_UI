import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpEventType, HttpHeaders } from '@angular/common/http';
import { firstValueFrom, Observable } from 'rxjs';
import { environment } from '../../environments/environment';
import { StoryService } from './story.service';

export interface DownloadedEpisodeRecord {
  id: string;
  ownerKey: string;
  storyId: string;
  storyTitle: string;
  storyThumbnail: string | null;
  episodeId: string;
  episodeTitle: string;
  episodeNumber: string | number | null;
  episodeThumbnail: string | null;
  sourceUrl: string;
  fileName: string;
  mimeType: string;
  size: number;
  downloadedAt: number;
  blob: Blob;
}

export interface DownloadProgressState {
  phase: 'requesting' | 'downloading' | 'saving' | 'done';
  percent: number;
}

@Injectable({
  providedIn: 'root',
})
export class DownloadService {
  private readonly base = `${environment.apiBase}/api`;
  private readonly dbName = 'storixa_downloads_db';
  private readonly storeName = 'episode_downloads';

  private http = inject(HttpClient);
  private storyService = inject(StoryService);

  private dbPromise: Promise<IDBDatabase> | null = null;

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

  getDownloadUrl(episodeId: string | number): Observable<{ url: string }> {
    return this.storyService.getDownloadUrl(episodeId);
  }

  async downloadEpisode(
    story: any,
    episode: any,
    onProgress?: (state: DownloadProgressState) => void,
  ): Promise<{ added: boolean; reason?: 'exists' | 'failed'; record?: DownloadedEpisodeRecord }> {
    const episodeKey = this.getEpisodeKey(episode);
    if (!episodeKey) return { added: false, reason: 'failed' };

    const existing = await this.getByEpisodeKey(episodeKey);
    if (existing) return { added: false, reason: 'exists', record: existing };

    onProgress?.({ phase: 'requesting', percent: 0 });
    const response = await firstValueFrom(this.getDownloadUrl(episodeKey));
    const rawUrl = response?.url;
    if (!rawUrl) return { added: false, reason: 'failed' };

    const absoluteUrl = this.normalizeUrl(rawUrl);
    const blob = await this.downloadBlobWithProgress(absoluteUrl, onProgress);
    onProgress?.({ phase: 'saving', percent: 100 });

    const record: DownloadedEpisodeRecord = {
      id: this.makeRecordId(episodeKey),
      ownerKey: this.getOwnerKey(),
      storyId: String(story?.id ?? ''),
      storyTitle: String(story?.title ?? 'Story'),
      storyThumbnail: this.getStoryThumbnail(story),
      episodeId: episodeKey,
      episodeTitle: String(episode?.title ?? `Episode ${episode?.episodeNumber ?? ''}`),
      episodeNumber: this.getEpisodeNumber(episode),
      episodeThumbnail: this.getEpisodeThumbnail(episode),
      sourceUrl: absoluteUrl,
      fileName: this.makeFileName(story, episode, absoluteUrl),
      mimeType: blob.type || 'video/mp4',
      size: blob.size || 0,
      downloadedAt: Date.now(),
      blob,
    };

    await this.putRecord(record);
    onProgress?.({ phase: 'done', percent: 100 });
    return { added: true, record };
  }

  async listDownloadsForCurrentUser(): Promise<DownloadedEpisodeRecord[]> {
    const ownerKey = this.getOwnerKey();
    const all = await this.getAllRecords();
    return all
      .filter(record => record.ownerKey === ownerKey)
      .sort((a, b) => b.downloadedAt - a.downloadedAt);
  }

  async getDownloadCountForCurrentUser(): Promise<number> {
    const items = await this.listDownloadsForCurrentUser();
    return items.length;
  }

  async removeDownload(recordOrId: string | DownloadedEpisodeRecord): Promise<boolean> {
    const id = typeof recordOrId === 'string' ? recordOrId : recordOrId.id;
    const db = await this.openDb();

    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(this.storeName, 'readwrite');
      const store = tx.objectStore(this.storeName);
      const req = store.delete(id);

      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
      tx.onerror = () => reject(tx.error);
    });

    return true;
  }

  async hasDownloadedEpisode(episodeId: string | number): Promise<boolean> {
    return !!(await this.getByEpisodeKey(this.getEpisodeKeyFromValue(episodeId)));
  }

  async getByEpisodeKey(episodeKey: string): Promise<DownloadedEpisodeRecord | null> {
    const id = this.makeRecordId(episodeKey);
    const db = await this.openDb();

    return await new Promise<DownloadedEpisodeRecord | null>((resolve, reject) => {
      const tx = db.transaction(this.storeName, 'readonly');
      const store = tx.objectStore(this.storeName);
      const req = store.get(id);

      req.onsuccess = () => resolve((req.result as DownloadedEpisodeRecord) || null);
      req.onerror = () => reject(req.error);
      tx.onerror = () => reject(tx.error);
    });
  }

  private async putRecord(record: DownloadedEpisodeRecord): Promise<void> {
    const db = await this.openDb();

    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(this.storeName, 'readwrite');
      const store = tx.objectStore(this.storeName);
      const req = store.put(record);

      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
      tx.onerror = () => reject(tx.error);
    });
  }

  private downloadBlobWithProgress(url: string, onProgress?: (state: DownloadProgressState) => void): Promise<Blob> {
    return new Promise<Blob>((resolve, reject) => {
      let latestPercent = 0;
      const request = this.http.get(url, {
        headers: this.buildHeaders(),
        responseType: 'blob',
        observe: 'events',
        reportProgress: true,
      });

      const sub = request.subscribe({
        next: (event) => {
          if (event.type === HttpEventType.DownloadProgress) {
            const total = Number(event.total ?? 0);
            if (total > 0) {
              latestPercent = Math.min(99, Math.max(latestPercent, Math.round((event.loaded / total) * 100)));
            } else {
              latestPercent = Math.min(99, Math.max(latestPercent, Math.round(event.loaded / (1024 * 1024) * 12)));
            }
            onProgress?.({ phase: 'downloading', percent: latestPercent });
            return;
          }

          if (event.type === HttpEventType.Response) {
            onProgress?.({ phase: 'downloading', percent: 100 });
            resolve(event.body as Blob);
          }
        },
        error: (err) => {
          reject(err);
        },
      });

      return () => sub.unsubscribe();
    });
  }

  private async getAllRecords(): Promise<DownloadedEpisodeRecord[]> {
    const db = await this.openDb();

    return await new Promise<DownloadedEpisodeRecord[]>((resolve, reject) => {
      const tx = db.transaction(this.storeName, 'readonly');
      const store = tx.objectStore(this.storeName);
      const req = store.getAll();

      req.onsuccess = () => resolve((req.result as DownloadedEpisodeRecord[]) || []);
      req.onerror = () => reject(req.error);
      tx.onerror = () => reject(tx.error);
    });
  }

  private openDb(): Promise<IDBDatabase> {
    if (this.dbPromise) return this.dbPromise;

    this.dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(this.dbName, 1);

      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(this.storeName)) {
          const store = db.createObjectStore(this.storeName, { keyPath: 'id' });
          store.createIndex('ownerKey', 'ownerKey', { unique: false });
          store.createIndex('episodeId', 'episodeId', { unique: false });
          store.createIndex('storyId', 'storyId', { unique: false });
        }
      };

      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });

    return this.dbPromise;
  }

  private getOwnerKey(): string {
    try {
      return (
        localStorage.getItem('vs_user_id') ||
        localStorage.getItem('vs_phone') ||
        localStorage.getItem('vs_email') ||
        localStorage.getItem('vs_role') ||
        'guest'
      );
    } catch {
      return 'guest';
    }
  }

  private getEpisodeKey(episode: any): string | null {
    const key = episode?.id ?? episode?.episodeId ?? episode?.episodeNumber ?? episode?.ep ?? episode?.videoUrl ?? null;
    return key == null || key === '' ? null : String(key);
  }

  private getEpisodeKeyFromValue(value: string | number): string {
    return String(value);
  }

  private getStoryThumbnail(story: any): string | null {
    return story?.thumbnail ?? story?.cover ?? story?.image ?? null;
  }

  private getEpisodeThumbnail(episode: any): string | null {
    return episode?.thumbnail ?? episode?.thumb ?? null;
  }

  private getEpisodeNumber(episode: any): string | number | null {
    return episode?.episodeNumber ?? episode?.episode ?? episode?.ep ?? null;
  }

  private normalizeUrl(url: string): string {
    const trimmed = String(url || '').trim();
    if (!trimmed) return trimmed;
    if (/^https?:\/\//i.test(trimmed)) return trimmed;

    const base = environment.apiBase.replace(/\/$/, '');
    const path = trimmed.startsWith('/') ? trimmed : `/${trimmed}`;
    return `${base}${path}`;
  }

  private makeRecordId(episodeKey: string): string {
    return `${this.getOwnerKey()}::${episodeKey}`;
  }

  private makeFileName(story: any, episode: any, url: string): string {
    const rawName = `${story?.title || 'story'}-${episode?.title || `episode-${episode?.episodeNumber || '1'}`}`;
    const clean = rawName
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 80);

    const extension = this.getFileExtension(url) || 'mp4';
    return `${clean || 'downloaded-episode'}.${extension}`;
  }

  private getFileExtension(url: string): string | null {
    try {
      const lastPart = url.split('?')[0].split('/').pop() || '';
      const match = lastPart.match(/\.([a-z0-9]+)$/i);
      return match ? match[1].toLowerCase() : null;
    } catch {
      return null;
    }
  }
}
