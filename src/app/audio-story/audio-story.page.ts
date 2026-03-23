import { Component, OnDestroy, OnInit, inject } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { ToastController } from '@ionic/angular';
import { firstValueFrom } from 'rxjs';
import { AdminService } from '../services/admin.service';
import { DownloadService } from '../services/download.service';
import { WishlistService } from '../services/wishlist.service';
import { StoryService } from '../services/story.service';

@Component({
  selector: 'app-audio-story',
  standalone: false,
  templateUrl: './audio-story.page.html',
  styleUrls: ['./audio-story.page.scss'],
})
export class AudioStoryPage implements OnInit, OnDestroy {
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private toastController = inject(ToastController);
  storyService = inject(StoryService);
  private adminService = inject(AdminService);
  private downloadService = inject(DownloadService);
  private wishlistService = inject(WishlistService);

  story: any = null;
  episodes: any[] = [];
  episodesLoaded = false;
  currentEpisode: any = null;
  activeAudio: string | null = null;

  isPlaying = false;
  isAudioLoading = false;
  currentTimeSec = 0;
  durationSec = 0;
  seeking = false;
  seekingValueSec = 0;

  autoplayOn = true;
  repeatOn = false;
  shuffleOn = false;
  activeBottomTab: 'home' | 'explore' | 'audio' | 'profile' = 'audio';
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
  private pendingEpisodeKey: string | null = null;
  private activeLocalObjectUrl: string | null = null;
  private mediaEventsBound = false;
  descriptionExpanded = false;

  get isAdmin(): boolean {
    return this.role === 'admin';
  }

  get heroImageUrl(): string {
    const epThumb = this.storyService.toAbsUrl(this.currentEpisode?.thumbnail);
    const storyThumb = this.storyService.toAbsUrl(this.story?.thumbnail ?? this.story?.cover);
    return epThumb || storyThumb || 'assets/story.png';
  }

  onImgError(event: any): void {
    event.target.src = 'assets/story.png';
  }

  get audioTitle(): string {
    return this.currentEpisode?.title || this.story?.title || 'Audio Story';
  }

  get authorName(): string {
    return this.story?.author || this.story?.by || this.story?.creator || this.story?.user || 'Unknown';
  }

  get episodeSeasonLabel(): string {
    const epNum = this.currentEpisode?.episodeNumber ?? this.currentEpisode?.episode ?? this.currentEpisode?.ep;
    const season = this.story?.season ?? this.currentEpisode?.seasonNumber ?? this.currentEpisode?.season ?? 1;
    const epLabel = epNum != null ? String(epNum).padStart(2, '0') : '01';
    return `EPISODE ${epLabel}`;
  }

  get audioSubtitle(): string {
    return this.currentEpisode?.description || this.story?.description || 'Tap play to listen.';
  }

  get audioSubtitlePreview(): string {
    const text = String(this.audioSubtitle || '').trim();
    if (!text) return '';

    const words = text.split(/\s+/).filter(Boolean);
    if (words.length <= 10 || this.descriptionExpanded) return text;
    return words.slice(0, 10).join(' ');
  }

  get canExpandSubtitle(): boolean {
    const text = String(this.audioSubtitle || '').trim();
    return text.split(/\s+/).filter(Boolean).length > 10;
  }

  get subtitleToggleLabel(): string {
    return this.descriptionExpanded ? 'Show less' : 'Show more';
  }

  get lockedEpisodeLabel(): string {
    const episode = this.lockedEpisode || this.nextEpisodes?.[this.lockedEpisodeIndex];
    const epNum = episode?.episodeNumber ?? episode?.episode ?? episode?.ep ?? (this.lockedEpisodeIndex >= 0 ? this.lockedEpisodeIndex + 1 : 1);
    return String(epNum).padStart(2, '0');
  }

  get isWishlisted(): boolean {
    return !!this.story?.id && this.wishlistService.hasStory(this.story.id);
  }

  formatEpisodeIndex(value: number): string {
    return String(value).padStart(2, '0');
  }

  async toggleWishlist(ev?: Event): Promise<void> {
    ev?.stopPropagation();
    if (!this.story?.id) return;
    const result = this.wishlistService.toggleStory(this.story);
    if (result.reason === 'limit') {
      await this.showToast('Wishlist can hold only 10 stories.');
      return;
    }
    if (result.reason === 'missing') {
      await this.showToast('Story is not ready yet.');
      return;
    }
  }

  toggleSubtitleExpanded(ev?: Event): void {
    ev?.stopPropagation();
    this.descriptionExpanded = !this.descriptionExpanded;
  }

  get nextEpisodes(): any[] {
    return this.episodes || [];
  }

  get hasNextEpisode(): boolean {
    const idx = this.getCurrentEpisodeIndex();
    return idx >= 0 && idx < this.nextEpisodes.length - 1;
  }

  get hasPreviousEpisode(): boolean {
    const idx = this.getCurrentEpisodeIndex();
    return idx > 0;
  }

  get isSubscribed(): boolean {
    if (this.isAdmin) return true;
    if (!this.subscriptionChecked) return false;
    if (!this.subscriptionActive) return false;
    if (this.subscriptionExpiryMs != null) return this.subscriptionExpiryMs > Date.now();
    return true;
  }

  ngOnInit(): void {
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

    this.storyService.getStory(id).subscribe({
      next: (res: any) => {
        this.story = res || null;
        if (!this.isAudioStory(this.story)) {
          this.router.navigateByUrl(`/story/${id}`, { replaceUrl: true });
          return;
        }

        this.loadEpisodes(id);
      },
      error: async () => {
        await this.showToast('Unable to load audio story.');
      },
    });

    void this.refreshSubscriptionFromBackend(true);
  }

  ionViewWillEnter(): void {
    void this.refreshSubscriptionFromBackend(true);
  }

  onEpisodeTap(ep: any, index: number): void {
    void this.requestPlayEpisode(ep, index, 'user');
  }

  async togglePlay(): Promise<void> {
    const audio = this.getAudioEl();
    if (!audio) return;
    if (audio.paused) {
      try {
        await audio.play();
      } catch {
        /* ignore */
      }
      return;
    }

    audio.pause();
  }

  async playPrevEpisode(): Promise<boolean> {
    const idx = this.getCurrentEpisodeIndex();
    if (idx <= 0) return false;
    const prev = this.nextEpisodes[idx - 1];
    return this.requestPlayEpisode(prev, idx - 1, 'user');
  }

  async playNextEpisode(): Promise<boolean> {
    const idx = this.getCurrentEpisodeIndex();
    if (idx < 0) return false;
    if (this.shuffleOn) {
      const shuffledIndex = this.getRandomEpisodeIndex(idx);
      if (shuffledIndex < 0) return false;
      return this.playEpisodeAtIndex(shuffledIndex, 'autoplay');
    }

    const next = this.nextEpisodes[idx + 1];
    if (!next) return false;
    return this.requestPlayEpisode(next, idx + 1, 'autoplay');
  }

  toggleAutoplay(): void {
    this.autoplayOn = !this.autoplayOn;
  }

  toggleRepeat(): void {
    this.repeatOn = !this.repeatOn;
  }

  toggleShuffle(): void {
    this.shuffleOn = !this.shuffleOn;
  }

  setBottomTab(tab: 'home' | 'explore' | 'audio' | 'profile'): void {
    this.activeBottomTab = tab;
    if (tab === 'audio') return;
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
    }
  }

  goBack(): void {
    this.router.navigate(['/home'], {
      queryParams: { tab: 'home' },
      replaceUrl: true,
    });
  }

  openSubscription(): void {
    this.router.navigateByUrl('/subscription');
  }

  closeLock(): void {
    this.lockOpen = false;
  }

  goToSubscription(): void {
    this.lockOpen = false;
    this.router.navigateByUrl('/subscription');
  }

  isEpisodeActive(ep: any): boolean {
    if (!ep || !this.currentEpisode) return false;
    return this.getEpisodeKey(this.currentEpisode) === this.getEpisodeKey(ep);
  }

  isEpisodeLockedByIndex(index: number): boolean {
    if (this.isAdmin) return false;
    if (index < 0) return false;
    if (this.isSubscribed) return false;
    return index >= this.freeEpisodeCount;
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
        if (trimmed.includes(':')) return trimmed;
      }
    }

    return `EP ${String(ep?.episodeNumber ?? index + 1).padStart(2, '0')}`;
  }

  formatTime(totalSeconds: number): string {
    const s = Math.max(0, Math.floor(Number(totalSeconds) || 0));
    const mm = Math.floor(s / 60);
    const ss = s % 60;
    return `${String(mm).padStart(2, '0')}:${String(ss).padStart(2, '0')}`;
  }

  onSeekStart(): void {
    this.seeking = true;
    this.seekingValueSec = this.currentTimeSec;
  }

  onSeekInput(ev: any): void {
    const v = Number(ev?.detail?.value);
    if (!Number.isFinite(v)) return;
    this.seekingValueSec = v;
  }

  onSeekEnd(ev: any): void {
    const audio = this.getAudioEl();
    const v = Number(ev?.detail?.value);
    this.seeking = false;
    if (!audio || !Number.isFinite(v)) return;
    audio.currentTime = v;
    this.currentTimeSec = v;
  }

  seekBy(deltaSeconds: number): void {
    const audio = this.getAudioEl();
    if (!audio) return;
    const next = Math.min(Math.max(0, audio.currentTime + deltaSeconds), Number.isFinite(audio.duration) ? audio.duration : audio.currentTime + deltaSeconds);
    audio.currentTime = next;
    this.currentTimeSec = next;
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
    if (source !== 'init') this.pauseAudio();
    return false;
  }

  private async playEpisodeAtIndex(index: number, source: 'user' | 'autoplay' | 'init'): Promise<boolean> {
    const episode = this.nextEpisodes[index];
    if (!episode) return false;
    return this.requestPlayEpisode(episode, index, source);
  }

  private getRandomEpisodeIndex(excludeIndex: number): number {
    const list = this.nextEpisodes || [];
    if (!list.length) return -1;

    const candidates = list
      .map((_, index) => index)
      .filter((index) => index !== excludeIndex);

    if (!candidates.length) return excludeIndex;
    const pick = candidates[Math.floor(Math.random() * candidates.length)];
    return Number.isFinite(pick) ? pick : -1;
  }

  private async startPlayback(ep: any): Promise<void> {
    this.lockOpen = false;
    this.lockedEpisode = null;
    this.lockedEpisodeIndex = -1;

    this.currentEpisode = ep;
    this.descriptionExpanded = false;
    await this.playCurrentEpisode(ep);
  }

  private async playCurrentEpisode(ep: any): Promise<void> {
    const audio = this.getAudioEl();
    if (!audio) return;
    this.bindAudioEvents(audio);

    await this.stopCurrentPlayback();

    this.currentTimeSec = 0;
    this.durationSec = 0;
    this.isAudioLoading = true;
    this.activeAudio = null;

    const localRecord = await this.downloadService.getByEpisodeKey(this.getEpisodeKey(ep) ?? '');
    if (localRecord?.blob) {
      this.activeLocalObjectUrl = URL.createObjectURL(localRecord.blob);
      this.activeAudio = this.activeLocalObjectUrl;
      audio.src = this.activeLocalObjectUrl;
      audio.load();
      audio.play().catch(() => { });
      return;
    }

    const remoteUrl = this.getEpisodeSource(ep);
    this.activeAudio = remoteUrl;
    if (!this.activeAudio) {
      this.isAudioLoading = false;
      return;
    }

    audio.src = this.activeAudio;
    audio.load();
    audio.play().catch(() => { });
  }

  private bindAudioEvents(audio: HTMLAudioElement): void {
    if (this.mediaEventsBound) return;
    this.mediaEventsBound = true;

    audio.addEventListener('loadedmetadata', () => {
      this.durationSec = Number.isFinite(audio.duration) ? audio.duration : 0;
    });

    audio.addEventListener('loadstart', () => {
      this.isAudioLoading = true;
    });

    audio.addEventListener('waiting', () => {
      this.isAudioLoading = true;
    });

    audio.addEventListener('stalled', () => {
      this.isAudioLoading = true;
    });

    audio.addEventListener('canplay', () => {
      this.isAudioLoading = false;
    });

    audio.addEventListener('durationchange', () => {
      this.durationSec = Number.isFinite(audio.duration) ? audio.duration : 0;
    });

    audio.addEventListener('timeupdate', () => {
      if (this.seeking) return;
      this.currentTimeSec = Number.isFinite(audio.currentTime) ? audio.currentTime : 0;
    });

    audio.addEventListener('play', () => {
      this.isPlaying = true;
    });

    audio.addEventListener('pause', () => {
      this.isPlaying = false;
      this.isAudioLoading = false;
    });

    audio.addEventListener('ended', () => {
      this.isPlaying = false;
      this.isAudioLoading = false;
      if (this.repeatOn) {
        void this.playEpisodeAtIndex(this.getCurrentEpisodeIndex(), 'autoplay');
        return;
      }
      if (this.autoplayOn) void this.playNextEpisode();
    });

    audio.addEventListener('playing', () => {
      this.isAudioLoading = false;
    });

    audio.addEventListener('error', () => {
      this.isAudioLoading = false;
    });
  }

  private async stopCurrentPlayback(): Promise<void> {
    const audio = this.getAudioEl();
    if (audio) {
      try {
        audio.pause();
        audio.removeAttribute('src');
        audio.load();
      } catch {
        /* ignore */
      }
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

  private pauseAudio(): void {
    const audio = this.getAudioEl();
    if (!audio) return;
    try {
      audio.pause();
    } catch {
      /* ignore */
    }
  }

  private getAudioEl(): HTMLAudioElement | null {
    return document.getElementById('story-audio') as HTMLAudioElement | null;
  }

  private getEpisodeSource(ep: any): string | null {
    return this.storyService.toAbsUrl(ep?.audioUrl ?? ep?.videoUrl ?? ep?.fileUrl ?? ep?.url) || ep?.audioUrl || ep?.videoUrl || ep?.fileUrl || ep?.url || null;
  }

  private getEpisodeKey(ep: any): string | null {
    if (!ep) return null;
    const key = ep?.id ?? ep?.episodeId ?? ep?.episodeNumber ?? ep?.episode ?? ep?.ep ?? ep?.videoUrl ?? null;
    return key == null || key === '' ? null : String(key);
  }

   getCurrentEpisodeIndex(): number {
    if (!this.currentEpisode) return -1;
    const key = this.getEpisodeKey(this.currentEpisode);
    if (key == null) return -1;

    const list = this.nextEpisodes || [];
    const byKey = list.findIndex((e) => this.getEpisodeKey(e) === key);
    if (byKey >= 0) return byKey;

    return list.indexOf(this.currentEpisode);
  }

  private getInitialEpisodeIndex(): number {
    if (!this.pendingEpisodeKey) return -1;
    return (this.episodes || []).findIndex((ep) => this.getEpisodeKey(ep) === this.pendingEpisodeKey);
  }

  private openLockedEpisode(ep: any, index: number): void {
    this.lockedEpisode = ep;
    this.lockedEpisodeIndex = index;
    this.lockOpen = true;
  }

  private loadEpisodes(id: string): void {
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
  }

  private isAudioStory(story: any): boolean {
    const raw = String(story?.type ?? story?.storyType ?? story?.mediaType ?? story?.contentType ?? '').trim().toLowerCase();
    if (!raw) return true;
    return raw.includes('audio') || !raw.includes('video');
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
    } catch {
      this.subscriptionChecked = true;
      this.subscriptionActive = false;
      this.subscriptionExpiryMs = null;
      this.lastSubscriptionCheckAtMs = Date.now();
    } finally {
      this.isCheckingSubscription = false;
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

  private async showToast(message: string): Promise<void> {
    const toast = await this.toastController.create({
      message,
      duration: 1800,
      position: 'bottom',
    });
    await toast.present();
  }

  ngOnDestroy(): void {
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
