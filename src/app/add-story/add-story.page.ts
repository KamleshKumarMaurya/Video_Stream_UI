import { Component, OnDestroy, OnInit, inject } from '@angular/core';
import { ToastController } from '@ionic/angular';
import { StoryService } from '../services/story.service';
import { Router } from '@angular/router';

@Component({
  selector: 'app-add-story',
  templateUrl: './add-story.page.html',
  styleUrls: ['./add-story.page.scss'],
  standalone: false,
})
export class AddStoryPage implements OnInit, OnDestroy {
  private storyService = inject(StoryService);
  private toastController = inject(ToastController);
  private router = inject(Router);

  storyForm = {
    title: '',
    description: '',
    latest_story: false,
  };
  isCreateStoryModalOpen = false;

  activeBottomTab: 'home' | 'explore' | 'create' | 'library' | 'profile' = 'create';
  role: 'admin' | 'customer' = 'customer';
  lastCreatedStoryId: string | number | null = null;

  get isAdmin(): boolean {
    return this.role === 'admin';
  }

  stories: any[] = [];
  isLoadingStories = false;
  activeUploads: any[] = [];
  isLoadingActiveUploads = false;
  private activeUploadsPollTimer: number | null = null;
  private isActiveUploadsPolling = false;

  storyThumbnailFile: File | null = null;
  isCreatingStory = false;

  ngOnInit(): void {
    try {
      const role = localStorage.getItem('vs_role');
      if (role === 'admin' || role === 'customer') this.role = role;
    } catch {
      /* ignore */
    }

    if (!this.isAdmin) {
      void this.showToast('Only admin can upload content.');
      this.router.navigateByUrl('/home?tab=home', { replaceUrl: true });
      return;
    }
  }

  ionViewWillEnter(): void {
    if (!this.isAdmin) return;
    this.isActiveUploadsPolling = true;
    this.loadStories();
    this.loadActiveUploads();
  }

  ionViewWillLeave(): void {
    this.isActiveUploadsPolling = false;
    this.stopActiveUploadsPolling();
  }

  ngOnDestroy(): void {
    this.isActiveUploadsPolling = false;
    this.stopActiveUploadsPolling();
  }

  loadStories(): void {
    if (this.isLoadingStories) return;
    this.isLoadingStories = true;
    this.storyService.getStories().subscribe({
      next: (res: any) => {
        this.stories = this.storyService.extractStories(res);
        this.isLoadingStories = false;
      },
      error: async (err) => {
        this.isLoadingStories = false;
        await this.showToast('Failed to load stories.');
      },
    });
  }

  loadActiveUploads(): void {
    if (this.isLoadingActiveUploads) return;
    this.isLoadingActiveUploads = true;

    this.storyService.getActiveUploads().subscribe({
      next: (res: any) => {
        const jobs = this.storyService.extractStories(res)
          .filter((job: any) => this.isActiveUpload(job))
          .sort((a: any, b: any) => this.getJobCreatedAtMs(b) - this.getJobCreatedAtMs(a));
        this.activeUploads = jobs;
        this.isLoadingActiveUploads = false;
      },
      error: async (err) => {
        this.isLoadingActiveUploads = false;
      },
    });
  }

  onStoryThumbnailChange(event: Event): void {
    const input = event.target as HTMLInputElement;
    this.storyThumbnailFile = input.files?.[0] ?? null;
  }

  pickFile(input: HTMLInputElement): void {
    input.click();
  }

  preventDefault(ev: Event): void {
    ev.preventDefault();
    ev.stopPropagation();
  }

  toCover(story: any): string {
    return this.storyService.toAbsUrl(story?.thumbnail ?? story?.cover) || 'assets/story.png';
  }

  getActiveUploadTitle(job: any): string {
    return job?.storyTitle || job?.story_title || job?.storyName || job?.title || `Job ${this.getJobId(job)}`;
  }

  getActiveUploadSubtitle(job: any): string {
    const episode = job?.episodeNumber ?? job?.episode_number ?? job?.episode ?? job?.episodeNo;
    const status = String(job?.status ?? job?.state ?? 'PROCESSING').trim();
    const parts = [`Status: ${status}`];
    if (episode != null && episode !== '') parts.unshift(`Episode ${episode}`);
    return parts.join(' • ');
  }

  getActiveUploadProgress(job: any): number {
    const raw =
      job?.progress ??
      job?.progressPercentage ??
      job?.progress_percent ??
      job?.percentage ??
      job?.percent ??
      job?.completion ??
      job?.completionPercent;

    const progress = Number(raw);
    if (Number.isFinite(progress)) return Math.max(0, Math.min(100, progress));

    const status = String(job?.status ?? job?.state ?? '').trim().toUpperCase();
    if (status === 'UPLOADING') return 65;
    if (status === 'PROCESSING') return 90;
    if (status === 'COMPLETED' || status === 'DONE' || status === 'SUCCESS') return 100;
    return 50;
  }

  getActiveUploadStatus(job: any): string {
    const status = String(job?.status ?? job?.state ?? 'PROCESSING').trim();
    const progress = this.getActiveUploadProgress(job);
    return progress ? `${status} • ${progress}%` : status;
  }

  getActiveUploadBadge(job: any): string {
    const status = String(job?.status ?? job?.state ?? 'PROCESSING').trim();
    return status.toUpperCase();
  }

  getActiveUploadHint(job: any): string {
    const storyId = job?.storyId ?? job?.story_id ?? job?.story?.id;
    const jobId = this.getJobId(job);
    if (storyId != null) return `Story #${storyId}${jobId != null ? ` • Job #${jobId}` : ''}`;
    return jobId != null ? `Job #${jobId}` : 'Active upload';
  }

  isActiveUpload(job: any): boolean {
    const status = String(job?.status ?? job?.state ?? '').trim().toUpperCase();
    return status ? ['UPLOADING', 'PROCESSING'].includes(status) : true;
  }

  private getJobId(job: any): string | number | null {
    return job?.jobId ?? job?.job_id ?? job?.id ?? null;
  }

  private getJobCreatedAtMs(job: any): number {
    const raw = job?.createdAt ?? job?.created_at ?? job?.created_at_ms ?? job?.createdAtMs;
    if (raw == null) return 0;
    if (typeof raw === 'number') return Number.isFinite(raw) ? raw : 0;

    const text = String(raw).trim();
    if (!text) return 0;

    const asNumber = Number(text);
    if (Number.isFinite(asNumber)) return asNumber;

    const parsed = Date.parse(text);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  private scheduleActiveUploadsRefresh(): void {
    if (!this.isActiveUploadsPolling) return;
    this.stopActiveUploadsPolling();
    this.activeUploadsPollTimer = window.setTimeout(() => this.loadActiveUploads(), 5000);
  }

  private stopActiveUploadsPolling(): void {
    if (this.activeUploadsPollTimer != null) {
      clearTimeout(this.activeUploadsPollTimer);
      this.activeUploadsPollTimer = null;
    }
  }

  setBottomTab(tab: 'home' | 'explore' | 'create' | 'library' | 'profile'): void {
    this.activeBottomTab = tab;
    if (tab === 'create') return;
    if (tab === 'home') {
      this.router.navigateByUrl('/home?tab=home');
      return;
    }
    if (tab === 'explore') {
      this.router.navigateByUrl('/home?tab=explore');
      return;
    }
    if (tab === 'library') {
      this.router.navigateByUrl('/users');
      return;
    }
    if (tab === 'profile') {
      this.router.navigateByUrl('/profile');
      return;
    }
  }

  openCreateStoryModal(): void {
    this.isCreateStoryModalOpen = true;
  }

  closeCreateStoryModal(): void {
    this.isCreateStoryModalOpen = false;
  }

  openUploadEpisode(): void {
    this.goToUploadEpisode();
  }

  async submitStory(): Promise<void> {
    if (this.isCreatingStory) return;

    if (!this.storyForm.title || !this.storyForm.description || !this.storyThumbnailFile) {
      await this.showToast('Please provide story title, description and thumbnail.');
      return;
    }

    this.isCreatingStory = true;
    this.storyService.createStory({
      title: this.storyForm.title,
      description: this.storyForm.description,
      latest_story: this.storyForm.latest_story,
      thumbnail: this.storyThumbnailFile,
    }).subscribe({
      next: async (created: any) => {
        await this.showToast('Story created.');
        const createdId = created?.id ?? created?.storyId ?? created?.data?.id;
        this.lastCreatedStoryId = createdId ?? null;
        this.storyForm = { title: '', description: '', latest_story: false };
        this.storyThumbnailFile = null;
        this.isCreatingStory = false;
        this.closeCreateStoryModal();
        this.loadStories();
      },
      error: async (err) => {
        await this.showToast('Failed to create story.');
        this.isCreatingStory = false;
      },
    });
  }

  goToUploadEpisode(): void {
    if (this.lastCreatedStoryId != null) {
      this.router.navigate(['/stories/upload-episode'], {
        queryParams: { storyId: this.lastCreatedStoryId },
      });
      return;
    }

    this.router.navigateByUrl('/stories/upload-episode');
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
