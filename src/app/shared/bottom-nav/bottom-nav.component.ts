import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, Output } from '@angular/core';
import { IonicModule } from '@ionic/angular';

export interface BottomNavItem {
  id: string;
  label?: string;
  icon: string;
  center?: boolean;
  ariaLabel?: string;
}

@Component({
  selector: 'app-bottom-nav',
  standalone: true,
  imports: [CommonModule, IonicModule],
  templateUrl: './bottom-nav.component.html',
  styleUrls: ['./bottom-nav.component.scss'],
})
export class BottomNavComponent {
  @Input() items: BottomNavItem[] = [];
  @Input() activeId = '';
  @Output() selected = new EventEmitter<any>();

  get gridTemplateColumns(): string {
    return `repeat(${Math.max(1, this.items.length)}, minmax(0, 1fr))`;
  }

  trackById(_: number, item: BottomNavItem): string {
    return item.id;
  }

  select(item: BottomNavItem): void {
    this.selected.emit(item.id);
  }
}
