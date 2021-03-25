import {
  addDependenciesToPackageJson,
  Tree,
} from '@nrwl/devkit';
import { wrapAngularDevkitSchematic } from '@nrwl/devkit/ngcli-adapter';
import { InitGeneratorSchema } from './schema';

export default async function (host: Tree, options: InitGeneratorSchema) {
  
  const initExpress = wrapAngularDevkitSchematic('@nrwl/express', 'application');
  await initExpress(host, options);
  
  addDependenciesToPackageJson(
    host, 
    {
      'jwks-rsa': '^2.0.2',
      'passport': '^0.4.1',
      'passport-jwt': '^4.0.0',
    },
    {
      '@types/passport': '^1.0.6',
      '@types/passport-jwt': '^3.0.5',
    }
  )
}
