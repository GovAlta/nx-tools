import { ComponentFixture, TestBed } from '@angular/core/testing';
import { AuthCallbackComponent } from './auth-callback.component';
import {
  BrowserDynamicTestingModule,
  platformBrowserDynamicTesting,
} from '@angular/platform-browser-dynamic/testing';

describe('AuthCallbackComponent', () => {
  let component: AuthCallbackComponent;
  let fixture: ComponentFixture<AuthCallbackComponent>;
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

  beforeEach(() => {
    TestBed.initTestEnvironment(
      BrowserDynamicTestingModule,
      platformBrowserDynamicTesting()
    );

    TestBed.configureTestingModule({
      declarations: [AuthCallbackComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(AuthCallbackComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
