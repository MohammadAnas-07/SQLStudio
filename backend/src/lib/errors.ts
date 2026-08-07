// Catch-clause bindings are `unknown` under strict mode (and TypeScript only
// allows `any`/`unknown` as an explicit catch annotation), so call sites
// can't just type their way to `.message`. Centralizing the narrowing here
// keeps every route/service handler's catch block honest about that instead
// of re-deriving `instanceof Error` checks — or reaching for `any` — at each
// of the ~30 call sites across routes/controllers/services.
export function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}
