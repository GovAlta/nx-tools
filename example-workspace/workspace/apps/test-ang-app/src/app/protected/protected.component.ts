import { Component, OnInit } from '@angular/core';
import TenantService from '../tenant.service';

@Component({
  selector: 'app-protected',
  templateUrl: './protected.component.html',
  styleUrls: ['./protected.component.css'],
})
export class ProtectedComponent implements OnInit {
  constructor(private _tenantService: TenantService) {}

  public tenant = { name: '' };

  getTenant() {
    this._tenantService.getTenant().subscribe(
      (data: any) => {
        this.tenant = data.tenant;
      },
      (err) => console.error(err),
      () => console.log('done loading tenant')
    );
  }

  ngOnInit() {
    this.getTenant();
  }
}
