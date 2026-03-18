import { Component } from '@angular/core';
import { Capacitor } from '@capacitor/core';
import { StatusBar } from '@capacitor/status-bar';

@Component({
  selector: 'app-root',
  templateUrl: 'app.component.html',
  styleUrls: ['app.component.scss'],
  standalone: false,
})
export class AppComponent {
  menuItems = [
    { title: 'Home', url: '/home', icon: 'home' },
    { title: 'Admin', url: '/admin', icon: 'shield-checkmark' },
    { title: 'Stories', url: '/home', icon: 'book' },
    { title: 'Add Story', url: '/stories/add', icon: 'add-circle', isChild: true },
  ];

  constructor() {
    void this.configureNativeStatusBar();
  }

  private async configureNativeStatusBar() {
    if (!Capacitor.isNativePlatform()) return;
    try {
      await StatusBar.setOverlaysWebView({ overlay: false });
    } catch {
      // ignore
    }
  }
}
