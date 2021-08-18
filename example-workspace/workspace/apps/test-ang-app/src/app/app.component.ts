import { Component, OnDestroy, OnInit } from '@angular/core';
import { AuthService } from './services/auth.service';
import { environment } from '../environments/environment';

@Component({
  selector: 'workspace-app-root',
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.css'],
})
export class AppComponent implements OnInit, OnDestroy {
  title = 'test-ang-app';

  constructor(private authService: AuthService) {}

  isLoggedIn(): boolean {
    return this.authService.isLoggedIn();
  }

  logout() {
    if (this.authService.isLoggedIn()) {
      this.authService.logout();
    }
  }

  login() {
    if (!this.authService.isLoggedIn()) {
      this.authService.startAuthentication();
    }
  }

  ngOnInit() {}

  ngOnDestroy(): void {}
}
