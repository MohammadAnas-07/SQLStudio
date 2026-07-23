import fs from 'fs/promises';
import path from 'path';
import { FastifyInstance } from 'fastify';

// Resolve to project root's workspace directory
const WORKSPACE_ROOT = path.resolve(process.cwd(), '../workspace');

// Ensure workspace directory exists
fs.mkdir(WORKSPACE_ROOT, { recursive: true }).catch(console.error);

function resolveAndValidatePath(requestPath: string): string {
  if (!requestPath) requestPath = '';
  // Convert any URL encoded characters (if passed via query string)
  requestPath = decodeURIComponent(requestPath);
  
  const resolvedPath = path.resolve(WORKSPACE_ROOT, requestPath);
  
  // Security Check: Ensure the resolved path is inside the WORKSPACE_ROOT
  if (!resolvedPath.startsWith(WORKSPACE_ROOT)) {
    throw new Error('Invalid path: Access denied (Outside workspace root)');
  }
  
  return resolvedPath;
}

interface FileNode {
  name: string;
  path: string;
  isDir: boolean;
  children?: FileNode[];
}

async function buildFileTree(dirPath: string, relativeRoot: string = ''): Promise<FileNode[]> {
  try {
    const entries = await fs.readdir(dirPath, { withFileTypes: true });
    const nodes: FileNode[] = [];
    
    for (const entry of entries) {
      const fullPath = path.join(dirPath, entry.name);
      const relPath = path.join(relativeRoot, entry.name).replace(/\\/g, '/');
      const isDir = entry.isDirectory();
      
      let children: FileNode[] | undefined;
      if (isDir) {
        children = await buildFileTree(fullPath, relPath);
      }
      
      nodes.push({
        name: entry.name,
        path: relPath,
        isDir,
        children
      });
    }
    
    // Sort folders first, then alphabetically
    return nodes.sort((a, b) => {
      if (a.isDir && !b.isDir) return -1;
      if (!a.isDir && b.isDir) return 1;
      return a.name.localeCompare(b.name);
    });
  } catch (e: any) {
    if (e.code === 'ENOENT') {
      return [];
    }
    throw e;
  }
}

export const fileRoutes = async (fastify: FastifyInstance) => {
  
  fastify.get('/api/files', async (request, reply) => {
    try {
      const tree = await buildFileTree(WORKSPACE_ROOT);
      return { success: true, files: tree };
    } catch (error: any) {
      return reply.status(500).send({ success: false, error: error.message });
    }
  });
  
  fastify.post('/api/files', async (request, reply) => {
    const { path: reqPath, type } = request.body as { path: string, type: 'file' | 'folder' };
    
    try {
      const targetPath = resolveAndValidatePath(reqPath);
      
      if (type === 'folder') {
        await fs.mkdir(targetPath, { recursive: true });
      } else {
        // Create empty file
        const handle = await fs.open(targetPath, 'a');
        await handle.close();
      }
      
      return { success: true };
    } catch (error: any) {
      return reply.status(400).send({ success: false, error: error.message });
    }
  });
  
  fastify.put('/api/files', async (request, reply) => {
    const { oldPath, newPath } = request.body as { oldPath: string, newPath: string };
    
    try {
      const targetOldPath = resolveAndValidatePath(oldPath);
      const targetNewPath = resolveAndValidatePath(newPath);
      
      await fs.rename(targetOldPath, targetNewPath);
      return { success: true };
    } catch (error: any) {
      return reply.status(400).send({ success: false, error: error.message });
    }
  });
  
  fastify.delete('/api/files', async (request, reply) => {
    const { path: reqPath } = request.query as { path: string };
    
    try {
      const targetPath = resolveAndValidatePath(reqPath);
      
      const stat = await fs.stat(targetPath);
      if (stat.isDirectory()) {
        await fs.rm(targetPath, { recursive: true, force: true });
      } else {
        await fs.unlink(targetPath);
      }
      
      return { success: true };
    } catch (error: any) {
      return reply.status(400).send({ success: false, error: error.message });
    }
  });

};
