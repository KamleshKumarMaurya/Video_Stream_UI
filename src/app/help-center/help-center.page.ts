import { Component } from '@angular/core';
import { Router } from '@angular/router';

@Component({
  selector: 'app-help-center',
  standalone: false,
  templateUrl: './help-center.page.html',
  styleUrls: ['./help-center.page.scss'],
})
export class HelpCenterPage {
  constructor(private router: Router) {}

  goBack(): void {
    this.router.navigateByUrl('/login', { replaceUrl: true });
  }
}
