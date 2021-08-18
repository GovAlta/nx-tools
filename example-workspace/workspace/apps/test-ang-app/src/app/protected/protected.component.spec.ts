import {
  ComponentFixture,
  TestBed,
  waitForAsync,
  inject,
} from '@angular/core/testing';
import { ProtectedComponent } from './protected.component';
import {
  HttpClientTestingModule,
  HttpTestingController,
} from '@angular/common/http/testing';
import TenantService from '../tenant.service';
import {
  BrowserDynamicTestingModule,
  platformBrowserDynamicTesting,
} from '@angular/platform-browser-dynamic/testing';

describe('ProtectedComponent', () => {
  let fixture: ComponentFixture<ProtectedComponent>;
  let httpTestingController: HttpTestingController;
  let envData = {
    production: false,
    access: {
      url: 'https://testurl.com',
      realm: '123',
      client_id: 'urn:ads:platform:tenant-admin-app',
    },
    tenantApi: {
      host: 'http://localhost:3333',
      endpoints: { tenantNameByRealm: '/api/tenant/v1/realm' },
    },
  };

  localStorage.setItem('envData', JSON.stringify(envData));
  beforeAll(() => {
    TestBed.initTestEnvironment(
      BrowserDynamicTestingModule,
      platformBrowserDynamicTesting()
    );
  });
  beforeEach(
    waitForAsync(() => {
      TestBed.configureTestingModule({
        declarations: [ProtectedComponent],
        providers: [ProtectedComponent, TenantService],
        imports: [HttpClientTestingModule],
      }).compileComponents();

      httpTestingController = TestBed.inject(HttpTestingController);
    })
  );

  beforeEach(() => {
    fixture = TestBed.createComponent(ProtectedComponent);
    fixture.detectChanges();
  });

  afterEach(() => {
    httpTestingController.verify();
  });

  it('should create', inject([TenantService, HttpTestingController], () => {
    const mockTenant = { status: 200, statusText: 'OK' };
    const data = { name: 'Child Services' };
    const req = httpTestingController.expectOne(
      'http://localhost:3333/api/tenant/v1/realm/123'
    );

    expect(req.request.method).toEqual('GET');

    req.flush(data, mockTenant);
  }));
});
