import '@testing-library/jest-dom/vitest';

// jsdom doesn't implement ResizeObserver, which react-resizable-panels
// (used for the SQL Workspace layout) requires in a mount-time effect —
// without this, any test that renders a Panel/Group crashes with
// "TypeError: n is not a constructor". A no-op stub is enough since these
// tests don't assert on actual resize behavior.
if (typeof globalThis.ResizeObserver === 'undefined') {
  globalThis.ResizeObserver = class ResizeObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
}
