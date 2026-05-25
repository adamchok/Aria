import '@testing-library/jest-dom/vitest';
import { afterAll, afterEach, beforeAll } from 'vitest';
import { server } from './msw-server';
import { resetHandlerState } from './handlers';

// jsdom doesn't ship matchMedia; AG Grid / Tailwind utilities query it.
if (!window.matchMedia) {
  window.matchMedia = (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  });
}

if (!(globalThis as { ResizeObserver?: unknown }).ResizeObserver) {
  class RO {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  (globalThis as unknown as { ResizeObserver: typeof RO }).ResizeObserver = RO;
}

// jsdom does not implement EventSource (SSE). Stub it so components that use
// useJobStream don't crash on mount during tests.
if (!(globalThis as { EventSource?: unknown }).EventSource) {
  class FakeEventSource {
    static readonly CONNECTING = 0;
    static readonly OPEN = 1;
    static readonly CLOSED = 2;
    readonly readyState = FakeEventSource.CLOSED;
    onopen: (() => void) | null = null;
    onerror: (() => void) | null = null;
    onmessage: (() => void) | null = null;
    constructor(_url: string) {}
    addEventListener() {}
    removeEventListener() {}
    dispatchEvent() { return false; }
    close() {}
  }
  (globalThis as unknown as { EventSource: typeof FakeEventSource }).EventSource = FakeEventSource;
}

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => {
  server.resetHandlers();
  resetHandlerState();
});
afterAll(() => server.close());
