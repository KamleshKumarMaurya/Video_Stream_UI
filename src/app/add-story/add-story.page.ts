import { Component } from '@angular/core';
import { ToastController } from '@ionic/angular';
import { StoryService } from '../services/story.service';

@Component({
  selector: 'app-add-story',
  templateUrl: './add-story.page.html',
  styleUrls: ['./add-story.page.scss'],
  standalone: false,
})
export class AddStoryPage {
  form = {
    storyId: '',
    episodeNumber: '',
    title: '',
  };

  videoFile: File | null = null;
  thumbnailFile: File | null = null;
  isSubmitting = false;

  constructor(
    private storyService: StoryService,
    private toastController: ToastController
  ) {}

  onVideoChange(event: Event): void {
    const input = event.target as HTMLInputElement;
    this.videoFile = input.files?.[0] ?? null;
  }

  onThumbnailChange(event: Event): void {
    const input = event.target as HTMLInputElement;
    this.thumbnailFile = input.files?.[0] ?? null;
  }

  pickFile(input: HTMLInputElement): void {
    input.click();
  }

  async submit(): Promise<void> {
    if (this.isSubmitting) {
      return;
    }

    if (!this.form.storyId || !this.form.episodeNumber || !this.form.title || !this.videoFile || !this.thumbnailFile) {
      await this.showToast('Please fill all fields and select both files.');
      return;
    }

    this.isSubmitting = true;

    this.storyService.uploadEpisode({
      storyId: this.form.storyId,
      episodeNumber: this.form.episodeNumber,
      title: this.form.title,
      file: this.videoFile,
      thumbnail: this.thumbnailFile,
    }).subscribe({
      next: async () => {
        await this.showToast('Episode uploaded successfully.');
        this.form = { storyId: '', episodeNumber: '', title: '' };
        this.videoFile = null;
        this.thumbnailFile = null;
        this.isSubmitting = false;
      },
      error: async (err) => {
        console.error('Failed to upload episode', err);
        await this.showToast('Upload failed. Check API and try again.');
        this.isSubmitting = false;
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
