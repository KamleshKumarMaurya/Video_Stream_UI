import { Component, OnInit, inject } from '@angular/core';
import { ToastController } from '@ionic/angular';
import { StoryService } from '../services/story.service';
import { Router } from '@angular/router';

@Component({
  selector: 'app-add-story',
  templateUrl: './add-story.page.html',
  styleUrls: ['./add-story.page.scss'],
  standalone: false,
})
export class AddStoryPage implements OnInit {
  private storyService = inject(StoryService);
  private toastController = inject(ToastController);
  private router = inject(Router);

  storyForm = {
    title: '',
    description: '',
  };

  episodeForm = {
    storyId: '' as string | number,
    episodeNumber: '',
    title: '',
    category: 'Lifestyle',
  };

  activeBottomTab: 'home' | 'explore' | 'create' | 'library' | 'profile' = 'create';
  role: 'admin' | 'customer' = 'customer';

  get isAdmin(): boolean {
    return this.role === 'admin';
  }

  get isSubmitting(): boolean {
    return this.isUploadingEpisode;
  }

  stories: any[] = [];
  isLoadingStories = false;

  storyThumbnailFile: File | null = null;
  isCreatingStory = false;

  videoFile: File | null = null;
  episodeThumbnailFile: File | null = null;
  isUploadingEpisode = false;

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
    this.loadStories();
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
        // eslint-disable-next-line no-console
        console.error('Failed to fetch stories', err);
        this.isLoadingStories = false;
        await this.showToast('Failed to load stories.');
      },
    });
  }

  onVideoChange(event: Event): void {
    const input = event.target as HTMLInputElement;
    this.videoFile = input.files?.[0] ?? null;
  }

  onThumbnailChange(event: Event): void {
    const input = event.target as HTMLInputElement;
    this.episodeThumbnailFile = input.files?.[0] ?? null;
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
    // TODO: wire library/profile when routes exist
    // eslint-disable-next-line no-console
    console.log('Bottom tab tapped:', tab);
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
      thumbnail: this.storyThumbnailFile,
    }).subscribe({
      next: async (created: any) => {
        await this.showToast('Story created.');
        const createdId = created?.id ?? created?.storyId ?? created?.data?.id;
        this.storyForm = { title: '', description: '' };
        this.storyThumbnailFile = null;
        this.isCreatingStory = false;
        this.loadStories();
        if (createdId != null) this.episodeForm.storyId = createdId;
      },
      error: async (err) => {
        console.error('Failed to create story', err);
        await this.showToast('Failed to create story.');
        this.isCreatingStory = false;
      },
    });
  }

  async submitEpisode(): Promise<void> {
    if (this.isUploadingEpisode) {
      return;
    }

    if (!this.episodeForm.storyId || !this.episodeForm.episodeNumber || !this.episodeForm.title || !this.videoFile || !this.episodeThumbnailFile) {
      await this.showToast('Please fill all fields and select both files.');
      return;
    }

    this.isUploadingEpisode = true;

    this.storyService.uploadEpisode({
      storyId: this.episodeForm.storyId,
      episodeNumber: this.episodeForm.episodeNumber,
      title: this.episodeForm.title,
      file: this.videoFile,
      thumbnail: this.episodeThumbnailFile,
    }).subscribe({
      next: async () => {
        await this.showToast('Episode uploaded successfully.');
        this.episodeForm = {
          storyId: '',
          episodeNumber: '',
          title: '',
          category: 'Lifestyle',
        };
        this.videoFile = null;
        this.episodeThumbnailFile = null;
        this.isUploadingEpisode = false;
      },
      error: async (err) => {
        console.error('Failed to upload episode', err);
        await this.showToast('Upload failed. Check API and try again.');
        this.isUploadingEpisode = false;
      }
    });
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
