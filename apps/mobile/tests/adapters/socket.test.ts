import { nativeSocketFactory } from '../../src/adapters/socket';

describe('native socket factory', () => {
  const original = globalThis.WebSocket;
  afterEach(() => {
    globalThis.WebSocket = original;
  });

  it('opens the url on the platform WebSocket', () => {
    const urls: string[] = [];
    globalThis.WebSocket = class {
      constructor(url: string) {
        urls.push(url);
      }
    } as unknown as typeof WebSocket;
    nativeSocketFactory('wss://gw.test/gateway?v=1&encoding=json');
    expect(urls).toEqual(['wss://gw.test/gateway?v=1&encoding=json']);
  });
});
