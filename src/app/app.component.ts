import { Component } from '@angular/core';

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
}
