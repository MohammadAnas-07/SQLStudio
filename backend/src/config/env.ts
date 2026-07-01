import dotenv from 'dotenv';
dotenv.config();

export const config = {
  GEMINI_API_KEY: process.env.GEMINI_API_KEY || '',
};
