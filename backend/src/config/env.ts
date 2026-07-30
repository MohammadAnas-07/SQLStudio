import dotenv from 'dotenv';
import path from 'path';
import os from 'os';
dotenv.config();

export const config = {
  GEMINI_API_KEY: process.env.GEMINI_API_KEY || '',
  JWT_SECRET: process.env.JWT_SECRET || 'dev-insecure-secret-change-me',
  // Default preserves existing local-dev behavior (a Desktop folder only
  // exists on Windows/Mac). Docker overrides this via WORKSPACE_ROOT_PATH
  // since there's no Desktop folder inside a Linux container.
  WORKSPACE_ROOT_PATH: process.env.WORKSPACE_ROOT_PATH || path.join(os.homedir(), 'Desktop', 'sql-workspace'),
};
