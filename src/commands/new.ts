import crypto from 'crypto';
import { promises as fs } from 'fs';
import path from 'path';
import { spawn } from 'child_process';
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
  packageManager: PackageManager;
  installNow: boolean;
};

const DEFAULTS = {
  port: '1337',
  host: '0.0.0.0',
  dbPort: '3306',
  dbType: 'mariadb' as const,
};

export async function promptQuestions(): Promise<Answers> {
  console.log(`\n${chalk.cyanBright('╭────────────────────────────────────╮')}`);

  console.log(`${chalk.cyanBright('│')} ${chalk.bold.white('✦ FLUTRY')} ${chalk.gray('project generator')} ${chalk.cyanBright('│')}`);

  console.log(`${chalk.cyanBright('╰────────────────────────────────────╯')}`);

  console.log(chalk.gray('  Create a clean project with a few focused choices.\n'));

  const folderName = await input({
    message: `${chalk.cyan('📁')} Project folder:`,

    validate: (value) => validateFolderName(value) || 'Enter a folder name without / or \\.',
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
            {
              name: 'MariaDB',
              value: 'mariadb' as const,
            },
            {
              name: 'MySQL',
              value: 'mysql' as const,
            },
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

  const packageManager = await select<PackageManager>({
    message: `${chalk.magenta('⚙')} Package manager:`,

    choices: [
      {
        name: 'npm',
        value: 'npm' as const,
      },
      {
        name: 'Yarn',
        value: 'yarn' as const,
      },
      {
        name: 'pnpm',
        value: 'pnpm' as const,
      },
    ],

    default: 'npm',
  });

  return {
    folderName,
    projectName,
    database,
    ...databaseAnswers,
    socketio,
    packageManager,

    installNow: await confirm({
      message: `${chalk.green('⚡')} Install dependencies now?`,

      default: true,
    }),
  };
}

function buildEnv(answers: Answers, example: boolean): string {
  const secret = (name: string) => (example ? `your_${name.toLowerCase()}` : crypto.randomBytes(64).toString('hex'));

  return [
    '# Server',
    `PORT=${DEFAULTS.port}`,
    `HOST=${DEFAULTS.host}`,
    'PREFIX_API=/',

    '# Database',
    `DB=${answers.database ? 'true' : 'false'}`,
    `DB_HOST=${example ? '' : answers.dbHost}`,
    `DB_PORT=${example ? '' : answers.dbPort}`,
    `DB_NAME=${example ? '' : answers.dbName}`,
    `DB_USER=${example ? '' : answers.dbUser}`,
    `DB_PASS=${example ? '' : answers.dbPass}`,
    `DB_DIALECT=${answers.dbType}`,

    '# Secrets',
    `SECRET_KEY=${secret('SECRET_KEY')}`,
    `SECRET_SALT=${secret('SECRET_SALT')}`,
    `JWT_SECRET_KEY=${secret('JWT_SECRET_KEY')}`,
  ].join('\n');
}

async function removeIfPresent(filePath: string): Promise<void> {
  await fs.rm(filePath, {
    recursive: true,
    force: true,
  });
}

/**
 * Configures the generated main.ts file based
 * on the Socket.IO selection.
 */
async function configureMainFile(targetDir: string, socketio: boolean): Promise<void> {
  const mainPath = path.join(targetDir, 'src', 'main.ts');

  if (!(await exists(mainPath))) {
    throw new Error('src/main.ts was not found in the downloaded template.');
  }

  let content = await fs.readFile(mainPath, 'utf8');

  const socketConfiguration = socketio
    ? `socket: {
      cors: {
        origin: '*',
      },
    },`
    : `socket: false,`;

  content = content.replace(/socket:\s*(?:false|\{[\s\S]*?\n\s*\}),/, socketConfiguration);

  await fs.writeFile(mainPath, content, 'utf8');
}

/**
 * Creates the Socket.IO utility used by the generated
 * application.
 *
 * The utility is only generated when Socket.IO is enabled.
 *
 * Generated structure:
 *
 * src/
 * └── utils/
 *     └── socket/
 *         └── index.ts
 */
async function configureSocketUtils(targetDir: string, socketio: boolean): Promise<void> {
  /**
   * Socket.IO was not enabled, therefore no utility
   * files should be generated.
   */
  if (!socketio) {
    return;
  }

  const socketDirectory = path.join(targetDir, 'src', 'utils', 'socket');

  const socketFile = path.join(socketDirectory, 'index.ts');

  /**
   * Make sure the complete utils/socket directory
   * structure exists.
   */
  await fs.mkdir(socketDirectory, {
    recursive: true,
  });

  /**
   * Generate the Socket.IO connection handler.
   *
   * getSocket() returns the Socket.IO instance that was
   * already initialized by HttpServer.
   */
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

  await fs.writeFile(socketFile, socketContent, 'utf8');
}

async function createProject(answers: Answers): Promise<string> {
  const targetDir = path.resolve(process.cwd(), answers.folderName);

  const spinner = ora({
    text: chalk.cyan('Creating project'),
    spinner: 'dots12',
    color: 'cyan',
  }).start();

  try {
    if (await exists(targetDir)) {
      throw new Error(`Folder "${answers.folderName}" already exists.`);
    }

    spinner.text = chalk.blue('Downloading project template');

    await degit('https://github.com/Flutry-HQ/flutry.git', {
      cache: false,
      force: true,
    }).clone(targetDir);

    spinner.text = chalk.magenta('Applying project settings');

    const packageJsonPath = path.join(targetDir, 'package.json');

    const packageJson = JSON.parse(await fs.readFile(packageJsonPath, 'utf8')) as {
      name?: string;
      dependencies?: Record<string, unknown>;
    };

    packageJson.name = answers.projectName;

    await fs.writeFile(packageJsonPath, `${JSON.stringify(packageJson, null, 2)}\n`, 'utf8');

    /**
     * Configure the HttpServer Socket.IO option.
     */
    await configureMainFile(targetDir, answers.socketio);

    /**
     * Generate the Socket.IO utility only
     * when Socket.IO is enabled.
     */
    await configureSocketUtils(targetDir, answers.socketio);

    await Promise.all([
      fs.writeFile(path.join(targetDir, '.env'), buildEnv(answers, false), 'utf8'),

      fs.writeFile(path.join(targetDir, '.env.example'), buildEnv(answers, true), 'utf8'),

      removeIfPresent(path.join(targetDir, '.gitattributes')),

      removeIfPresent(path.join(targetDir, 'assets')),
    ]);

    await fs.writeFile(path.join(targetDir, 'README.md'), `# ${answers.folderName}\n\nGenerated by Flutry CLI.\n`, 'utf8');

    spinner.succeed(chalk.greenBright('Project created successfully'));

    return targetDir;
  } catch (error) {
    spinner.fail(chalk.red('Project creation failed'));

    await removeIfPresent(targetDir);

    throw error;
  }
}

async function installPackages(targetDir: string, packageManager: PackageManager): Promise<void> {
  const spinner = ora({
    text: chalk.yellow(`Installing dependencies with ${packageManager}`),
    spinner: 'arc',
    color: 'yellow',
  }).start();

  await new Promise<void>((resolve, reject) => {
    const executable = process.platform === 'win32' ? `${packageManager}.cmd` : packageManager;

    const command = process.platform === 'win32' ? (process.env.ComSpec ?? 'cmd.exe') : executable;

    const commandArgs = process.platform === 'win32' ? ['/d', '/s', '/c', executable, 'install'] : ['install'];

    const child = spawn(command, commandArgs, {
      cwd: targetDir,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let errorOutput = '';

    child.stderr.on('data', (data: Buffer) => {
      errorOutput += data.toString();
    });

    child.on('error', reject);

    child.on('close', (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`${packageManager} install failed${errorOutput ? `: ${errorOutput.trim()}` : ''}`));
      }
    });
  });

  spinner.succeed(chalk.greenBright('Dependencies installed'));
}

async function exists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);

    return true;
  } catch {
    return false;
  }
}

function validateFolderName(value: string): boolean {
  return value.trim().length > 0 && value !== '.' && value !== '..' && !/[\\/]/.test(value);
}

function validatePort(value: string): true | string {
  return /^\d{1,5}$/.test(value) && Number(value) > 0 && Number(value) <= 65535 ? true : 'Enter a valid port (1-65535).';
}

function validatePackageName(name: string): true | string {
  return /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(name) ? true : 'Use lowercase letters, numbers and hyphens only.';
}

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
