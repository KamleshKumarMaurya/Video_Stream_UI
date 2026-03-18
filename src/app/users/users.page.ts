import { Component, OnInit, inject } from '@angular/core';
import { Router } from '@angular/router';
import { ToastController } from '@ionic/angular';
import { AdminService } from '../services/admin.service';

type UserRole = 'admin' | 'customer';

@Component({
  selector: 'app-users',
  templateUrl: './users.page.html',
  styleUrls: ['./users.page.scss'],
  standalone: false,
})
export class UsersPage implements OnInit {
  private adminService = inject(AdminService);
  private router = inject(Router);
  private toastController = inject(ToastController);

  role: UserRole = 'customer';
  activeBottomTab: 'home' | 'explore' | 'create' | 'library' | 'profile' = 'library';

  customers: any[] = [];
  isLoading = false;
  page = 0;
  size = 10;
  isLastPage = true;

  private updatingIds = new Set<string | number>();

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
      this.router.navigateByUrl('/home?tab=home', { replaceUrl: true });
      return;
    }

    this.loadCustomers(true);
  }

  async loadCustomers(reset = false): Promise<void> {
    if (this.isLoading) return;
    this.isLoading = true;

    const nextPage = reset ? 0 : this.page;
    this.adminService.getCustomers({ page: nextPage, size: this.size }).subscribe({
      next: (res: any) => {
        const items = this.adminService.extractCustomers(res);
        this.isLastPage = !!res?.last;

        if (reset) {
          this.customers = items;
          this.page = 1;
        } else {
          this.customers = [...(this.customers || []), ...items];
          this.page = nextPage + 1;
        }
        this.isLoading = false;
      },
      error: async (err) => {
        // eslint-disable-next-line no-console
        console.error('Failed to load customers', err);
        this.isLoading = false;
        await this.presentToast('Failed to load customers.', 'danger');
      },
    });
  }

  isUpdating(c: any): boolean {
    const id = c?.id;
    if (id == null) return false;
    return this.updatingIds.has(id);
  }

  async toggleActive(c: any, event: any): Promise<void> {
    const id = c?.id;
    if (id == null) return;

    const nextActive = !!event?.detail?.checked;
    const prevActive = !!c?.active;

    c.active = nextActive;
    this.updatingIds.add(id);

    this.adminService.updateCustomerStatus(id, nextActive).subscribe({
      next: async () => {
        this.updatingIds.delete(id);
        await this.presentToast('Customer status updated.', 'success');
      },
      error: async (err) => {
        // eslint-disable-next-line no-console
        console.error('Failed to update customer status', err);
        this.updatingIds.delete(id);
        c.active = prevActive;
        await this.presentToast('Failed to update status.', 'danger');
      },
    });
  }

  setBottomTab(tab: 'home' | 'explore' | 'create' | 'library' | 'profile'): void {
    this.activeBottomTab = tab;

    if (tab === 'library') return;
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
    if (tab === 'create') {
      this.router.navigateByUrl('/stories/add');
    }
  }

  private async presentToast(message: string, color: 'success' | 'danger' | 'medium' = 'medium'): Promise<void> {
    const toast = await this.toastController.create({
      message,
      duration: 1600,
      position: 'bottom',
      color,
    });
    await toast.present();
  }
}

