import { promises as fs } from 'fs';
import path from 'path';
import chalk from 'chalk';
import ora from 'ora';

type GenerateType = 'route' | 'model';

type NormalizedName = {
  fileName: string;
  className: string;
};

function normalizeName(name: string): NormalizedName {
  const fileName = name.trim().toLowerCase();

  if (!/^[a-z][a-z0-9_-]*$/.test(fileName)) {
    throw new Error('Name must contain lowercase letters, numbers, underscores, or hyphens and start with a letter.');
  }

  const className = fileName
    .split(/[-_]/)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join('');

  return { fileName, className };
}

function routeTemplate(className: string, fileName: string): string {
  return [
    "import { Router } from '@flutry/server';",
    '',
    `export default class ${className}Route extends Router {`,
    '  constructor() {',
    '    super();',
    `    //! [GET] /${fileName} || Responsed OK`,
    "    this.get('/', async (ctx) => {",
    "      return ctx.send({ message: 'Ok' });",
    '    });',
    '  }',
    '}',
    '',
  ].join('\n');
}

function serviceTemplate(className: string): string {
  return `export default class ${className}Service {}\n`;
}

function modelTemplate(className: string, fileName: string): string {
  return [
    "import { Model, DataTypes, Sequelize } from '@flutry/database-sequlize';",
    '',
    `export type ${className}ModelType = {`,
    '  id: string;',
    '  message: string;',
    '};',
    '',
    `export default class ${className} extends Model {`,
    '  static initialize(sequelize: Sequelize) {',
    `    ${className}.init(`,
    '      {',
    '        id: {',
    '          type: DataTypes.STRING,',
    '          primaryKey: true,',
    '        },',
    '        message: {',
    '          type: DataTypes.STRING,',
    '          allowNull: false,',
    '        },',
    '      },',
    '      {',
    '        sequelize,',
    `        tableName: '${fileName}',`,
    '        timestamps: false,',
    '        indexes: [',
    '          {',
    '            unique: true,',
    "            fields: ['message'],",
    '          },',
    '        ],',
    '      },',
    '    );',
    '  }',
    '}',
    '',
  ].join('\n');
}

async function writeNewFile(filePath: string, content: string): Promise<void> {
  try {
    await fs.access(filePath);
    throw new Error(`File already exists: ${path.relative(process.cwd(), filePath)}`);
  } catch (error) {
    if (error instanceof Error && error.message.startsWith('File already exists:')) throw error;
  }

  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, content, 'utf8');
}

async function generate(type: GenerateType, name: string): Promise<void> {
  const projectRoot = process.cwd();

  const { fileName, className } = normalizeName(name);
  const sourceRoot = path.join(projectRoot, 'src');
  const spinner = ora({
    text: type === 'route' ? chalk.cyan(`Generating route ${fileName}`) : chalk.magenta(`Generating model ${fileName}`),
    spinner: 'dots12',
    color: type === 'route' ? 'cyan' : 'magenta',
  }).start();

  try {
    if (type === 'route') {
      const routeDirectory = path.join(sourceRoot, 'routes', fileName);
      spinner.text = chalk.cyan(`Creating ${fileName}.route.ts`);
      await writeNewFile(path.join(routeDirectory, `${fileName}.route.ts`), routeTemplate(className, fileName));
      spinner.text = chalk.blue(`Creating ${fileName}.service.ts`);
      await writeNewFile(path.join(routeDirectory, `${fileName}.service.ts`), serviceTemplate(className));
      spinner.succeed(chalk.greenBright(`✦ Route generated: src/routes/${fileName}/`));
      return;
    }

    spinner.text = chalk.magenta(`Creating ${fileName}.model.ts`);
    await writeNewFile(path.join(sourceRoot, 'models', `${fileName}.model.ts`), modelTemplate(className, fileName));
    spinner.succeed(chalk.greenBright(`✦ Model generated: src/models/${fileName}.model.ts`));
  } catch (error) {
    spinner.fail(chalk.red(`Could not generate ${type} ${fileName}`));
    throw error;
  }
}

export async function generateRoute(name: string): Promise<void> {
  try {
    await generate('route', name);
  } catch (error) {
    console.error(`${chalk.redBright('✖')} ${error instanceof Error ? error.message : 'Route generation failed.'}`);
    process.exitCode = 1;
  }
}

export async function generateModel(name: string): Promise<void> {
  try {
    await generate('model', name);
  } catch (error) {
    console.error(`${chalk.redBright('✖')} ${error instanceof Error ? error.message : 'Model generation failed.'}`);
    process.exitCode = 1;
  }
}
