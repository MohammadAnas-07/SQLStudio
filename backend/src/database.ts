import { PGlite } from '@electric-sql/pglite';
import { PrismaClient } from '@prisma/client';
import path from 'path';

export const prisma = new PrismaClient();

const dbPath = path.resolve(__dirname, '../../pgdata');
export const db = new PGlite(dbPath);
