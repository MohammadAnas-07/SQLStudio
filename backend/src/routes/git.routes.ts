import { FastifyInstance } from 'fastify';
import { simpleGit, SimpleGit, SimpleGitOptions } from 'simple-git';
import { config } from '../config/env';
import { getErrorMessage } from '../lib/errors';

const WORKSPACE_ROOT = config.WORKSPACE_ROOT_PATH;

// Configure simple-git to strictly use WORKSPACE_ROOT
const gitOptions: Partial<SimpleGitOptions> = {
  baseDir: WORKSPACE_ROOT,
  binary: 'git',
  maxConcurrentProcesses: 6,
  trimmed: false,
};

const git: SimpleGit = simpleGit(gitOptions);

/**
 * Resolves a path's last-committed (HEAD) content — used to build a
 * deletion diff for a file that no longer exists on disk. Exported (and
 * parameterized on the git instance) so it can be exercised directly in
 * tests against a temp repo, without spinning up Fastify.
 *
 * `existsInHead` disambiguates two cases that git's error message alone
 * conflates into "empty content": a file that IS in HEAD but happens to be
 * genuinely empty, versus a file that was never committed at all (e.g.
 * staged then deleted before the first commit, or a brand new repo with no
 * commits yet) and therefore has no prior version to diff against.
 */
export async function resolveHeadContent(
  gitInstance: Pick<SimpleGit, 'show'>,
  filePath: string
): Promise<{ success: true; content: string; existsInHead: boolean } | { success: false; error: string }> {
  try {
    const content = await gitInstance.show([`HEAD:${filePath}`]);
    return { success: true, content, existsInHead: true };
  } catch (error) {
    const message = getErrorMessage(error);
    if (message.includes("exists on disk, but not in 'HEAD'") ||
        message.includes("does not exist in 'HEAD'") ||
        message.includes("unknown revision") ||
        // Thrown when the repo has no commits at all yet, so 'HEAD' itself
        // doesn't resolve to anything — pre-existing gap this surfaced:
        // previously fell through to a 500 instead of "no prior version".
        message.includes("invalid object name 'HEAD'")) {
      return { success: true, content: '', existsInHead: false };
    }
    return { success: false, error: message };
  }
}

export async function gitRoutes(fastify: FastifyInstance) {
  
  fastify.post('/api/git/init', async (request, reply) => {
    try {
      await git.init();
      return { success: true, message: 'Initialized empty Git repository' };
    } catch (error) {
      return reply.status(500).send({ success: false, error: getErrorMessage(error) });
    }
  });

  fastify.get('/api/git/status', async (request, reply) => {
    try {
      const status = await git.status();
      return { success: true, status };
    } catch (error) {
      return reply.status(500).send({ success: false, error: getErrorMessage(error) });
    }
  });

  fastify.post('/api/git/add', async (request, reply) => {
    const { files } = request.body as { files: string | string[] };
    if (!files) return reply.status(400).send({ success: false, error: 'Files are required' });
    try {
      await git.add(files);
      return { success: true, message: 'Files staged' };
    } catch (error) {
      return reply.status(500).send({ success: false, error: getErrorMessage(error) });
    }
  });

  fastify.post('/api/git/commit', async (request, reply) => {
    const { message } = request.body as { message: string };
    if (!message) return reply.status(400).send({ success: false, error: 'Commit message required' });
    try {
      const commitResult = await git.commit(message);
      return { success: true, commitResult };
    } catch (error) {
      return reply.status(500).send({ success: false, error: getErrorMessage(error) });
    }
  });

  fastify.get('/api/git/log', async (request, reply) => {
    try {
      const log = await git.log();
      return { success: true, log: log.all };
    } catch (error) {
      return reply.status(500).send({ success: false, error: getErrorMessage(error) });
    }
  });

  fastify.get('/api/git/branch', async (request, reply) => {
    try {
      const branches = await git.branch();
      return { success: true, branches };
    } catch (error) {
      return reply.status(500).send({ success: false, error: getErrorMessage(error) });
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
    } catch (error) {
      return reply.status(500).send({ success: false, error: getErrorMessage(error) });
    }
  });

  fastify.get('/api/git/diff', async (request, reply) => {
    try {
      const diff = await git.diff();
      return { success: true, diff };
    } catch (error) {
      return reply.status(500).send({ success: false, error: getErrorMessage(error) });
    }
  });

  fastify.post('/api/git/unstage', async (request, reply) => {
    const { files } = request.body as { files: string | string[] };
    if (!files) return reply.status(400).send({ success: false, error: 'Files are required' });
    try {
      await git.reset(['HEAD', ...(Array.isArray(files) ? files : [files])]);
      return { success: true, message: 'Files unstaged' };
    } catch (error) {
      return reply.status(500).send({ success: false, error: getErrorMessage(error) });
    }
  });

  fastify.get('/api/git/show', async (request, reply) => {
    const { path: filePath } = request.query as { path?: string };
    if (!filePath) return reply.status(400).send({ success: false, error: 'Path is required' });
    const result = await resolveHeadContent(git, filePath);
    if (!result.success) {
      return reply.status(500).send(result);
    }
    return result;
  });

  fastify.post('/api/git/remote', async (request, reply) => {
    const { name, url } = request.body as { name: string, url: string };
    if (!name || !url) return reply.status(400).send({ success: false, error: 'Remote name and url required' });
    try {
      await git.addRemote(name, url);
      return { success: true, message: `Added remote ${name}` };
    } catch (error) {
      return reply.status(500).send({ success: false, error: getErrorMessage(error) });
    }
  });

  fastify.post('/api/git/push', async (request, reply) => {
    const { remote, branch } = request.body as { remote?: string, branch?: string };
    try {
      const pushResult = await git.push(remote || 'origin', branch || 'master');
      return { success: true, pushResult };
    } catch (error) {
      return reply.status(500).send({ success: false, error: getErrorMessage(error) });
    }
  });
}
