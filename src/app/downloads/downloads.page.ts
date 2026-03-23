import { Component } from '@angular/core';
import { Router } from '@angular/router';
import { DownloadService, DownloadedEpisodeRecord } from '../services/download.service';
import { StoryService } from '../services/story.service';

interface DownloadStoryGroup {
  storyId: string;
  storyTitle: string;
  storyThumbnail: string | null;
  episodes: DownloadedEpisodeRecord[];
}

@Component({
  selector: 'app-downloads',
  templateUrl: './downloads.page.html',
  styleUrls: ['./downloads.page.scss'],
  standalone: false,
})
export class DownloadsPage {
  downloads: DownloadedEpisodeRecord[] = [];
  groupedDownloads: DownloadStoryGroup[] = [];
  isLoading = true;
  storyService: StoryService;

  constructor(
    private router: Router,
    private downloadService: DownloadService,
    storyService: StoryService,
  ) {
    this.storyService = storyService;
  }

  ionViewWillEnter(): void {
    void this.loadDownloads();
  }

  async loadDownloads(): Promise<void> {
    this.isLoading = true;
    try {
      this.downloads = await this.downloadService.listDownloadsForCurrentUser();
      this.groupedDownloads = this.groupDownloads(this.downloads);
    } catch {
      this.downloads = [];
      this.groupedDownloads = [];
    } finally {
      this.isLoading = false;
    }
  }

  goBack(): void {
    this.router.navigateByUrl('/profile');
  }

  get totalEpisodes(): number {
    return this.downloads.length;
  }

  openDownload(record: DownloadedEpisodeRecord): void {
    if (!record?.storyId) return;
    this.router.navigate(['/story', record.storyId], {
      queryParams: { episodeId: record.episodeId },
    });
  }

  async removeDownload(record: DownloadedEpisodeRecord, ev: Event): Promise<void> {
    ev.stopPropagation();
    try {
      await this.downloadService.removeDownload(record);
      await this.loadDownloads();
    } catch {
      /* ignore */
    }
  }

  formatSize(bytes: number): string {
    if (!Number.isFinite(bytes) || bytes <= 0) return 'Saved offline';
    const kb = bytes / 1024;
    if (kb < 1024) return `${Math.round(kb)} KB`;
    const mb = kb / 1024;
    return `${mb >= 10 ? mb.toFixed(0) : mb.toFixed(1)} MB`;
  }

  formatDate(value: number): string {
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return 'Recently';
    return d.toLocaleDateString(undefined, { month: 'short', day: '2-digit', year: 'numeric' });
  }

  trackByGroup(_: number, item: DownloadStoryGroup): string {
    return item.storyId;
  }

  trackByEpisode(_: number, item: DownloadedEpisodeRecord): string {
    return item.id;
  }

  private groupDownloads(items: DownloadedEpisodeRecord[]): DownloadStoryGroup[] {
    const map = new Map<string, DownloadStoryGroup>();
    for (const item of items) {
      const existing = map.get(item.storyId);
      if (existing) {
        existing.episodes.push(item);
        continue;
      }
      map.set(item.storyId, {
        storyId: item.storyId,
        storyTitle: item.storyTitle,
        storyThumbnail: item.storyThumbnail,
        episodes: [item],
      });
    }

    return Array.from(map.values())
      .map(group => ({
        ...group,
        episodes: group.episodes.sort((a, b) => b.downloadedAt - a.downloadedAt),
      }))
      .sort((a, b) => b.episodes[0].downloadedAt - a.episodes[0].downloadedAt);
  }
}
