import { TestBed, getTestBed } from '@angular/core/testing';
import { AppComponent } from './app.component';
import { AngularComponentsModule } from '@abgov/angular-components';
import { RouterTestingModule } from '@angular/router/testing';
import {
  BrowserDynamicTestingModule,
  platformBrowserDynamicTesting,
} from '@angular/platform-browser-dynamic/testing';

describe('AppComponent', () => {
  beforeAll(() => {
    TestBed.initTestEnvironment(
      BrowserDynamicTestingModule,
      platformBrowserDynamicTesting()
    );
  });
  beforeEach(async () => {
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
    await TestBed.configureTestingModule({
      declarations: [AppComponent],
      imports: [AngularComponentsModule, RouterTestingModule],
    }).compileComponents();
  });

  it('should create the app', () => {
    const fixture = TestBed.createComponent(AppComponent);
    const app = fixture.componentInstance;
    expect(app).toBeTruthy();
  });

  it(`should have as title 'test-ang-app'`, () => {
    const fixture = TestBed.createComponent(AppComponent);
    const app = fixture.componentInstance;
    expect(app.title).toEqual('test-ang-app');
  });

  it('should render title', () => {
    const fixture = TestBed.createComponent(AppComponent);
    fixture.detectChanges();
    const compiled = fixture.nativeElement;
    expect(compiled.querySelector('h2').textContent).toContain(
      'Welcome to test-ang-app!'
    );
  });
});
