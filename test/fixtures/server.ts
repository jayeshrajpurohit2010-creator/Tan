import { createServer, type Server } from 'node:http';

export type FixtureServer = {
  url: string;
  close(): Promise<void>;
};

export async function startFixtureServer(): Promise<FixtureServer> {
  const server = createServer((request, response) => {
    switch (request.url) {
      case '/json':
        response.writeHead(200, { 'content-type': 'application/json' });
        response.end(JSON.stringify({ ok: true, name: 'tan' }));
        return;
      case '/html':
        response.writeHead(200, { 'content-type': 'text/html' });
        response.end('<!doctype html><html><body>tan</body></html>');
        return;
      case '/png':
        response.writeHead(200, { 'content-type': 'image/png' });
        response.end(Buffer.from('89504e470d0a1a0a', 'hex'));
        return;
      case '/segment.ts':
        response.writeHead(200, { 'content-type': 'video/mp2t' });
        response.end(Buffer.alloc(188, 0x47));
        return;
      default:
        response.writeHead(200, { 'content-type': 'application/octet-stream' });
        response.end(Buffer.from([0, 1, 2, 3, 254, 255]));
    }
  });

  await listen(server);
  const address = server.address();
  if (!address || typeof address === 'string') {
    throw new Error('Fixture server did not expose a TCP address.');
  }

  return {
    url: `http://127.0.0.1:${address.port}`,
    close: () =>
      new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
      })
  };
}

function listen(server: Server): Promise<void> {
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      server.off('error', reject);
      resolve();
    });
  });
}
