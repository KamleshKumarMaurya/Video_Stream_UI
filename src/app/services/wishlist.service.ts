import { Injectable } from '@angular/core';

export interface WishlistStory {
  id: string | number;
  title: string;
  thumbnail?: string | null;
  category?: string | null;
  description?: string | null;
  createdAt?: string | number | null;
}

export interface WishlistToggleResult {
  added: boolean;
  reason?: 'limit' | 'exists' | 'missing';
}

@Injectable({
  providedIn: 'root',
})
export class WishlistService {
  private readonly maxItems = 10;

  getItems(): WishlistStory[] {
    return this.readItems();
  }

  hasStory(storyId: string | number | null | undefined): boolean {
    if (storyId == null || storyId === '') return false;
    return this.readItems().some((item) => String(item.id) === String(storyId));
  }

  addStory(story: any): WishlistToggleResult {
    const normalized = this.normalizeStory(story);
    if (!normalized) return { added: false, reason: 'missing' };

    const items = this.readItems();
    if (items.some((item) => String(item.id) === String(normalized.id))) {
      return { added: false, reason: 'exists' };
    }

    if (items.length >= this.maxItems) {
      return { added: false, reason: 'limit' };
    }

    const next = [normalized, ...items].slice(0, this.maxItems);
    this.writeItems(next);
    return { added: true };
  }

  removeStory(storyId: string | number): boolean {
    const current = this.readItems();
    const next = current.filter((item) => String(item.id) !== String(storyId));
    if (next.length === current.length) return false;
    this.writeItems(next);
    return true;
  }

  toggleStory(story: any): WishlistToggleResult {
    const storyId = story?.id;
    if (storyId == null || storyId === '') return { added: false, reason: 'missing' };

    if (this.hasStory(storyId)) {
      this.removeStory(storyId);
      return { added: false };
    }

    return this.addStory(story);
  }

  private normalizeStory(story: any): WishlistStory | null {
    const id = story?.id ?? story?.storyId ?? story?.story_id;
    if (id == null || id === '') return null;

    const title = String(story?.title ?? story?.name ?? `Story ${id}`).trim();
    return {
      id,
      title: title || `Story ${id}`,
      thumbnail: story?.thumbnail ?? story?.cover ?? null,
      category: story?.category ?? null,
      description: story?.description ?? story?.summary ?? null,
      createdAt: story?.createdAt ?? story?.created_at ?? story?.createdAtMs ?? null,
    };
  }

  private getStorageKey(): string {
    let role = 'customer';
    let userPart = 'guest';

    try {
      const storedRole = localStorage.getItem('vs_role');
      if (storedRole === 'admin' || storedRole === 'customer') role = storedRole;

      userPart =
        localStorage.getItem('vs_user_id') ||
        localStorage.getItem('vs_customer_code') ||
        localStorage.getItem('vs_phone') ||
        'guest';
    } catch {
      /* ignore */
    }

    return `vs_wishlist_${role}_${userPart}`;
  }

  private readItems(): WishlistStory[] {
    try {
      const raw = localStorage.getItem(this.getStorageKey());
      if (!raw) return [];

      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return [];

      return parsed
        .map((item) => this.normalizeStoredItem(item))
        .filter((item): item is WishlistStory => !!item)
        .slice(0, this.maxItems);
    } catch {
      return [];
    }
  }

  private writeItems(items: WishlistStory[]): void {
    try {
      localStorage.setItem(this.getStorageKey(), JSON.stringify(items.slice(0, this.maxItems)));
    } catch {
      /* ignore */
    }
  }

  private normalizeStoredItem(item: any): WishlistStory | null {
    if (!item) return null;
    const id = item?.id ?? item?.storyId ?? item?.story_id;
    if (id == null || id === '') return null;

    const title = String(item?.title ?? item?.name ?? `Story ${id}`).trim();
    return {
      id,
      title: title || `Story ${id}`,
      thumbnail: item?.thumbnail ?? item?.cover ?? null,
      category: item?.category ?? null,
      description: item?.description ?? item?.summary ?? null,
      createdAt: item?.createdAt ?? item?.created_at ?? item?.createdAtMs ?? null,
    };
  }
}
