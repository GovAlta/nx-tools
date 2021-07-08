import { environment } from './environment';
import { Injectable } from '@angular/core';

@Injectable()
export class Config {
  constructor() {}

  Init() {
    return new Promise<void>((resolve, reject) => {
      console.log('AppInitService.init() called');

      fetch('/config/config.json')
        .then((res) => {
          return res.ok ? res.json() : environment;
        })
        .then((envData) => {
          localStorage.setItem('envData', JSON.stringify(envData));
          resolve();
        });
    });
  }
}
