export interface NginxProxyConfiguration {
  location: string;
  proxyPass: string;
}

export interface NginxOptions {
  proxyLocations?: NginxProxyConfiguration[];
  silentCheckSso?: boolean;
}

export function generateNginxConf({ proxyLocations = [], silentCheckSso = false }: NginxOptions): string {
  const proxyBlocks = proxyLocations
    .map(
      ({ location, proxyPass }) =>
        `\n    location ${location} {\n` +
        `      proxy_pass ${proxyPass};\n` +
        `      proxy_set_header Host $host;\n` +
        `      proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;\n` +
        `      proxy_set_header X-Forwarded-Proto $http_x_forwarded_proto;\n` +
        `    }`,
    )
    .join('\n');

  // nginx add_header inheritance: a location block that defines its own add_header
  // directives stops inheriting ALL add_header directives from the server block.
  // /silent-check-sso.html must be loadable in a hidden iframe by the Keycloak JS
  // adapter (silent SSO check), so we intentionally omit frame-ancestors and
  // X-Frame-Options here. All other security headers are re-declared explicitly.
  const ssoBlock = silentCheckSso
    ? `\n    location = /silent-check-sso.html {\n` +
      `      add_header Cache-Control "no-store" always;\n` +
      `      add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;\n` +
      `      add_header X-Content-Type-Options "nosniff" always;\n` +
      `      add_header Referrer-Policy "strict-origin-when-cross-origin" always;\n` +
      `    }\n`
    : '';

  return (
    `events {\n` +
    `  worker_connections 1024;\n` +
    `}\n` +
    `\n` +
    `http {\n` +
    `  sendfile on;\n` +
    `  include mime.types;\n` +
    `  default_type application/octet-stream;\n` +
    `\n` +
    `  gzip on;\n` +
    `  gzip_types text/plain text/css application/javascript application/json image/svg+xml font/woff2;\n` +
    `  gzip_min_length 1000;\n` +
    `\n` +
    `  server {\n` +
    `    listen 8080;\n` +
    `    root /opt/app-root/src;\n` +
    `    index index.html;\n` +
    `\n` +
    `    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;\n` +
    `    add_header X-Content-Type-Options "nosniff" always;\n` +
    `    add_header X-Frame-Options "DENY" always;\n` +
    `    add_header Referrer-Policy "strict-origin-when-cross-origin" always;\n` +
    `    add_header Content-Security-Policy "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self' https://*.gov.ab.ca https://*.alberta.ca; connect-src 'self' https://*.gov.ab.ca https://*.alberta.ca; frame-ancestors 'none'; form-action 'self'; base-uri 'self';" always;\n` +
    `\n` +
    `    location ~* \\.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2|ttf|eot)$ {\n` +
    `      expires 30d;\n` +
    `      add_header Cache-Control "public, no-transform";\n` +
    `    }\n` +
    ssoBlock +
    `\n` +
    `    location / {\n` +
    `      try_files $uri /index.html;\n` +
    `    }\n` +
    proxyBlocks +
    `\n  }\n` +
    `}\n`
  );
}
