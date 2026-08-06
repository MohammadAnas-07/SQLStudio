/// <reference types="vite/client" />

interface ImportMetaEnv {
  // Base URL of the backend API. Optional — falls back to
  // http://localhost:3000 for local dev when unset. See .env.example.
  readonly VITE_API_BASE_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
