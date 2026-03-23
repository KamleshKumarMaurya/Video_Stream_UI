import { Component, OnDestroy, OnInit, inject } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { ToastController } from '@ionic/angular';
import { StoryService } from '../services/story.service';
import { AdminService } from '../services/admin.service';
import { WishlistService } from '../services/wishlist.service';
import { DownloadProgressState, DownloadService } from '../services/download.service';
import { firstValueFrom } from 'rxjs';
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
  private toastController = inject(ToastController);
  storyService = inject(StoryService);
  private adminService = inject(AdminService);
  private wishlistService = inject(WishlistService);
  private downloadService = inject(DownloadService);

  story: any = null;
  episodes: any[] = [];
  episodesLoaded = false;
  activeVideo: string | null = null;
  currentEpisode: any = null;

  isPlaying = false;
  isVideoLoading = false;
  currentTimeSec = 0;
  durationSec = 0;
  seeking = false;
  seekingValueSec = 0;

  isLiked = false;
  isBookmarked = false;
  isWishlisted = false;
  isFullscreen = false;

  autoplayOn = true;
  playbackRate = 1;
  readonly playbackRates = [1, 1.25, 1.5, 2];

  activeBottomTab: 'home' | 'explore' | 'story' | 'library' | 'profile' = 'story';
  role: 'admin' | 'customer' = 'customer';

  readonly freeEpisodeCount = 2;
  subscriptionChecked = false;
  subscriptionActive = false;
  subscriptionExpiryMs: number | null = null;
  isCheckingSubscription = false;
  private lastSubscriptionCheckAtMs = 0;

  lockOpen = false;
  lockedEpisode: any | null = null;
  lockedEpisodeIndex = -1;
  downloadedEpisodeKeys = new Set<string>();
  downloadingEpisodeKeys = new Set<string>();
  downloadProgressByKey = new Map<string, DownloadProgressState>();
  private activeLocalObjectUrl: string | null = null;
  private pendingEpisodeKey: string | null = null;

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
    this.pendingEpisodeKey =
      this.route.snapshot.queryParamMap.get('episodeId') ||
      this.route.snapshot.queryParamMap.get('episode') ||
      this.route.snapshot.queryParamMap.get('ep') ||
      null;

    this.episodes = [];
    this.currentEpisode = null;
    this.episodesLoaded = false;

    this.storyService.getStory(id).subscribe((res: any) => {
      this.story = res || null;
      this.syncWishlistState();
    });

    this.storyService.getEpisodes(id).subscribe({
      next: (res: any) => {
        this.episodes = res || [];
        this.episodesLoaded = true;
        if (this.episodes.length) {
          const initialIndex = this.getInitialEpisodeIndex();
          const targetIndex = initialIndex >= 0 ? initialIndex : 0;
          const targetEpisode = this.episodes[targetIndex];
          if (targetEpisode) {
            void this.requestPlayEpisode(targetEpisode, targetIndex, 'init');
          }
        }
      },
      error: () => {
        this.episodes = [];
        this.episodesLoaded = true;
      },
    });

    void this.refreshSubscriptionFromBackend(true);
  }

  ionViewWillEnter(): void {
    void this.refreshSubscriptionFromBackend(true);
    this.syncWishlistState();
    void this.refreshDownloadedState();
  }

  hls: Hls | null = null;
  availableQualities: Array<{ level: number; label: string; height?: number; bitrate?: number }> = [];
  selectedQualityLevel: number = -1;
  playingQuality: string = '';
  qualityPopoverOpen = false;

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

  get wishlistButtonLabel(): string {
    return this.isWishlisted ? 'Remove from wishlist' : 'Add to wishlist';
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

  get isSubscribed(): boolean {
    if (this.isAdmin) return true;
    if (!this.subscriptionChecked) return false;
    if (!this.subscriptionActive) return false;
    if (this.subscriptionExpiryMs != null) return this.subscriptionExpiryMs > Date.now();
    return true;
  }

  isEpisodeLockedByIndex(index: number): boolean {
    if (this.isAdmin) return false;
    if (index < 0) return false;
    if (this.isSubscribed) return false;
    return index >= this.freeEpisodeCount;
  }

  get lockedEpisodeLabel(): string {
    const n = this.lockedEpisodeIndex >= 0 ? this.lockedEpisodeIndex + 1 : 0;
    return String(n || 0).padStart(2, '0');
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

  private getInitialEpisodeIndex(): number {
    if (!this.pendingEpisodeKey) return -1;
    return (this.episodes || []).findIndex(ep => this.getEpisodeKey(ep) === this.pendingEpisodeKey);
  }

  getEpisodeDuration(ep: any, index: number): string {
    const raw = ep?.duration ?? ep?.durationSec ?? ep?.duration_sec;

    if (typeof raw === 'number' && Number.isFinite(raw) && raw > 0) {
      return this.formatTime(raw);
    }

    if (typeof raw === 'string') {
      const trimmed = raw.trim();
      if (trimmed) {
        const asNum = Number(trimmed);
        if (Number.isFinite(asNum) && asNum > 0) return this.formatTime(asNum);

        if (trimmed.includes(':')) {
          const parts = trimmed.split(':').map(p => p.trim());
          if (parts.length === 2) {
            const mm = Number(parts[0]);
            const ss = Number(parts[1]);
            if (Number.isFinite(mm) && Number.isFinite(ss) && mm >= 0 && ss >= 0) {
              return `${String(Math.floor(mm)).padStart(2, '0')}:${String(Math.floor(ss)).padStart(2, '0')}`;
            }
          }
          if (parts.length === 3) {
            const hh = Number(parts[0]);
            const mm = Number(parts[1]);
            const ss = Number(parts[2]);
            if (Number.isFinite(hh) && Number.isFinite(mm) && Number.isFinite(ss) && hh >= 0 && mm >= 0 && ss >= 0) {
              return `${String(Math.floor(hh))}:${String(Math.floor(mm)).padStart(2, '0')}:${String(Math.floor(ss)).padStart(2, '0')}`;
            }
          }

          return trimmed;
        }
      }
    }

    return '00:00';
  }

  toThumb(item: any): string {
    return this.storyService.toAbsUrl(item?.thumbnail) || this.heroImageUrl;
  }

  async onEpisodeTap(ep: any, index: number): Promise<void> {
    await this.requestPlayEpisode(ep, index, 'user');
  }

  async downloadEpisode(ep: any, index: number, ev: Event): Promise<void> {
    ev.stopPropagation();

    if (this.isEpisodeLockedByIndex(index)) {
      await this.showToast('Subscribe to download this episode.');
      return;
    }

    const episodeKey = this.getEpisodeDownloadKey(ep);
    if (!episodeKey) {
      await this.showToast('Episode is not ready yet.');
      return;
    }

    if (this.downloadedEpisodeKeys.has(episodeKey)) {
      await this.showToast('Episode already downloaded.');
      return;
    }

    if (this.downloadingEpisodeKeys.has(episodeKey)) return;

    this.downloadingEpisodeKeys.add(episodeKey);
    this.downloadProgressByKey.set(episodeKey, { phase: 'requesting', percent: 0 });
    try {
      const result = await this.downloadService.downloadEpisode(this.story, ep, (state) => {
        this.downloadProgressByKey.set(episodeKey, state);
      });
      if (result.added && result.record) {
        this.downloadedEpisodeKeys.add(result.record.episodeId);
        this.downloadProgressByKey.set(episodeKey, { phase: 'done', percent: 100 });
        await this.showToast('Episode downloaded.');
      } else if (result.reason === 'exists') {
        this.downloadedEpisodeKeys.add(episodeKey);
        this.downloadProgressByKey.set(episodeKey, { phase: 'done', percent: 100 });
        await this.showToast('Episode already downloaded.');
      } else {
        this.downloadProgressByKey.delete(episodeKey);
        await this.showToast('Download failed.');
      }
    } catch {
      this.downloadProgressByKey.delete(episodeKey);
      await this.showToast('Download failed.');
    } finally {
      this.downloadingEpisodeKeys.delete(episodeKey);
    }
  }

  private async requestPlayEpisode(ep: any, index: number, source: 'user' | 'autoplay' | 'init'): Promise<boolean> {
    if (!ep) return false;

    if (!this.isEpisodeLockedByIndex(index)) {
      await this.startPlayback(ep);
      return true;
    }

    await this.ensureFreshSubscriptionCheck();

    if (!this.isEpisodeLockedByIndex(index)) {
      await this.startPlayback(ep);
      return true;
    }

    this.openLockedEpisode(ep, index);
    if (source !== 'init') this.pauseVideo();
    return false;
  }

  private async startPlayback(ep: any): Promise<void> {
    this.lockOpen = false;
    this.lockedEpisode = null;
    this.lockedEpisodeIndex = -1;

    this.currentEpisode = ep;
    await this.playCurrentEpisode(ep);
  }

  isEpisodeActive(ep: any): boolean {
    if (!ep || !this.currentEpisode) return false;
    const a = this.currentEpisode?.id ?? this.currentEpisode?.videoUrl ?? this.currentEpisode?.episodeNumber;
    const b = ep?.id ?? ep?.videoUrl ?? ep?.episodeNumber;
    return a === b;
  }

  private getEpisodeKey(ep: any): string | number | null {
    if (!ep) return null;
    const key = ep?.id ?? ep?.videoUrl ?? ep?.episodeNumber ?? null;
    return key == null || key === '' ? null : String(key);
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

  async playNextEpisode(): Promise<boolean> {
    const list = this.episodes || [];
    const idx = this.getCurrentEpisodeIndex();
    if (idx < 0) return false;
    const next = list[idx + 1];
    if (!next) return false;
    return this.requestPlayEpisode(next, idx + 1, 'autoplay');
  }

  async playPrevEpisode(): Promise<boolean> {
    const list = this.episodes || [];
    const idx = this.getCurrentEpisodeIndex();
    if (idx < 0) return false;
    const prev = list[idx - 1];
    if (!prev) return false;
    return this.requestPlayEpisode(prev, idx - 1, 'user');
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

    video.addEventListener('loadstart', () => {
      this.isVideoLoading = true;
    });

    video.addEventListener('waiting', () => {
      this.isVideoLoading = true;
    });

    video.addEventListener('stalled', () => {
      this.isVideoLoading = true;
    });

    video.addEventListener('canplay', () => {
      this.isVideoLoading = false;
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
      this.isVideoLoading = false;
    });

    video.addEventListener('ended', () => {
      this.isPlaying = false;
      this.isVideoLoading = false;
      if (this.autoplayOn) void this.playNextEpisode();
    });

    video.addEventListener('playing', () => {
      this.isVideoLoading = false;
    });

    video.addEventListener('error', () => {
      this.isVideoLoading = false;
    });
  }

  private bindFullscreenEvents() {
    if (this.fullscreenHandlerBound) return;
    this.fullscreenHandlerBound = true;
    document.addEventListener('fullscreenchange', this.onFullscreenChangeBound);
    document.addEventListener('webkitfullscreenchange' as any, this.onFullscreenChangeBound);
  }

  private onFullscreenChange() {
    const d: any = document as any;
    this.isFullscreen = Boolean(document.fullscreenElement || d.webkitFullscreenElement);

    const video = this.getVideoEl();
    if (video) {
      try {
        video.controls = this.isFullscreen;
      } catch {
        /* ignore */
      }
    }

    if (this.isFullscreen) {
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

  private pauseVideo(): void {
    const video = this.getVideoEl();
    if (!video) return;
    try {
      video.pause();
    } catch {
      /* ignore */
    }
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
  }

  async toggleFullscreen(ev?: Event) {
    ev?.stopPropagation();

    const video = this.getVideoEl();
    if (!video) return;
    const hero = this.getHeroCardEl();

    const d: any = document as any;
    const currentFsEl = document.fullscreenElement || d.webkitFullscreenElement;

    if (currentFsEl) {
      try {
        if (document.exitFullscreen) await document.exitFullscreen();
        else if (d.webkitExitFullscreen) d.webkitExitFullscreen();
      } catch (e) { /* ignore */ }
      return;
    }

    try {
      const anyVideo: any = video as any;
      const target: any = hero || video;

      if (target?.requestFullscreen) await target.requestFullscreen();
      else if (target?.webkitRequestFullscreen) target.webkitRequestFullscreen();
      else if (anyVideo.webkitEnterFullscreen) {
        anyVideo.webkitEnterFullscreen();
      }
    } catch (e) { /* ignore */ }
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
    if (ev.button != null && ev.button !== 0) return;

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
  }

  private async playCurrentEpisode(ep: any): Promise<void> {
    this.bindFullscreenEvents();

    const video = this.getVideoEl();
    if (!video) return;
    this.bindMediaEvents(video);
    this.applyPlaybackRate(video);

    await this.stopCurrentPlayback();

    this.availableQualities = [];
    this.selectedQualityLevel = -1;
    this.playingQuality = '';
    this.qualityPopoverOpen = false;

    this.currentTimeSec = 0;
    this.durationSec = 0;
    this.isVideoLoading = true;
    video.controls = false;

    const localRecord = await this.downloadService.getByEpisodeKey(this.getEpisodeDownloadKey(ep) ?? '');
    if (localRecord?.blob) {
      this.activeLocalObjectUrl = URL.createObjectURL(localRecord.blob);
      this.activeVideo = this.activeLocalObjectUrl;
      video.src = this.activeLocalObjectUrl;
      video.load();
      video.play().catch(() => { });
      return;
    }

    const remoteUrl = this.storyService.toAbsUrl(ep?.videoUrl) || ep?.videoUrl;
    this.activeVideo = remoteUrl;
    if (!this.activeVideo) return;

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
        this.buildAvailableQualities();
        this.updatePlayingQuality();
        video.play().catch(() => { });
      });

      this.hls.on(Hls.Events.LEVEL_SWITCHED, (_event, data: any) => {
        const levelIndex = Number(data?.level);
        this.updatePlayingQuality(Number.isFinite(levelIndex) ? levelIndex : this.hls?.currentLevel ?? -1);
      });

      this.hls.on(Hls.Events.ERROR, () => {
        this.isVideoLoading = false;
      });

      video.play().catch(() => { });
      return;
    }

    video.src = this.activeVideo;
    video.load();
    video.play().catch(() => { });
  }

  private async stopCurrentPlayback(): Promise<void> {
    const video = this.getVideoEl();
    if (video) {
      try {
        video.pause();
        video.removeAttribute('src');
        video.load();
      } catch {
        /* ignore */
      }
    }

    if (this.hls) {
      this.hls.destroy();
      this.hls = null;
    }

    if (this.activeLocalObjectUrl) {
      try {
        URL.revokeObjectURL(this.activeLocalObjectUrl);
      } catch {
        /* ignore */
      }
      this.activeLocalObjectUrl = null;
    }
  }

  private openLockedEpisode(ep: any, index: number): void {
    this.lockedEpisode = ep;
    this.lockedEpisodeIndex = index;
    this.lockOpen = true;
  }

  closeLock(): void {
    this.lockOpen = false;
  }

  goToSubscription(): void {
    this.lockOpen = false;
    this.router.navigateByUrl('/subscription');
  }

  private async ensureFreshSubscriptionCheck(): Promise<void> {
    if (this.isAdmin) return;
    const now = Date.now();
    if (this.isCheckingSubscription) return;
    if (this.subscriptionChecked && (now - this.lastSubscriptionCheckAtMs) < 10_000) return;
    await this.refreshSubscriptionFromBackend(true);
  }

  private async refreshSubscriptionFromBackend(force: boolean): Promise<void> {
    if (this.isAdmin) {
      this.subscriptionChecked = true;
      this.subscriptionActive = true;
      this.subscriptionExpiryMs = null;
      return;
    }

    if (this.isCheckingSubscription) return;
    if (!force && this.subscriptionChecked) return;

    const userId = this.getUserIdFromStorage();
    if (userId == null) {
      this.subscriptionChecked = true;
      this.subscriptionActive = false;
      this.subscriptionExpiryMs = null;
      return;
    }

    this.isCheckingSubscription = true;
    try {
      const res: any = await firstValueFrom(this.adminService.getCustomer(userId));
      const active = !!res?.subscriptionActive;
      const expiryMs = this.parseExpiryMs(res?.subscriptionExpiryDate ?? res?.subscriptionExpiry ?? res?.subscriptionExpiryMs);
      this.subscriptionActive = active;
      this.subscriptionExpiryMs = expiryMs;
      this.subscriptionChecked = true;
      this.lastSubscriptionCheckAtMs = Date.now();

      try {
        localStorage.setItem('vs_subscription_backend_active', active ? '1' : '0');
        if (expiryMs != null) localStorage.setItem('vs_subscription_backend_expiry_ms', String(expiryMs));
        else localStorage.removeItem('vs_subscription_backend_expiry_ms');
      } catch {
        /* ignore */
      }
    } catch {
      this.subscriptionChecked = true;
      this.subscriptionActive = false;
      this.subscriptionExpiryMs = null;
      this.lastSubscriptionCheckAtMs = Date.now();
    } finally {
      this.isCheckingSubscription = false;
    }
  }

  private async refreshDownloadedState(): Promise<void> {
    if (this.isAdmin) {
      this.downloadedEpisodeKeys = new Set();
      return;
    }

    try {
      const items = await this.downloadService.listDownloadsForCurrentUser();
      this.downloadedEpisodeKeys = new Set(items.map(item => item.episodeId));
    } catch {
      this.downloadedEpisodeKeys = new Set();
    }
  }

  private getUserIdFromStorage(): number | null {
    try {
      const idStr = localStorage.getItem('vs_user_id');
      const id = idStr ? Number(idStr) : NaN;
      return Number.isFinite(id) ? id : null;
    } catch {
      return null;
    }
  }

  private parseExpiryMs(value: any): number | null {
    if (value == null) return null;
    const num = Number(value);
    if (Number.isFinite(num) && num > 0) return num;
    const parsed = Date.parse(String(value));
    if (Number.isFinite(parsed) && !Number.isNaN(parsed)) return parsed;
    return null;
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
    this.qualityPopoverOpen = true;
  }

  async toggleWishlist(ev?: Event): Promise<void> {
    ev?.stopPropagation();
    if (this.isAdmin) return;

    if (!this.story?.id) {
      await this.showToast('Story is not ready yet.');
      return;
    }

    if (this.isWishlisted) {
      const removed = this.wishlistService.removeStory(this.story.id);
      this.isWishlisted = !removed ? this.isWishlisted : false;
      await this.showToast(removed ? 'Removed from wishlist.' : 'Already removed.');
      return;
    }

    const result = this.wishlistService.addStory(this.story);
    if (result.added) {
      this.isWishlisted = true;
      await this.showToast('Added to wishlist.');
      return;
    }

    if (result.reason === 'limit') {
      await this.showToast('Wishlist can hold only 10 stories.');
      return;
    }

    if (result.reason === 'exists') {
      this.isWishlisted = true;
      await this.showToast('Already in wishlist.');
      return;
    }

    await this.showToast('Could not update wishlist.');
  }

  changeQuality(ev: any) {
    if (!this.hls) return;
    const nextLevel = Number(ev?.detail?.value);
    if (!Number.isFinite(nextLevel)) return;

    this.selectedQualityLevel = nextLevel;
    this.hls.currentLevel = nextLevel;
    if (nextLevel >= 0) {
      this.updatePlayingQuality(nextLevel);
    }
    this.qualityPopoverOpen = false;
  }

  private buildAvailableQualities(): void {
    const hls = this.hls;
    if (!hls || !Array.isArray(hls.levels) || !hls.levels.length) {
      this.availableQualities = [];
      return;
    }

    const levels = hls.levels
      .map((level, index) => ({
        level: index,
        label: this.getQualityLevelLabel(level, index),
        height: level?.height,
        bitrate: level?.bitrate,
      }))
      .filter((item, index, list) => list.findIndex(q => q.level === item.level) === index)
      .sort((a, b) => {
        const aHeight = Number(a.height ?? 0);
        const bHeight = Number(b.height ?? 0);
        if (bHeight !== aHeight) return bHeight - aHeight;
        const aBitrate = Number(a.bitrate ?? 0);
        const bBitrate = Number(b.bitrate ?? 0);
        return bBitrate - aBitrate;
      });

    this.availableQualities = [
      { level: -1, label: 'Auto' },
      ...levels,
    ];
  }

  private updatePlayingQuality(levelIndex?: number): void {
    const hls = this.hls;
    if (!hls || !Array.isArray(hls.levels) || !hls.levels.length) {
      this.playingQuality = '';
      return;
    }

    const nextLevelIndex = Number.isFinite(levelIndex as number) ? Number(levelIndex) : hls.currentLevel;
    if (nextLevelIndex == null || nextLevelIndex < 0) return;
    const level = hls.levels[nextLevelIndex];
    if (!level) return;
    this.playingQuality = this.getQualityLevelLabel(level, nextLevelIndex);
  }

  private getQualityLevelLabel(level: any, index: number): string {
    const height = Number(level?.height);
    if (Number.isFinite(height) && height > 0) return `${Math.round(height)}p`;

    const bitrate = Number(level?.bitrate);
    if (Number.isFinite(bitrate) && bitrate > 0) {
      const mbps = bitrate / 1_000_000;
      if (mbps >= 1) return `${mbps.toFixed(mbps >= 10 ? 0 : 1)} Mbps`;
      return `${Math.round(bitrate / 1000)} Kbps`;
    }

    return `Level ${index + 1}`;
  }

  private syncWishlistState(): void {
    if (this.isAdmin || !this.story?.id) {
      this.isWishlisted = false;
      return;
    }

    this.isWishlisted = this.wishlistService.hasStory(this.story.id);
  }

  private getEpisodeDownloadKey(ep: any): string | null {
    const key = ep?.id ?? ep?.episodeId ?? ep?.episodeNumber ?? ep?.episode ?? ep?.ep ?? ep?.videoUrl ?? null;
    return key == null || key === '' ? null : String(key);
  }

  isDownloadedEpisode(ep: any): boolean {
    const key = this.getEpisodeDownloadKey(ep);
    return !!key && this.downloadedEpisodeKeys.has(key);
  }

  isDownloadingEpisode(ep: any): boolean {
    const key = this.getEpisodeDownloadKey(ep);
    return !!key && this.downloadingEpisodeKeys.has(key);
  }

  getDownloadProgress(ep: any): number {
    const key = this.getEpisodeDownloadKey(ep);
    if (!key) return 0;
    return this.downloadProgressByKey.get(key)?.percent ?? 0;
  }

  getDownloadButtonLabel(ep: any): string {
    const key = this.getEpisodeDownloadKey(ep);
    if (!key) return 'DL';

    const state = this.downloadProgressByKey.get(key);
    if (this.downloadedEpisodeKeys.has(key) || state?.phase === 'done') {
      return '100%';
    }

    if (state?.phase === 'requesting') {
      return '0%';
    }

    if (state?.phase === 'downloading' || state?.phase === 'saving') {
      return `${Math.max(0, Math.min(100, Math.round(state.percent)))}%`;
    }

    return 'DL';
  }

  isDownloadRequesting(ep: any): boolean {
    const key = this.getEpisodeDownloadKey(ep);
    if (!key) return false;
    return this.downloadProgressByKey.get(key)?.phase === 'requesting';
  }

  isDownloadBusy(ep: any): boolean {
    const key = this.getEpisodeDownloadKey(ep);
    if (!key) return false;
    const state = this.downloadProgressByKey.get(key);
    return !!state && state.phase !== 'done';
  }

  private async showToast(message: string): Promise<void> {
    const toast = await this.toastController.create({
      message,
      duration: 1800,
      position: 'bottom',
    });
    await toast.present();
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

    if (this.activeLocalObjectUrl) {
      try {
        URL.revokeObjectURL(this.activeLocalObjectUrl);
      } catch {
        /* ignore */
      }
      this.activeLocalObjectUrl = null;
    }
  }

}
