import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const nginxConfig = fs.readFileSync(path.resolve(process.cwd(), 'nginx/nginx.conf'), 'utf8');

function forwardedProto(remoteAddress: string, protocol: string, scheme: string) {
  const map = nginxConfig.match(/map "\$realip_remote_addr:\$http_x_forwarded_proto" \$forwarded_proto \{([\s\S]*?)\n    \}/)?.[1];
  if (!map) throw new Error('forwarded protocol map is missing');

  const rule = new RegExp(`"${remoteAddress}:${protocol}"\\s+(http|https);`).exec(map)?.[1];
  return rule ?? scheme;
}

function hstsHeader(protocol: string) {
  const map = nginxConfig.match(/map \$forwarded_proto \$hsts_header \{([\s\S]*?)\n    \}/)?.[1];
  if (!map) throw new Error('HSTS map is missing');

  const rule = new RegExp(`^\\s*${protocol}\\s+"([^"]*)";`, 'm').exec(map)?.[1];
  const fallback = /^\s*default\s+"([^"]*)";/m.exec(map)?.[1];
  return rule ?? fallback;
}

describe('nginx proxy headers', () => {
  it('accepts X-Forwarded-Proto only from cloudflared and only for http or https', () => {
    expect(forwardedProto('172.30.0.11', 'https', 'http')).toBe('https');
    expect(forwardedProto('172.30.0.11', 'http', 'https')).toBe('http');
    expect(forwardedProto('172.30.0.11', 'ftp', 'https')).toBe('https');
    expect(forwardedProto('198.51.100.10', 'https', 'http')).toBe('http');
  });

  it.each(['/api/', '/socket.io/', '/uploads/'])('rewrites forwarded headers for %s', (location) => {
    const block = nginxConfig.match(new RegExp(`location ${location.replace('/', '\\/')} \\{([\\s\\S]*?)\\n        \\}`))?.[1] ?? '';

    expect(block).toContain('proxy_set_header Host $host;');
    expect(block).toContain('proxy_set_header X-Real-IP $remote_addr;');
    expect(block).toContain('proxy_set_header X-Forwarded-For $remote_addr;');
    expect(block).toContain('proxy_set_header X-Forwarded-Proto $forwarded_proto;');
    expect(block).toContain('proxy_set_header X-Forwarded-Host $host;');
  });

  it('adds short-lived HSTS only for trusted HTTPS and suppresses upstream HSTS', () => {
    expect(hstsHeader('https')).toBe('max-age=86400');
    expect(hstsHeader('http')).toBe('');
    expect(nginxConfig).toContain('proxy_hide_header Strict-Transport-Security;');
    expect(nginxConfig.match(/add_header Strict-Transport-Security \$hsts_header always;/g)).toHaveLength(2);
  });

  it('allows only the documented Yandex Metrica origins in CSP', () => {
    const csp = nginxConfig.match(/add_header Content-Security-Policy "([^"]+)" always;/)?.[1] ?? '';

    expect(csp).toContain("script-src 'self' 'unsafe-inline' https://mc.yandex.ru https://yastatic.net;");
    expect(csp).toContain("img-src 'self' data: blob: https://mc.yandex.ru;");
    expect(csp).toContain("connect-src 'self' wss: ws: https://mc.yandex.ru;");
    expect(csp).not.toContain('*');
    expect(csp).not.toContain("'unsafe-eval'");
  });
});
