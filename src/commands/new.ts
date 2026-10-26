import crypto from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawn } from 'node:child_process';

import chalk from 'chalk';
import degit from 'degit';
import ora from 'ora';
import { confirm, input, password, select } from '@inquirer/prompts';

type PackageManager = 'npm' | 'yarn' | 'pnpm';

type Answers = {
  folderName: string;
  projectName: string;
  database: boolean;
  dbName: string;
  dbUser: string;
  dbPass: string;
  dbHost: string;
  dbPort: string;
  dbType: 'mysql' | 'mariadb';
  socketio: boolean;
  redis: boolean;
  rateLimit: boolean;
  rateLimitMax: number;
  rateLimitWindow: number;
  rateLimitRedis: boolean;
  packageManager: PackageManager;
  installNow: boolean;
};

const DEFAULTS = {
  port: '1337',
  host: '0.0.0.0',
  dbPort: '3306',
  dbType: 'mariadb' as const,
  rateLimitMax: 100,
  rateLimitWindow: 60,
};

/**
 * Prompts for project configuration.
 */
export async function promptQuestions(): Promise<Answers> {
  console.log(`\n${chalk.cyanBright('╭────────────────────────────────────╮')}`);
  console.log(`${chalk.cyanBright('│')} ${chalk.bold.white('✦ FLUTRY')} ${chalk.gray('project generator')} ${chalk.cyanBright('│')}`);
  console.log(`${chalk.cyanBright('╰────────────────────────────────────╯')}`);
  console.log(chalk.gray('  Create a clean project with a few focused choices.\n'));

  const folderName = await input({
    message: `${chalk.cyan('📁')} Project folder:`,
    validate: (value) => validateFolderName(value) || 'Enter a valid folder name without path separators.',
  });

  const projectName = await input({
    message: `${chalk.blue('📦')} Package name:`,
    default: folderName.toLowerCase().replace(/\s+/g, '-'),
    validate: validatePackageName,
  });

  const database = await confirm({
    message: `${chalk.yellow('🗄️')} Enable database?`,
    default: true,
  });

  const databaseAnswers = database
    ? {
        dbName: await input({
          message: `${chalk.yellow('◈')} Database name:`,
          default: 'flutrydb',
        }),
        dbUser: await input({
          message: `${chalk.yellow('◈')} Database user:`,
          default: 'root',
        }),
        dbPass: await password({
          message: `${chalk.yellow('◈')} Database password:`,
          mask: '*',
        }),
        dbHost: await input({
          message: `${chalk.yellow('◈')} Database host:`,
          default: 'localhost',
        }),
        dbPort: await input({
          message: `${chalk.yellow('◈')} Database port:`,
          default: DEFAULTS.dbPort,
          validate: validatePort,
        }),
        dbType: await select({
          message: `${chalk.yellow('◈')} Database type:`,
          choices: [
            { name: 'MariaDB', value: 'mariadb' as const },
            { name: 'MySQL', value: 'mysql' as const },
          ],
          default: DEFAULTS.dbType,
        }),
      }
    : {
        dbName: '',
        dbUser: '',
        dbPass: '',
        dbHost: '',
        dbPort: '',
        dbType: DEFAULTS.dbType,
      };

  const socketio = await confirm({
    message: `${chalk.yellow('🔌')} Enable Socket.IO?`,
    default: true,
  });

  const redis = await confirm({
    message: 'Enable Redis integration?',
    default: false,
  });

  const rateLimit = await confirm({
    message: 'Enable global RateLimit?',
    default: false,
  });

  const rateLimitMax = rateLimit
    ? Number(
        await input({
          message: 'Maximum requests per window?',
          default: String(DEFAULTS.rateLimitMax),
          validate: validatePositiveInteger,
        }),
      )
    : DEFAULTS.rateLimitMax;

  const rateLimitWindow = rateLimit
    ? Number(
        await input({
          message: 'Time window in seconds?',
          default: String(DEFAULTS.rateLimitWindow),
          validate: validateWindow,
        }),
      )
    : DEFAULTS.rateLimitWindow;

  const rateLimitRedis =
    redis && rateLimit
      ? await confirm({
          message: 'Use Redis for RateLimit storage?',
          default: false,
        })
      : false;

  const packageManager = await select<PackageManager>({
    message: `${chalk.magenta('⚙')} Package manager:`,
    choices: [
      { name: 'npm', value: 'npm' },
      { name: 'Yarn', value: 'yarn' },
      { name: 'pnpm', value: 'pnpm' },
    ],
    default: 'npm',
  });

  return {
    folderName,
    projectName,
    database,
    ...databaseAnswers,
    socketio,
    redis,
    rateLimit,
    rateLimitMax,
    rateLimitWindow,
    rateLimitRedis,
    packageManager,
    installNow: await confirm({
      message: `${chalk.green('⚡')} Install dependencies now?`,
      default: true,
    }),
  };
}

/**
 * Quotes dotenv values to preserve special characters.
 *
 * Double quotes and backslashes are escaped, and newlines
 * are represented as escape sequences.
 */
function escapeEnv(value: string): string {
  return `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\r/g, '\\r').replace(/\n/g, '\\n')}"`;
}

/**
 * Generates .env or .env.example.
 */
function buildEnv(answers: Answers, example: boolean): string {
  validateIntegrations(answers);
  const secret = (name: string) => (example ? `your_${name.toLowerCase()}` : crypto.randomBytes(64).toString('hex'));

  const value = (input: string) => escapeEnv(example ? '' : input);

  return [
    '# Server',
    `PORT=${DEFAULTS.port}`,
    `HOST=${DEFAULTS.host}`,
    'PREFIX_API=/',
    '',
    '# Rate limiting',
    `RATE_LIMIT_ENABLED=${answers.rateLimit}`,
    `RATE_LIMIT_MAX=${answers.rateLimitMax}`,
    `RATE_LIMIT_WINDOW=${answers.rateLimitWindow}`,
    `RATE_LIMIT_REDIS=${answers.rateLimitRedis}`,
    `RATE_LIMIT_NAME=${answers.projectName}:global`,
    '',
    ...(answers.redis ? ['# Redis', 'REDIS_HOST=localhost', 'REDIS_PORT=6379', 'REDIS_PASSWORD=', 'REDIS_PREFIX=', ''] : []),
    '# Database',
    `DB=${answers.database ? 'true' : 'false'}`,
    `DB_HOST=${value(answers.dbHost)}`,
    `DB_PORT=${value(answers.dbPort)}`,
    `DB_NAME=${value(answers.dbName)}`,
    `DB_USER=${value(answers.dbUser)}`,
    `DB_PASS=${value(answers.dbPass)}`,
    `DB_DIALECT=${answers.dbType}`,
    '',
    '# Secrets',
    `SECRET_KEY=${secret('SECRET_KEY')}`,
    `SECRET_SALT=${secret('SECRET_SALT')}`,
    `JWT_SECRET_KEY=${secret('JWT_SECRET_KEY')}`,
    '',
  ].join('\n');
}

async function removeIfPresent(filePath: string): Promise<void> {
  await fs.rm(filePath, {
    recursive: true,
    force: true,
  });
}

/**
 * Configures optional integrations in the generated main.ts.
 */
async function configureMainFile(targetDir: string, answers: Answers): Promise<void> {
  const mainPath = path.join(targetDir, 'src', 'main.ts');

  let content = await fs.readFile(mainPath, 'utf8');

  const socketConfiguration = answers.socketio
    ? `socket: {
      cors: {
        origin: '*',
      },
    },`
    : 'socket: false,';

  const pattern = /socket:\s*(?:false|\{[\s\S]*?\n\s*\}),/;

  if (!pattern.test(content)) {
    throw new Error('Socket.IO configuration was not found in src/main.ts.');
  }

  content = content.replace(pattern, socketConfiguration);

  if (!/rateLimit:\s*\{/.test(content)) {
    throw new Error('RateLimit configuration was not found in src/main.ts. Use the updated Flutry starter template.');
  }

  if (answers.redis) {
    content = configureRedis(content);
  }

  await fs.writeFile(mainPath, content, 'utf8');
}

/** Keeps optional Redis ownership in the existing startup and shutdown paths. */
function configureRedis(content: string): string {
  const importPattern = /^(import \{ HttpServer \} from '@flutry\/server';)\r?$/m;
  const startupPattern = /^([ \t]*)await server\.listen\(/m;
  const shutdownPattern = /^([ \t]*)await database\?\.close\(\);\r?$/m;

  if (!importPattern.test(content) || !startupPattern.test(content) || !shutdownPattern.test(content)) {
    throw new Error('Redis startup/shutdown integration points were not found in src/main.ts.');
  }

  return content
    .replace(importPattern, "$1\nimport { redis } from '@flutry/redis';")
    .replace(startupPattern, (_match, indent: string) => `${indent}await redis.connect();\n\n${indent}await server.listen(`)
    .replace(shutdownPattern, (_match, indent: string) =>
      [`${indent}try {`, `${indent}  await database?.close();`, `${indent}} finally {`, `${indent}  await redis.disconnect();`, `${indent}}`].join(
        '\n',
      ),
    );
}

/**
 * Generates the Socket.IO utility when enabled.
 */
async function configureSocketUtils(targetDir: string, socketio: boolean): Promise<void> {
  if (!socketio) {
    return;
  }

  const socketDirectory = path.join(targetDir, 'src', 'utils', 'socket');

  await fs.mkdir(socketDirectory, { recursive: true });

  const socketContent = `import { logger } from '@flutry/common';
import { getSocket } from '@flutry/server';

const io = getSocket();

io.on('connection', (socket: any) => {
  logger.info('Connect ' + socket.id);

  socket.on('disconnect', () => {
    logger.info('Disconnect ' + socket.id);
  });
});
`;

  await fs.writeFile(path.join(socketDirectory, 'index.ts'), socketContent, 'utf8');
}

/**
 * Applies project settings to a private staging directory.
 */
async function configureProject(directory: string, answers: Answers): Promise<void> {
  validateIntegrations(answers);
  const packageJsonPath = path.join(directory, 'package.json');

  const packageJson = JSON.parse(await fs.readFile(packageJsonPath, 'utf8')) as {
    name?: string;
    dependencies?: Record<string, unknown>;
    devDependencies?: Record<string, unknown>;
    optionalDependencies?: Record<string, unknown>;
  };

  packageJson.name = answers.projectName;

  // Redis is a runtime dependency only when explicitly selected.
  for (const dependencies of [packageJson.dependencies, packageJson.devDependencies, packageJson.optionalDependencies]) {
    if (dependencies) delete dependencies['@flutry/redis'];
  }

  if (answers.redis) {
    packageJson.dependencies ??= {};
    packageJson.dependencies['@flutry/redis'] = 'latest';
  }

  await fs.writeFile(packageJsonPath, `${JSON.stringify(packageJson, null, 2)}\n`, 'utf8');

  await configureMainFile(directory, answers);
  await configureSocketUtils(directory, answers.socketio);

  await Promise.all([
    fs.writeFile(path.join(directory, '.env'), buildEnv(answers, false), { encoding: 'utf8', mode: 0o600 }),
    fs.writeFile(path.join(directory, '.env.example'), buildEnv(answers, true), 'utf8'),
    removeIfPresent(path.join(directory, '.gitattributes')),
    removeIfPresent(path.join(directory, 'assets')),
  ]);

  await fs.writeFile(path.join(directory, 'README.md'), `# ${answers.folderName}\n\nGenerated by Flutry CLI.\n`, 'utf8');
}

/**
 * Creates a project without cloning directly into the
 * user's destination directory.
 */
async function createProject(answers: Answers): Promise<string> {
  const targetDir = path.resolve(process.cwd(), answers.folderName);

  const spinner = ora({
    text: chalk.cyan('Creating project'),
    spinner: 'dots12',
    color: 'cyan',
  }).start();

  let stagingDir: string | null = null;
  let ownsTarget = false;
  let published = false;

  try {
    /**
     * Prepare the project outside the destination.
     * Only this process owns the staging directory.
     */
    stagingDir = await fs.mkdtemp(path.join(os.tmpdir(), 'flutry-cli-'));

    const templateDir = path.join(stagingDir, 'project');

    spinner.text = chalk.blue('Downloading project template');

    await degit('https://github.com/Flutry-HQ/flutry.git', {
      cache: false,
      force: false,
    }).clone(templateDir);

    spinner.text = chalk.magenta('Applying project settings');

    await configureProject(templateDir, answers);

    spinner.text = chalk.cyan('Publishing project');

    /**
     * Atomically reserve the destination.
     *
     * mkdir() fails with EEXIST when another process
     * already owns or created the directory.
     */
    try {
      await fs.mkdir(targetDir);
      ownsTarget = true;
    } catch (error) {
      if (error instanceof Error && 'code' in error && error.code === 'EEXIST') {
        throw new Error(`Folder "${answers.folderName}" already exists.`);
      }

      throw error;
    }

    /**
     * Copy into the directory reserved by this process.
     * The source directory is exclusively owned by this run.
     */
    const entries = await fs.readdir(templateDir);

    for (const entry of entries) {
      await fs.cp(path.join(templateDir, entry), path.join(targetDir, entry), {
        recursive: true,
        force: false,
        errorOnExist: true,
      });
    }

    published = true;

    spinner.succeed(chalk.greenBright('Project created successfully'));

    return targetDir;
  } catch (error) {
    spinner.fail(chalk.red('Project creation failed'));

    /**
     * Remove the destination only when this process
     * successfully reserved it and publication failed.
     */
    if (ownsTarget && !published) {
      try {
        await removeIfPresent(targetDir);
      } catch (cleanupError) {
        console.error(chalk.yellow(`Could not clean up incomplete project: ${targetDir}`), cleanupError);
      }
    }

    throw error;
  } finally {
    if (stagingDir) {
      try {
        await removeIfPresent(stagingDir);
      } catch (cleanupError) {
        console.error(chalk.yellow(`Could not remove temporary directory: ${stagingDir}`), cleanupError);
      }
    }
  }
}

/**
 * Installs project dependencies.
 */
async function installPackages(targetDir: string, packageManager: PackageManager): Promise<void> {
  const spinner = ora({
    text: chalk.yellow(`Installing dependencies with ${packageManager}`),
    spinner: 'arc',
    color: 'yellow',
  }).start();

  try {
    await new Promise<void>((resolve, reject) => {
      const executable = process.platform === 'win32' ? `${packageManager}.cmd` : packageManager;

      const command = process.platform === 'win32' ? (process.env.ComSpec ?? 'cmd.exe') : executable;

      const commandArgs = process.platform === 'win32' ? ['/d', '/s', '/c', executable, 'install'] : ['install'];

      const child = spawn(command, commandArgs, {
        cwd: targetDir,
        stdio: ['ignore', 'ignore', 'pipe'],
      });

      let errorOutput = '';

      child.stderr.on('data', (data: Buffer) => {
        errorOutput += data.toString();
      });

      child.once('error', reject);

      child.once('close', (code) => {
        if (code === 0) {
          resolve();
        } else {
          reject(new Error(`${packageManager} install failed${errorOutput ? `: ${errorOutput.trim()}` : ''}`));
        }
      });
    });

    spinner.succeed(chalk.greenBright('Dependencies installed'));
  } catch (error) {
    spinner.fail(chalk.red('Dependency installation failed'));
    throw error;
  }
}

/**
 * Validates the destination folder name.
 */
function validateFolderName(value: string): boolean {
  return (
    value.trim().length > 0 &&
    value === value.trim() &&
    value !== '.' &&
    value !== '..' &&
    !/[\\/]/.test(value) &&
    !/[<>:"|?*\x00-\x1f]/.test(value) &&
    !/[. ]$/.test(value)
  );
}

function validatePort(value: string): true | string {
  return /^\d{1,5}$/.test(value) && Number(value) > 0 && Number(value) <= 65535 ? true : 'Enter a valid port (1-65535).';
}

function validatePositiveInteger(value: string): true | string {
  return /^\d+$/.test(value) && Number.isSafeInteger(Number(value)) && Number(value) > 0 ? true : 'Enter a positive safe integer.';
}

function validateWindow(value: string): true | string {
  const valid = validatePositiveInteger(value);
  if (valid !== true) return valid;
  return Number.isSafeInteger(Number(value) * 1000) ? true : 'The window must be safely representable in milliseconds.';
}

function validateIntegrations(answers: Answers): void {
  for (const name of ['redis', 'rateLimit', 'rateLimitRedis'] as const) {
    if (typeof answers[name] !== 'boolean') throw new TypeError(`${name} must be a boolean`);
  }

  if (!Number.isSafeInteger(answers.rateLimitMax) || answers.rateLimitMax <= 0) {
    throw new RangeError('RateLimit maximum must be a positive safe integer');
  }

  if (!Number.isSafeInteger(answers.rateLimitWindow) || answers.rateLimitWindow <= 0 || !Number.isSafeInteger(answers.rateLimitWindow * 1000)) {
    throw new RangeError('RateLimit window must be a positive integer safely representable in milliseconds');
  }

  if (answers.rateLimitRedis && (!answers.redis || !answers.rateLimit)) {
    throw new Error('Redis-backed RateLimit requires both Redis and RateLimit integration');
  }
}

function validatePackageName(name: string): true | string {
  return /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(name) ? true : 'Use lowercase letters, numbers and hyphens only.';
}

/**
 * Flutry CLI new-project command.
 */
export default async function newCommand(): Promise<void> {
  try {
    const answers = await promptQuestions();

    const targetDir = await createProject(answers);

    if (answers.installNow) {
      await installPackages(targetDir, answers.packageManager);
    }

    console.log(`\n${chalk.greenBright('╭─')} ${chalk.bold.green('✓ Project ready')} ${chalk.greenBright('─'.repeat(19))}`);

    console.log(`${chalk.greenBright('│')} ${chalk.gray('Location:')} ${chalk.cyan(`./${answers.folderName}`)}`);

    console.log(`${chalk.greenBright('│')} ${chalk.gray('Next:')}`);

    console.log(`${chalk.greenBright('│')}   ${chalk.cyan(`cd ${answers.folderName}`)}`);

    if (!answers.installNow) {
      console.log(`${chalk.greenBright('│')}   ${chalk.yellow(`${answers.packageManager} install`)}`);
    }

    console.log(`${chalk.greenBright('│')}   ${chalk.green(`${answers.packageManager} dev`)}`);

    console.log(`${chalk.greenBright('╰────────────────────────────────────')}\n`);
  } catch (error) {
    console.error(`\n${chalk.redBright('✖')} ${error instanceof Error ? error.message : 'Command failed.'}`);

    process.exitCode = 1;
  }
}
