import '@testing-library/jest-dom';

// Mock scrollIntoView which is not available in JSDOM
Element.prototype.scrollIntoView = jest.fn();

// Mock Next.js router
jest.mock('next/navigation', () => ({
  useRouter: () => ({
    push: jest.fn(),
    replace: jest.fn(),
    prefetch: jest.fn(),
    back: jest.fn(),
  }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => '/',
}));

// Mock Clerk
jest.mock('@clerk/nextjs', () => ({
  SignInButton: ({ children }) => children,
  SignUpButton: ({ children }) => children,
  SignedIn: ({ children }) => children,
  SignedOut: ({ children }) => null,
  UserButton: () => null,
  ClerkProvider: ({ children }) => children,
}));

// Mock EventSource for SSE
class MockEventSource {
  constructor(url) {
    this.url = url;
    this.readyState = 0;
    this.onopen = null;
    this.onerror = null;
    this.onmessage = null;
  }

  addEventListener(event, callback) {}
  removeEventListener(event, callback) {}
  close() {}
}

global.EventSource = MockEventSource;
