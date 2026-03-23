import { HttpEventType } from '@angular/common/http';
import { Component, OnInit, inject } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { ToastController } from '@ionic/angular';
import { StoryService } from '../services/story.service';

@Component({
  selector: 'app-upload-episode',
  templateUrl: './upload-episode.page.html',
  styleUrls: ['./upload-episode.page.scss'],
  standalone: false,
})
export class UploadEpisodePage implements OnInit {
  private storyService = inject(StoryService);
  private toastController = inject(ToastController);
  private router = inject(Router);
  private route = inject(ActivatedRoute);

  stories: any[] = [];
  isLoadingStories = false;
  isUploadingEpisode = false;

  uploadForm = {
    storyId: '' as string | number,
    episodeNumber: '',
    title: '',
    category: 'Lifestyle',
  };

  videoFile: File | null = null;
  episodeThumbnailFile: File | null = null;
  private uploadStartToastShown = false;

  role: 'admin' | 'customer' = 'customer';

  get isAdmin(): boolean {
    return this.role === 'admin';
  }

  ngOnInit(): void {
    try {
      const role = localStorage.getItem('vs_role');
      if (role === 'admin' || role === 'customer') this.role = role;
    } catch {
      /* ignore */
    }

    if (!this.isAdmin) {
      void this.showToast('Only admin can upload episodes.');
      this.router.navigateByUrl('/home?tab=home', { replaceUrl: true });
      return;
    }

    this.route.queryParamMap.subscribe((params) => {
      const storyId = params.get('storyId');
      if (storyId) this.uploadForm.storyId = storyId;
    });

    this.loadStories();
  }

  loadStories(): void {
    if (this.isLoadingStories) return;
    this.isLoadingStories = true;

    this.storyService.getStories().subscribe({
      next: (res: any) => {
        this.stories = this.storyService.extractStories(res).sort(
          (a, b) => this.getStoryCreatedAtMs(b) - this.getStoryCreatedAtMs(a),
        );
        this.isLoadingStories = false;
      },
      error: async (err) => {
        this.isLoadingStories = false;
        await this.showToast('Failed to load stories.');
      },
    });
  }

  pickFile(input: HTMLInputElement): void {
    input.click();
  }

  preventDefault(ev: Event): void {
    ev.preventDefault();
    ev.stopPropagation();
  }

  onVideoChange(event: Event): void {
    const input = event.target as HTMLInputElement;
    this.videoFile = input.files?.[0] ?? null;
  }

  onThumbnailChange(event: Event): void {
    const input = event.target as HTMLInputElement;
    this.episodeThumbnailFile = input.files?.[0] ?? null;
  }

  onVideoDrop(ev: DragEvent): void {
    this.preventDefault(ev);
    const file = ev.dataTransfer?.files?.[0];
    if (file) this.videoFile = file;
  }

  onThumbDrop(ev: DragEvent): void {
    this.preventDefault(ev);
    const file = ev.dataTransfer?.files?.[0];
    if (file) this.episodeThumbnailFile = file;
  }

  toCover(story: any): string {
    return this.storyService.toAbsUrl(story?.thumbnail ?? story?.cover) || 'assets/story.png';
  }

  goBackToAddStory(): void {
    this.router.navigateByUrl('/stories/add');
  }

  async submitEpisode(): Promise<void> {
    if (this.isUploadingEpisode) return;

    if (!this.uploadForm.storyId || !this.uploadForm.episodeNumber || !this.uploadForm.title || !this.videoFile || !this.episodeThumbnailFile) {
      await this.showToast('Please fill all fields and select both files.');
      return;
    }

    this.isUploadingEpisode = true;
    this.uploadStartToastShown = false;

    this.storyService.uploadEpisodeWithProgress({
      storyId: this.uploadForm.storyId,
      episodeNumber: this.uploadForm.episodeNumber,
      title: this.uploadForm.title,
      file: this.videoFile,
      thumbnail: this.episodeThumbnailFile,
    }).subscribe({
      next: async (event) => {
        if (event.type === HttpEventType.Sent) {
          if (!this.uploadStartToastShown) {
            this.uploadStartToastShown = true;
          }
          return;
        }

        if (event.type === HttpEventType.Response) {
          this.isUploadingEpisode = false;
          this.uploadStartToastShown = false;
          this.uploadForm.episodeNumber = '';
          this.uploadForm.title = '';
          this.uploadForm.category = 'Lifestyle';
          this.videoFile = null;
          this.episodeThumbnailFile = null;
          await this.showToast('Your upload started.');
          this.goBackToAddStory();
        }
      },
      error: async (err) => {
        this.isUploadingEpisode = false;
        this.uploadStartToastShown = false;
        await this.showToast('Upload failed. Check API and try again.');
      },
    });
  }

  private getStoryCreatedAtMs(story: any): number {
    const raw = story?.createdAt ?? story?.created_at ?? story?.created_at_ms ?? story?.createdAtMs;
    if (raw == null) return 0;
    if (typeof raw === 'number') return Number.isFinite(raw) ? raw : 0;

    const text = String(raw).trim();
    if (!text) return 0;

    const asNumber = Number(text);
    if (Number.isFinite(asNumber)) return asNumber;

    const parsed = Date.parse(text);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  private async showToast(message: string): Promise<void> {
    const toast = await this.toastController.create({
      message,
      duration: 2200,
      position: 'bottom',
    });
    await toast.present();
  }
}
