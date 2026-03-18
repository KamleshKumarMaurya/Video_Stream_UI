import { Component, OnInit, inject } from '@angular/core';
import { StoryService } from '../services/story.service';
import { ActivatedRoute, Router } from '@angular/router';
import { AdminService } from '../services/admin.service';

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

  stories: any[] = [];
  displayName = 'Alex';

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
    }, (err) => {
      // eslint-disable-next-line no-console
      console.error('Failed to fetch stories', err);
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
        // If we can't verify, still allow user to go to subscription page (no localStorage-based decisions).
        this.showSubscriptionCta = true;
        this.subscriptionCtaLabel = 'Get Subscription';
        this.isCheckingSubscription = false;
      },
    });
  }

  openSubscription(): void {
    this.router.navigateByUrl('/subscription');
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

  get trendingMain(): any {
    return this.stories?.[0] || null;
  }

  get trendingSide(): any[] {
    return (this.stories || []).slice(1, 3);
  }

  get popularCards(): any[] {
    return (this.stories || []).slice(3, 10);
  }

  onNotifications(){
    // TODO: wire notifications
    // eslint-disable-next-line no-console
    console.log('Notifications tapped');
  }

  getDurationForIndex(index: number): string {
    const samples = ['04:20', '02:15', '01:45', '12:40', '10:25', '09:45'];
    return samples[index % samples.length];
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
    // TODO: wire to real pages when they exist
    // eslint-disable-next-line no-console
    console.log('Bottom tab tapped:', tab);
  }

  openStory(story:any){
    if (!story?.id) return;
    this.router.navigateByUrl(`/story/${story.id}`);
  }

  toThumb(story: any): string {
    return this.storyService.toAbsUrl(story?.thumbnail) || 'assets/story.png';
  }
}
