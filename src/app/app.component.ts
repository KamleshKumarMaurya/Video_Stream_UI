import { Component } from '@angular/core';
import { Capacitor } from '@capacitor/core';
import { StatusBar, Style } from '@capacitor/status-bar';

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
      await StatusBar.setOverlaysWebView({ overlay: true });
      await StatusBar.setStyle({ style: Style.Dark });
      await StatusBar.setBackgroundColor({ color: '#00000000' });
      await StatusBar.show();
      if (typeof document !== 'undefined') {
        const rootStyle = document.documentElement.style;
        const platform = Capacitor.getPlatform();
        if (platform === 'android') {
          rootStyle.setProperty('--vs-safe-area-top', '24px');
          rootStyle.setProperty('--vs-safe-area-bottom', '0px');
        } else {
          rootStyle.removeProperty('--vs-safe-area-top');
          rootStyle.removeProperty('--vs-safe-area-bottom');
        }
      }
    } catch {
      // ignore
    }
  }
}
