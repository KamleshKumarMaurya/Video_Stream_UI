import { Component, OnDestroy, OnInit } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { StoryService } from '../services/story.service';
import Hls from 'hls.js';

@Component({
  selector: 'app-story',
  standalone: false,
  templateUrl: './story.page.html',
  styleUrls: ['./story.page.scss'],
})
export class StoryPage implements OnInit, OnDestroy {

  story: any = null;
  episodes: any[] = [];
  activeVideo: string | null = null;

  constructor(private route: ActivatedRoute, public storyService: StoryService) { }

  ngOnInit() {
    const id = this.route.snapshot.paramMap.get('id');
    if (!id) return;

    // this.storyService.getStory(id).subscribe((res:any)=>{
    //   this.story = res;
    // });

    this.storyService.getEpisodes(id).subscribe((res: any) => {
      this.episodes = res || [];
      if (this.episodes.length) {
        this.play(this.episodes[0].videoUrl);
      }
    });
  }

  hls: Hls | null = null;
  availableQualities: Array<{ level: number; label: string; height?: number; bitrate?: number }> = [];
  selectedQualityLevel: number = -1; // -1 = Auto in hls.js
  playingQuality: string = '';
  qualityPopoverOpen = false;
  qualityPopoverEvent: Event | null = null;

  get qualityDisplayLabel(): string {
    if (!this.availableQualities.length) return '';
    const isAuto = this.selectedQualityLevel === -1;
    if (isAuto && this.playingQuality) return `Auto (${this.playingQuality})`;
    if (isAuto) return 'Auto';
    return this.playingQuality || this.availableQualities.find(q => q.level === this.selectedQualityLevel)?.label || '';
  }

  play(url: any) {

    this.activeVideo = this.storyService.toAbsUrl(url) || url;
    if (!this.activeVideo) return;

    const video: any = document.getElementById('story-video');

    // Reset prior playback state to avoid event leaks when switching episodes.
    if (this.hls) {
      this.hls.destroy();
      this.hls = null;
    }
    this.availableQualities = [];
    this.selectedQualityLevel = -1;
    this.playingQuality = '';

    if (Hls.isSupported()) {

      this.hls = new Hls({
        // Use network bandwidth estimation to pick a good start in Auto mode.
        startLevel: -1,
      });

      this.hls.loadSource(this.activeVideo);
      this.hls.attachMedia(video);

      this.hls.on(Hls.Events.MANIFEST_PARSED, () => {

        if (!this.hls) return;
        const levels = this.hls.levels || [];

        // Build a YouTube-like list: Auto + explicit resolutions.
        const parsed = levels
          .map((level: any, index: number) => ({
            level: index,
            height: level?.height,
            bitrate: level?.bitrate,
            label: level?.height ? `${level.height}p` : `Level ${index}`,
          }))
          .filter(q => Number.isFinite(q.height) && q.height! > 0)
          .sort((a, b) => (b.height! - a.height!));

        this.availableQualities = [
          { level: -1, label: 'Auto' },
          ...parsed,
        ];

        // Default to Auto, but keep UI in sync with hls state.
        this.selectedQualityLevel = -1;

      });

      // Detect when quality changes
      this.hls.on(Hls.Events.LEVEL_SWITCHED, (event: any, data: any) => {

        if (!this.hls) return;
        const level = this.hls.levels?.[data.level];
        if (level?.height) this.playingQuality = `${level.height}p`;

      });

    } else {
      video.src = this.activeVideo;
    }
  }

  openQuality(ev: Event) {
    if (!this.availableQualities.length) return;
    this.qualityPopoverEvent = ev;
    this.qualityPopoverOpen = true;
  }

  changeQuality(ev: any) {
    if (!this.hls) return;
    const nextLevel = Number(ev?.detail?.value);
    if (!Number.isFinite(nextLevel)) return;

    this.selectedQualityLevel = nextLevel;
    this.hls.currentLevel = nextLevel;
    this.qualityPopoverOpen = false;
  }

  ngOnDestroy(): void {
    if (this.hls) {
      this.hls.destroy();
      this.hls = null;
    }
  }

}
