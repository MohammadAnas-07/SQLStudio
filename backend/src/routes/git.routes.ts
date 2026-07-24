import { FastifyInstance } from 'fastify';
import { simpleGit, SimpleGit, SimpleGitOptions } from 'simple-git';
import path from 'path';
import os from 'os';

const WORKSPACE_ROOT = path.join(os.homedir(), 'Desktop', 'sql-workspace');

// Configure simple-git to strictly use WORKSPACE_ROOT
const gitOptions: Partial<SimpleGitOptions> = {
  baseDir: WORKSPACE_ROOT,
  binary: 'git',
  maxConcurrentProcesses: 6,
  trimmed: false,
};

const git: SimpleGit = simpleGit(gitOptions);

export async function gitRoutes(fastify: FastifyInstance) {
  
  fastify.post('/api/git/init', async (request, reply) => {
    try {
      await git.init();
      return { success: true, message: 'Initialized empty Git repository' };
    } catch (error: any) {
      return reply.status(500).send({ success: false, error: error.message });
    }
  });

  fastify.get('/api/git/status', async (request, reply) => {
    try {
      const status = await git.status();
      return { success: true, status };
    } catch (error: any) {
      return reply.status(500).send({ success: false, error: error.message });
    }
  });

  fastify.post('/api/git/add', async (request, reply) => {
    const { files } = request.body as { files: string | string[] };
    if (!files) return reply.status(400).send({ success: false, error: 'Files are required' });
    try {
      await git.add(files);
      return { success: true, message: 'Files staged' };
    } catch (error: any) {
      return reply.status(500).send({ success: false, error: error.message });
    }
  });

  fastify.post('/api/git/commit', async (request, reply) => {
    const { message } = request.body as { message: string };
    if (!message) return reply.status(400).send({ success: false, error: 'Commit message required' });
    try {
      const commitResult = await git.commit(message);
      return { success: true, commitResult };
    } catch (error: any) {
      return reply.status(500).send({ success: false, error: error.message });
    }
  });

  fastify.get('/api/git/log', async (request, reply) => {
    try {
      const log = await git.log();
      return { success: true, log: log.all };
    } catch (error: any) {
      return reply.status(500).send({ success: false, error: error.message });
    }
  });

  fastify.get('/api/git/branch', async (request, reply) => {
    try {
      const branches = await git.branch();
      return { success: true, branches };
    } catch (error: any) {
      return reply.status(500).send({ success: false, error: error.message });
    }
  });

  fastify.post('/api/git/checkout', async (request, reply) => {
    const { branch, create } = request.body as { branch: string, create?: boolean };
    if (!branch) return reply.status(400).send({ success: false, error: 'Branch name required' });
    try {
      if (create) {
        await git.checkoutLocalBranch(branch);
      } else {
        await git.checkout(branch);
      }
      return { success: true, message: `Checked out ${branch}` };
    } catch (error: any) {
      return reply.status(500).send({ success: false, error: error.message });
    }
  });

  fastify.get('/api/git/diff', async (request, reply) => {
    try {
      const diff = await git.diff();
      return { success: true, diff };
    } catch (error: any) {
      return reply.status(500).send({ success: false, error: error.message });
    }
  });

  fastify.post('/api/git/remote', async (request, reply) => {
    const { name, url } = request.body as { name: string, url: string };
    if (!name || !url) return reply.status(400).send({ success: false, error: 'Remote name and url required' });
    try {
      await git.addRemote(name, url);
      return { success: true, message: `Added remote ${name}` };
    } catch (error: any) {
      return reply.status(500).send({ success: false, error: error.message });
    }
  });

  fastify.post('/api/git/push', async (request, reply) => {
    const { remote, branch } = request.body as { remote?: string, branch?: string };
    try {
      const pushResult = await git.push(remote || 'origin', branch || 'master');
      return { success: true, pushResult };
    } catch (error: any) {
      return reply.status(500).send({ success: false, error: error.message });
    }
  });
}
