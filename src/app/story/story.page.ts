import { Component, OnDestroy, OnInit, inject } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { StoryService } from '../services/story.service';
import Hls from 'hls.js';

@Component({
  selector: 'app-story',
  standalone: false,
  templateUrl: './story.page.html',
  styleUrls: ['./story.page.scss'],
})
export class StoryPage implements OnInit, OnDestroy {
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  storyService = inject(StoryService);

  story: any = null;
  episodes: any[] = [];
  episodesLoaded = false;
  activeVideo: string | null = null;
  currentEpisode: any = null;

  isPlaying = false;
  currentTimeSec = 0;
  durationSec = 0;
  seeking = false;
  seekingValueSec = 0;

  isLiked = false;
  isBookmarked = false;
  isFullscreen = false;

  autoplayOn = true;
  playbackRate = 1.5;
  readonly playbackRates = [1, 1.5, 2];

  activeBottomTab: 'home' | 'explore' | 'story' | 'library' | 'profile' = 'story';
  role: 'admin' | 'customer' = 'customer';

  get isAdmin(): boolean {
    return this.role === 'admin';
  }

  private lastHeroTapAtMs = 0;
  private seekHudHideTimer: ReturnType<typeof setTimeout> | null = null;
  seekHudSide: 'left' | 'right' | null = null;
  seekHudText = '';

  private mediaEventsBound = false;
  private fullscreenHandlerBound = false;
  private onFullscreenChangeBound = () => this.onFullscreenChange();

  ngOnInit() {
    try {
      const role = localStorage.getItem('vs_role');
      if (role === 'admin' || role === 'customer') this.role = role;
    } catch {
      /* ignore */
    }

    const id = this.route.snapshot.paramMap.get('id');
    if (!id) return;

    this.episodes = [];
    this.currentEpisode = null;
    this.episodesLoaded = false;

    this.storyService.getStory(id).subscribe((res: any) => {
      this.story = res || null;
    });

    this.storyService.getEpisodes(id).subscribe({
      next: (res: any) => {
        this.episodes = res || [];
        this.episodesLoaded = true;
        if (this.episodes.length) {
          this.playEpisode(this.episodes[0]);
        }
      },
      error: () => {
        this.episodes = [];
        this.episodesLoaded = true;
      },
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

  get heroImageUrl(): string {
    const epThumb = this.storyService.toAbsUrl(this.currentEpisode?.thumbnail);
    const storyThumb = this.storyService.toAbsUrl(this.story?.thumbnail ?? this.story?.cover);
    return epThumb || storyThumb || 'assets/story.png';
  }
  onImgError(event: any) {
  event.target.src = 'assets/story.png';
}

  get playbackRateLabel(): string {
    const v = String(this.playbackRate);
    return `${v.endsWith('.0') ? v.slice(0, -2) : v}x`;
  }

  get episodeSeasonLabel(): string {
    const epNum = this.currentEpisode?.episodeNumber ?? this.currentEpisode?.episode ?? this.currentEpisode?.ep;
    const season = this.story?.season ?? this.currentEpisode?.seasonNumber ?? this.currentEpisode?.season ?? 1;
    const epLabel = epNum != null ? String(epNum).padStart(2, '0') : '01';
    return `EPISODE ${epLabel} • SEASON ${season}`;
  }

  get authorName(): string {
    return this.story?.author || this.story?.by || this.story?.creator || this.story?.user || 'Unknown';
  }

  get viewsLabel(): string {
    return this.story?.views || this.story?.viewCount || this.story?.view_count || '';
  }

  get nextEpisodes(): any[] {
    return this.episodes || [];
  }

  getNextLabel(ep: any, index: number): string {
    const epNum = ep?.episodeNumber ?? ep?.episode ?? ep?.ep ?? (index + 1);
    const tag = this.getEpisodeIndex(ep) === this.getCurrentEpisodeIndex() + 1 ? 'NEXT • ' : '';
    return `${tag}EP ${String(epNum).padStart(2, '0')}`;
  }

  getEpisodeListLabel(ep: any, index: number): string {
    const epNum = ep?.episodeNumber ?? ep?.episode ?? ep?.ep ?? (index + 1);
    const currentIdx = this.getCurrentEpisodeIndex();
    const epIdx = this.getEpisodeIndex(ep);
    const isNext = currentIdx >= 0 && epIdx === currentIdx + 1;
    const tag = isNext ? 'NEXT • ' : '';
    return `${tag}EP ${String(epNum).padStart(2, '0')}`;
  }

  private getEpisodeIndex(ep: any): number {
    const key = this.getEpisodeKey(ep);
    if (key == null) return -1;
    return (this.episodes || []).findIndex(e => this.getEpisodeKey(e) === key);
  }

  getEpisodeDuration(ep: any, index: number): string {
    if (ep?.duration) return String(ep.duration);
    const sec = Number(ep?.durationSec ?? ep?.duration_sec);
    if (Number.isFinite(sec) && sec > 0) return this.formatTime(sec);
    const samples = ['42:10', '38:45', '45:00', '34:20', '12:45'];
    return samples[index % samples.length];
  }

  toThumb(item: any): string {
    return this.storyService.toAbsUrl(item?.thumbnail) || this.heroImageUrl;
  }

  playEpisode(ep: any) {
    if (!ep) return;
    this.currentEpisode = ep;
    this.play(ep.videoUrl);
  }

  isEpisodeActive(ep: any): boolean {
    if (!ep || !this.currentEpisode) return false;
    const a = this.currentEpisode?.id ?? this.currentEpisode?.videoUrl ?? this.currentEpisode?.episodeNumber;
    const b = ep?.id ?? ep?.videoUrl ?? ep?.episodeNumber;
    return a === b;
  }

  private getEpisodeKey(ep: any): string | number | null {
    if (!ep) return null;
    return ep?.id ?? ep?.videoUrl ?? ep?.episodeNumber ?? null;
  }

  private getCurrentEpisodeIndex(): number {
    if (!this.currentEpisode) return -1;
    const key = this.getEpisodeKey(this.currentEpisode);
    if (key == null) return -1;

    const list = this.episodes || [];
    const byKey = list.findIndex(e => this.getEpisodeKey(e) === key);
    if (byKey >= 0) return byKey;

    return list.indexOf(this.currentEpisode);
  }

  playNextEpisode(): boolean {
    const list = this.episodes || [];
    const idx = this.getCurrentEpisodeIndex();
    if (idx < 0) return false;
    const next = list[idx + 1];
    if (!next) return false;
    this.playEpisode(next);
    return true;
  }

  playPrevEpisode(): boolean {
    const list = this.episodes || [];
    const idx = this.getCurrentEpisodeIndex();
    if (idx < 0) return false;
    const prev = list[idx - 1];
    if (!prev) return false;
    this.playEpisode(prev);
    return true;
  }

  isEpisodeNew(ep: any): boolean {
    const created = ep?.createdAt || ep?.created_at || ep?.createdOn || ep?.uploadedAt;
    if (!created) return false;
    const t = Date.parse(created);
    if (Number.isNaN(t)) return false;
    const ageMs = Date.now() - t;
    return ageMs >= 0 && ageMs <= (7 * 24 * 60 * 60 * 1000);
  }

  private getVideoEl(): HTMLVideoElement | null {
    return document.getElementById('story-video') as HTMLVideoElement | null;
  }

  private getHeroCardEl(): HTMLElement | null {
    return document.getElementById('hero-card') as HTMLElement | null;
  }

  private bindMediaEvents(video: HTMLVideoElement) {
    if (this.mediaEventsBound) return;
    this.mediaEventsBound = true;

    // iOS Safari native fullscreen (webkitEnterFullscreen).
    video.addEventListener('webkitbeginfullscreen' as any, () => {
      this.isFullscreen = true;
      try {
        video.controls = true;
      } catch {
        /* ignore */
      }
      void this.lockLandscape();
    });

    video.addEventListener('webkitendfullscreen' as any, () => {
      this.isFullscreen = false;
      try {
        video.controls = false;
      } catch {
        /* ignore */
      }
      try {
        (screen.orientation as any)?.unlock?.();
      } catch {
        /* ignore */
      }
    });

    video.addEventListener('loadedmetadata', () => {
      this.durationSec = Number.isFinite(video.duration) ? video.duration : 0;
      this.applyPlaybackRate(video);
    });

    video.addEventListener('durationchange', () => {
      this.durationSec = Number.isFinite(video.duration) ? video.duration : 0;
    });

    video.addEventListener('timeupdate', () => {
      if (this.seeking) return;
      this.currentTimeSec = Number.isFinite(video.currentTime) ? video.currentTime : 0;
    });

    video.addEventListener('play', () => {
      this.isPlaying = true;
    });

    video.addEventListener('pause', () => {
      this.isPlaying = false;
    });

    video.addEventListener('ended', () => {
      this.isPlaying = false;
      if (this.autoplayOn) this.playNextEpisode();
    });
  }

  private bindFullscreenEvents() {
    if (this.fullscreenHandlerBound) return;
    this.fullscreenHandlerBound = true;
    document.addEventListener('fullscreenchange', this.onFullscreenChangeBound);
    // iOS Safari / older WebKit
    document.addEventListener('webkitfullscreenchange' as any, this.onFullscreenChangeBound);
  }

  private onFullscreenChange() {
    const d: any = document as any;
    this.isFullscreen = Boolean(document.fullscreenElement || d.webkitFullscreenElement);

    const video = this.getVideoEl();
    if (video) {
      try {
        // In fullscreen we rely on native controls; custom overlay is hidden in the template.
        video.controls = this.isFullscreen;
      } catch {
        /* ignore */
      }
    }

    if (this.isFullscreen) {
      // Many browsers only allow orientation lock after fullscreen is active.
      void this.lockLandscape();
      return;
    }

    try {
      (screen.orientation as any)?.unlock?.();
    } catch (e) { /* ignore */ }
  }

  private async lockLandscape() {
    try {
      const o: any = screen.orientation as any;
      if (o?.lock) await o.lock('landscape');
    } catch (e) {
      // Orientation lock may fail (permissions/unsupported); ignore.
    }
  }

  formatTime(totalSeconds: number): string {
    const s = Math.max(0, Math.floor(Number(totalSeconds) || 0));
    const mm = Math.floor(s / 60);
    const ss = s % 60;
    return `${String(mm).padStart(2, '0')}:${String(ss).padStart(2, '0')}`;
  }

  togglePlay() {
    const video = this.getVideoEl();
    if (!video) return;
    if (video.paused) video.play().catch(() => { });
    else video.pause();
  }

  cyclePlaybackRate() {
    const idx = this.playbackRates.indexOf(this.playbackRate);
    const next = this.playbackRates[(idx >= 0 ? idx + 1 : 0) % this.playbackRates.length];
    this.playbackRate = next;
    const video = this.getVideoEl();
    if (video) this.applyPlaybackRate(video);
  }

  toggleAutoplay() {
    this.autoplayOn = !this.autoplayOn;
  }

  setBottomTab(tab: 'home' | 'explore' | 'story' | 'library' | 'profile') {
    this.activeBottomTab = tab;
    if (tab === 'story') return;
    if (tab === 'home') {
      this.router.navigateByUrl('/home?tab=home');
      return;
    }
    if (tab === 'explore') {
      this.router.navigateByUrl('/home?tab=explore');
      return;
    }
    if (tab === 'profile') {
      this.router.navigateByUrl('/profile');
      return;
    }
    if (tab === 'library') {
      if (!this.isAdmin) return;
      this.router.navigateByUrl('/users');
      return;
    }
    // eslint-disable-next-line no-console
    console.log('Bottom tab tapped:', tab);
  }

  async toggleFullscreen(ev?: Event) {
    ev?.stopPropagation();

    const video = this.getVideoEl();
    if (!video) return;
    const hero = this.getHeroCardEl();

    const d: any = document as any;
    const currentFsEl = document.fullscreenElement || d.webkitFullscreenElement;

    // If already fullscreen, exit.
    if (currentFsEl) {
      try {
        if (document.exitFullscreen) await document.exitFullscreen();
        else if (d.webkitExitFullscreen) d.webkitExitFullscreen();
      } catch (e) { /* ignore */ }
      return;
    }

    // Enter fullscreen (best effort across browsers).
    try {
      const anyVideo: any = video as any;
      const target: any = hero || video;

      // Prefer document fullscreen on the hero wrapper so we can apply rotation styles.
      if (target?.requestFullscreen) await target.requestFullscreen();
      else if (target?.webkitRequestFullscreen) target.webkitRequestFullscreen();
      else if (anyVideo.webkitEnterFullscreen) {
        // iOS native video fullscreen
        anyVideo.webkitEnterFullscreen();
      }
    } catch (e) { /* ignore */ }

    // Orientation lock is attempted again on `fullscreenchange`.
  }

  seekBy(deltaSeconds: number) {
    const video = this.getVideoEl();
    if (!video) return;
    const next = Math.min(Math.max(0, video.currentTime + deltaSeconds), Number.isFinite(video.duration) ? video.duration : video.currentTime + deltaSeconds);
    video.currentTime = next;
    this.currentTimeSec = next;
  }

  onHeroPointerUp(ev: PointerEvent) {
    if (!this.isPlaying) return;
    if (ev.button != null && ev.button !== 0) return; // only primary

    const target = ev.target as HTMLElement | null;
    if (target?.closest?.('.sp-fs-btn, .sp-hero-play')) return;

    const now = Date.now();
    const isDoubleTap = (now - this.lastHeroTapAtMs) <= 280;
    this.lastHeroTapAtMs = now;
    if (!isDoubleTap) return;

    const currentTarget = ev.currentTarget as HTMLElement | null;
    if (!currentTarget) return;
    const rect = currentTarget.getBoundingClientRect();
    const x = ev.clientX - rect.left;
    const side: 'left' | 'right' = x < rect.width / 2 ? 'left' : 'right';
    const delta = side === 'left' ? -5 : 5;

    this.seekBy(delta);
    this.showSeekHud(side, delta);
  }

  private showSeekHud(side: 'left' | 'right', deltaSeconds: number) {
    this.seekHudSide = side;
    this.seekHudText = deltaSeconds > 0 ? `+${deltaSeconds}s` : `${deltaSeconds}s`;

    if (this.seekHudHideTimer) clearTimeout(this.seekHudHideTimer);
    this.seekHudHideTimer = setTimeout(() => {
      this.seekHudSide = null;
    }, 650);
  }

  onSeekStart() {
    this.seeking = true;
    this.seekingValueSec = this.currentTimeSec;
  }

  onSeekInput(ev: any) {
    const v = Number(ev?.detail?.value);
    if (!Number.isFinite(v)) return;
    this.seekingValueSec = v;
  }

  onSeekEnd(ev: any) {
    const video = this.getVideoEl();
    const v = Number(ev?.detail?.value);
    this.seeking = false;
    if (!video || !Number.isFinite(v)) return;
    video.currentTime = v;
    this.currentTimeSec = v;
  }

  toggleLike() {
    this.isLiked = !this.isLiked;
  }

  toggleBookmark() {
    this.isBookmarked = !this.isBookmarked;
  }

  share() {
    // TODO: wire Capacitor Share plugin
    console.log('Share tapped', this.story?.title || this.currentEpisode?.title);
  }

  play(url: any) {

    this.bindFullscreenEvents();

    this.activeVideo = this.storyService.toAbsUrl(url) || url;
    if (!this.activeVideo) return;

    const video = this.getVideoEl();
    if (!video) return;
    this.bindMediaEvents(video);
    this.applyPlaybackRate(video);

    // Reset prior playback state to avoid event leaks when switching episodes.
    if (this.hls) {
      this.hls.destroy();
      this.hls = null;
    }
    this.availableQualities = [];
    this.selectedQualityLevel = -1;
    this.playingQuality = '';

    // Reset timeline
    this.currentTimeSec = 0;
    this.durationSec = 0;

    // Hide native controls (we use custom UI)
    video.controls = false;

    if (Hls.isSupported()) {

      this.hls = new Hls({
        startLevel: -1,

        xhrSetup: (xhr: XMLHttpRequest) => {
          xhr.setRequestHeader('ngrok-skip-browser-warning', 'true');
        }
      });

      this.hls.loadSource(this.activeVideo);
      this.hls.attachMedia(video);

      this.hls.on(Hls.Events.MANIFEST_PARSED, () => {
        video.play().catch(() => { });
      });

    }

    // Autoplay (best-effort)
    video.play().catch(() => { });
  }

  private applyPlaybackRate(video: HTMLVideoElement) {
    try {
      video.playbackRate = this.playbackRate;
    } catch {
      /* ignore */
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
    try {
      document.removeEventListener('fullscreenchange', this.onFullscreenChangeBound);
      document.removeEventListener('webkitfullscreenchange' as any, this.onFullscreenChangeBound);
    } catch (e) { /* ignore */ }

    if (this.seekHudHideTimer) {
      clearTimeout(this.seekHudHideTimer);
      this.seekHudHideTimer = null;
    }

    if (this.hls) {
      this.hls.destroy();
      this.hls = null;
    }
  }

}
