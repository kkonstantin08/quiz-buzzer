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

describe('nginx proxy headers', () => {
  it('accepts X-Forwarded-Proto only from cloudflared and only for http or https', () => {
    expect(forwardedProto('172.30.0.3', 'https', 'http')).toBe('https');
    expect(forwardedProto('172.30.0.3', 'http', 'https')).toBe('http');
    expect(forwardedProto('172.30.0.3', 'ftp', 'https')).toBe('https');
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
});
