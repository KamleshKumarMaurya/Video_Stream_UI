import { Component, OnInit, inject } from '@angular/core';
import { StoryService } from '../services/story.service';
import { ActivatedRoute, Router } from '@angular/router';
import { AdminService } from '../services/admin.service';
import { ToastController } from '@ionic/angular';
import { WishlistService } from '../services/wishlist.service';

@Component({
  selector: 'app-home',
  standalone: false,
  templateUrl: 'home.page.html',
  styleUrls: ['home.page.scss'],
})
export class HomePage implements OnInit {
  private storyService = inject(StoryService);
  private adminService = inject(AdminService);
  private router = inject(Router);
  private route = inject(ActivatedRoute);
  private toastController = inject(ToastController);
  private wishlistService = inject(WishlistService);

  stories: any[] = [];
  latestStories: any[] = [];
  latestDeck: any[] = [];
  displayName = 'Alex';
  latestIsDragging = false;
  latestIsThrowing = false;
  latestTargetX = 0;
  latestTargetY = 0;
  latestTargetRotate = 0;
  latestTargetScale = 1;
  latestRenderX = 0;
  latestRenderY = 0;
  latestRenderRotate = 0;
  latestRenderScale = 1;
  private latestPointerId: number | null = null;
  private latestPointerStartX = 0;
  private latestPointerStartY = 0;
  private latestSuppressClick = false;
  private latestFrameId: number | null = null;

  activeBottomTab: 'home' | 'explore' | 'create' | 'library' | 'profile' = 'home';
  role: 'admin' | 'customer' = 'customer';

  showSubscriptionCta = false;
  subscriptionCtaLabel = 'Get Subscription';
  isCheckingSubscription = false;

  get isAdmin(): boolean {
    return this.role === 'admin';
  }

  ngOnInit() {
    try {
      const role = localStorage.getItem('vs_role');
      if (role === 'admin' || role === 'customer') this.role = role;
    } catch {
      /* ignore */
    }

    this.route.queryParamMap.subscribe((params) => {
      const tab = params.get('tab');
      if (tab === 'home' || tab === 'explore' || tab === 'create' || tab === 'library' || tab === 'profile') {
        if (!this.isAdmin && (tab === 'create' || tab === 'library')) {
          this.activeBottomTab = 'home';
        } else {
          this.activeBottomTab = tab;
        }
      }
    });

    try {
      const stored = localStorage.getItem('vs_display_name');
      if (stored) this.displayName = stored;
    } catch {
      /* ignore */
    }

    this.refreshSubscriptionState();

    this.storyService.getStories().subscribe((res: any) => {
      this.stories = this.storyService.extractStories(res);
      this.buildLatestDeck();
    }, (err) => {
    });
  }

  ionViewWillEnter(): void {
    this.refreshSubscriptionState();
  }

  private refreshSubscriptionState(): void {
    if (this.isAdmin) {
      this.showSubscriptionCta = false;
      return;
    }

    const userId = this.getUserId();
    if (userId == null) {
      this.showSubscriptionCta = true;
      this.subscriptionCtaLabel = 'Get Subscription';
      return;
    }

    if (this.isCheckingSubscription) return;
    this.isCheckingSubscription = true;

    this.adminService.getCustomer(userId).subscribe({
      next: (res: any) => {
        const active = !!res?.subscriptionActive;
        this.showSubscriptionCta = !active;
        this.subscriptionCtaLabel = active ? 'Subscribed' : 'Get Subscription';
        this.isCheckingSubscription = false;
      },
      error: () => {
        this.showSubscriptionCta = true;
        this.subscriptionCtaLabel = 'Get Subscription';
        this.isCheckingSubscription = false;
      },
    });
  }

  openSubscription(): void {
    this.router.navigateByUrl('/subscription');
  }

  get wishlistedCount(): number {
    return this.wishlistService.getItems().length;
  }

  private getUserId(): number | null {
    try {
      const idStr = localStorage.getItem('vs_user_id');
      const id = idStr ? Number(idStr) : NaN;
      if (Number.isFinite(id)) return id;

      const userJson = localStorage.getItem('vs_user_json');
      if (!userJson) return null;
      const user = JSON.parse(userJson);
      const fromUser = Number(user?.id);
      return Number.isFinite(fromUser) ? fromUser : null;
    } catch {
      return null;
    }
  }

  onImgError(event: any) {
    event.target.src = 'assets/story.png';
  }

  isWishlisted(story: any): boolean {
    return !!story?.id && this.wishlistService.hasStory(story.id);
  }

  async toggleWishlist(story: any, ev?: Event): Promise<void> {
    ev?.stopPropagation();
    if (this.isAdmin || !story?.id) return;

    if (this.isWishlisted(story)) {
      this.wishlistService.removeStory(story.id);
      await this.showToast('Removed from wishlist.');
      return;
    }

    const result = this.wishlistService.addStory(story);
    if (result.added) {
      await this.showToast('Added to wishlist.');
      return;
    }

    if (result.reason === 'limit') {
      await this.showToast('Wishlist can hold only 10 stories.');
      return;
    }

    if (result.reason === 'exists') {
      await this.showToast('Already in wishlist.');
      return;
    }
  }

  get trendingMain(): any {
    return this.stories?.[0] || null;
  }

  get trendingSide(): any[] {
    return (this.stories || []).slice(1, 3);
  }

  get popularCards(): any[] {
    return (this.stories || []).slice(3, 10);
  }

  get exploreStories(): any[] {
    return [...(this.stories || [])].sort((a, b) => this.getStoryCreatedAtMs(b) - this.getStoryCreatedAtMs(a));
  }

  get latestActive(): any | null {
    return this.latestDeck?.[0] ?? null;
  }

  get latestPeek1(): any | null {
    return this.latestDeck?.[1] ?? null;
  }

  get latestPeek2(): any | null {
    return this.latestDeck?.[2] ?? null;
  }

  get latestFrontTransform(): string {
    return `translate3d(${this.latestRenderX}px, ${this.latestRenderY}px, 0) rotate(${this.latestRenderRotate}deg) scale(${this.latestRenderScale})`;
  }

  get latestBack1Transform(): string {
    const progress = Math.min(1, Math.abs(this.latestRenderX) / 260);
    const direction = this.latestRenderX >= 0 ? 1 : -1;
    const x = 15 + direction * 8 * progress;
    const y = 20 + 5 * progress;
    const scale = 0.985 - progress * 0.02;
    const rotate = direction * 1.5 * progress;
    return `translate3d(${x}px, ${y}px, 0) scale(${scale}) rotate(${rotate}deg)`;
  }

  get latestBack2Transform(): string {
    const progress = Math.min(1, Math.abs(this.latestRenderX) / 260);
    const direction = this.latestRenderX >= 0 ? 1 : -1;
    const x = 24 + direction * 12 * progress;
    const y = 20 + 8 * progress;
    const scale = 0.97 - progress * 0.025;
    const rotate = direction * 2.4 * progress;
    return `translate3d(${x}px, ${y}px, 0) scale(${scale}) rotate(${rotate}deg)`;
  }

  onNotifications(){
  }

  setBottomTab(tab: 'home' | 'explore' | 'create' | 'library' | 'profile'){
    this.activeBottomTab = tab;
    if (tab === 'home' || tab === 'explore') {
      this.router.navigate([], {
        relativeTo: this.route,
        queryParams: { tab },
        queryParamsHandling: 'merge',
        replaceUrl: true,
      });
      return;
    }
    if (tab === 'profile') {
      this.router.navigateByUrl('/profile');
      return;
    }
    if (tab === 'create') {
      if (!this.isAdmin) return;
      this.router.navigateByUrl('/stories/add');
      return;
    }
    if (tab === 'library') {
      if (!this.isAdmin) return;
      this.router.navigateByUrl('/users');
      return;
    }
  }

  openStory(story:any){
    if (!story?.id) return;
    this.router.navigateByUrl(`/story/${story.id}`);
  }

  toThumb(story: any): string {
    return this.storyService.toAbsUrl(story?.thumbnail) || 'assets/story.png';
  }

  shuffleLatest(ev?: Event): void {
    ev?.stopPropagation();
    if (!this.latestStories?.length) return;
    this.latestDeck = this.shuffleArray(this.latestStories).slice(0, 10);
  }

  playLatest(ev?: Event): void {
    ev?.stopPropagation();
    if (!this.latestActive) return;
    this.openStory(this.latestActive);
  }

  nextLatest(ev?: Event): void {
    ev?.stopPropagation();
    this.throwLatestCard(1);
  }

  onLatestStackClick(ev: MouseEvent): void {
    if (this.latestSuppressClick) {
      ev.preventDefault();
      ev.stopPropagation();
      return;
    }
    this.openStory(this.latestActive);
  }

  onLatestPointerDown(ev: PointerEvent): void {
    if (!this.latestActive || this.latestIsThrowing || ev.button !== 0) return;

    const target = ev.currentTarget as HTMLElement | null;
    target?.setPointerCapture(ev.pointerId);

    this.latestPointerId = ev.pointerId;
    this.latestPointerStartX = ev.clientX;
    this.latestPointerStartY = ev.clientY;
    this.latestIsDragging = true;
    this.latestTargetX = this.latestRenderX;
    this.latestTargetY = this.latestRenderY;
    this.latestTargetRotate = this.latestRenderRotate;
    this.latestTargetScale = this.latestRenderScale;
    this.startLatestAnimation();
  }

  onLatestPointerMove(ev: PointerEvent): void {
    if (!this.latestIsDragging || this.latestPointerId !== ev.pointerId) return;

    const dx = ev.clientX - this.latestPointerStartX;
    const dy = ev.clientY - this.latestPointerStartY;
    this.latestTargetX = dx;
    this.latestTargetY = dy * 0.85;
    this.latestTargetRotate = Math.max(-16, Math.min(16, dx / 18));
    this.latestTargetScale = Math.max(0.95, 1 - Math.min(Math.abs(dx) / 2200, 0.05));
    this.startLatestAnimation();
  }

  onLatestPointerUp(ev: PointerEvent): void {
    if (!this.latestIsDragging || this.latestPointerId !== ev.pointerId) return;
    this.finishLatestDrag();
  }

  onLatestPointerCancel(ev: PointerEvent): void {
    if (!this.latestIsDragging || this.latestPointerId !== ev.pointerId) return;
    this.latestTargetX = 0;
    this.latestTargetY = 0;
    this.latestTargetRotate = 0;
    this.latestTargetScale = 1;
    this.resetLatestDrag(false);
    this.startLatestAnimation();
  }

  private finishLatestDrag(): void {
    const threshold = 90;
    const shouldAdvance = Math.abs(this.latestTargetX) >= threshold && Math.abs(this.latestTargetX) > Math.abs(this.latestTargetY);

    if (shouldAdvance) {
      const direction = this.latestTargetX >= 0 ? 1 : -1;
      this.latestSuppressClick = true;
      window.setTimeout(() => {
        this.latestSuppressClick = false;
      }, 0);
      this.throwLatestCard(direction);
      return;
    }

    this.latestTargetX = 0;
    this.latestTargetY = 0;
    this.latestTargetRotate = 0;
    this.latestTargetScale = 1;
    this.resetLatestDrag(false);
    this.startLatestAnimation();
  }

  private throwLatestCard(direction: -1 | 1): void {
    if (this.latestIsThrowing || !this.latestDeck || this.latestDeck.length < 2) {
      this.resetLatestDrag();
      return;
    }

    this.latestIsThrowing = true;
    this.latestIsDragging = false;
    this.latestTargetX = direction * 520;
    this.latestTargetY = this.latestTargetY * 0.15;
    this.latestTargetRotate = direction * 20;
    this.latestTargetScale = 0.96;
    this.startLatestAnimation();

    window.setTimeout(() => {
      this.latestDeck = [...this.latestDeck.slice(1), this.latestDeck[0]];
      this.resetLatestDrag();
    }, 220);
  }

  private resetLatestDrag(snapToRest = true): void {
    this.latestIsDragging = false;
    this.latestIsThrowing = false;
    this.latestPointerId = null;
    this.latestPointerStartX = 0;
    this.latestPointerStartY = 0;
    if (snapToRest) {
      this.stopLatestAnimation();
      this.latestRenderX = this.latestTargetX = 0;
      this.latestRenderY = this.latestTargetY = 0;
      this.latestRenderRotate = this.latestTargetRotate = 0;
      this.latestRenderScale = this.latestTargetScale = 1;
    }
  }

  private startLatestAnimation(): void {
    if (this.latestFrameId != null) return;
    this.latestFrameId = window.requestAnimationFrame(() => this.updateLatestAnimation());
  }

  private stopLatestAnimation(): void {
    if (this.latestFrameId == null) return;
    window.cancelAnimationFrame(this.latestFrameId);
    this.latestFrameId = null;
  }

  private updateLatestAnimation(): void {
    this.latestFrameId = null;

    const lerp = this.latestIsDragging ? 0.28 : 0.18;
    this.latestRenderX += (this.latestTargetX - this.latestRenderX) * lerp;
    this.latestRenderY += (this.latestTargetY - this.latestRenderY) * lerp;
    this.latestRenderRotate += (this.latestTargetRotate - this.latestRenderRotate) * lerp;
    this.latestRenderScale += (this.latestTargetScale - this.latestRenderScale) * lerp;

    const xClose = Math.abs(this.latestTargetX - this.latestRenderX) < 0.2;
    const yClose = Math.abs(this.latestTargetY - this.latestRenderY) < 0.2;
    const rClose = Math.abs(this.latestTargetRotate - this.latestRenderRotate) < 0.2;
    const sClose = Math.abs(this.latestTargetScale - this.latestRenderScale) < 0.002;
    const settled = xClose && yClose && rClose && sClose;

    if (!this.latestIsDragging && !this.latestIsThrowing && settled) {
      this.latestRenderX = this.latestTargetX;
      this.latestRenderY = this.latestTargetY;
      this.latestRenderRotate = this.latestTargetRotate;
      this.latestRenderScale = this.latestTargetScale;
      return;
    }

    if (!this.latestIsDragging && !this.latestIsThrowing && !settled) {
      this.startLatestAnimation();
      return;
    }

    this.startLatestAnimation();
  }

  private buildLatestDeck(): void {
    const candidates = (this.stories || [])
      .filter((s) => this.isLatestStory(s))
      .sort((a, b) => this.getStoryCreatedAtMs(b) - this.getStoryCreatedAtMs(a));

    this.latestStories = candidates.slice(0, 10);
    this.latestDeck = [...this.latestStories];
  }

  private isLatestStory(story: any): boolean {
    const raw = story?.latest_story ?? story?.latestStory ?? story?.latest;
    if (typeof raw === 'boolean') return raw;
    if (typeof raw === 'number') return raw === 1;
    if (typeof raw === 'string') {
      const v = raw.trim().toLowerCase();
      return v === 'true' || v === '1' || v === 'yes';
    }
    return false;
  }

  private getStoryCreatedAtMs(story: any): number {
    const raw = story?.createdAt ?? story?.created_at ?? story?.created_at_ms ?? story?.createdAtMs;
    if (raw == null) return 0;

    if (typeof raw === 'number') {
      return Number.isFinite(raw) ? raw : 0;
    }

    const text = String(raw).trim();
    if (!text) return 0;

    const asNumber = Number(text);
    if (Number.isFinite(asNumber)) return asNumber;

    const parsed = Date.parse(text);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  private shuffleArray<T>(list: T[]): T[] {
    const arr = [...(list || [])];
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }

  private async showToast(message: string): Promise<void> {
    const toast = await this.toastController.create({
      message,
      duration: 1600,
      position: 'bottom',
    });
    await toast.present();
  }
}
