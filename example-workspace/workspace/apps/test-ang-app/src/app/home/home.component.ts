import { Component, OnInit } from '@angular/core';
import { HttpClient } from '@angular/common/http';

@Component({
  selector: 'test-ang-app-app-logout',
  templateUrl: 'home.component.html',
})
export class HomeComponent implements OnInit {
  constructor(private http: HttpClient) {}
  public uptime = 0;

  private getHealthUrl = `${this.configData().tenantApi.host}/health`;

  getHealth() {
    const uptimePromise = this.http.get(this.getHealthUrl);

    uptimePromise.subscribe(
      (data: any) => {
        this.uptime = data.uptime;
      },
      (err) => console.error(err),
      () => console.log('done loading uptime')
    );
  }

  configData() {
    return JSON.parse(localStorage.getItem('envData') || '""');
  }

  ngOnInit() {
    this.getHealth();
  }
}
