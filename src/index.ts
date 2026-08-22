#!/usr/bin/env node
import { program } from 'commander';
import newCommand from './commands/new';
import { generateModel, generateRoute } from './commands/generate';

program.command('new').description('Create a new Flutry project').action(newCommand);

const generate = program.command('generate').alias('g').description('Generate a route or model');

generate.command('route <name>').description('Generate a route and service').action(generateRoute);
generate.command('model <name>').description('Generate a Sequelize model').action(generateModel);

program.parse(process.argv);
