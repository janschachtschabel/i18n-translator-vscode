import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';

export interface MockRequest {
  method: string;
  path: string;
  /** The X-API-KEY header. */
  key: string | undefined;
  body: unknown;
}

export interface MockAnswer {
  status: number;
  body: unknown;
}

/** A b-api on 127.0.0.1 for the integration tests: it answers with `answer` and keeps the requests it got. */
export async function startMockBapi(answer: (request: MockRequest) => MockAnswer) {
  const requests: MockRequest[] = [];
  const server = createServer((incoming, outgoing) => {
    let data = '';
    incoming.on('data', (chunk: Buffer) => (data += chunk.toString('utf8')));
    incoming.on('end', () => {
      const header = incoming.headers['x-api-key'];
      const request: MockRequest = {
        method: incoming.method ?? '',
        path: incoming.url ?? '',
        key: Array.isArray(header) ? header[0] : header,
        body: data === '' ? undefined : (JSON.parse(data) as unknown),
      };
      requests.push(request);
      const { status, body } = answer(request);
      outgoing.writeHead(status, { 'content-type': 'application/json' });
      outgoing.end(JSON.stringify(body));
    });
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;
  return {
    url: `http://127.0.0.1:${port}`,
    requests,
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
}
