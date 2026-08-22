<p align="center">
  <img src="https://raw.githubusercontent.com/Flutry-HQ/cli/main/assets/logo.png" alt="Flurty CLI logo" width="180">
</p>

# Flurty CLI

A small, reliable command-line tool for creating and extending Flutry projects.

## Features

- Interactive Flutry project creation
- Secure `.env` secret generation
- Optional database configuration with MySQL or MariaDB
- Route and service generation
- Sequelize model generation
- npm, Yarn, and pnpm support
- Animated and colored terminal feedback
- Safe protection against overwriting existing files

## Installation

Install the package globally:

```bash
npm install -g @flutry/cli
```

Or run it directly with `npx`:

```bash
npx @flutry/cli new
```

## Create A Project

Start the interactive project generator:

```bash
flurty new
```

The generator asks for:

- Project folder and package name
- Database activation and connection settings
- Package manager
- Dependency installation

After creation, the project includes `.env` and `.env.example` files.

## Generate A Route

Run this command from the root of an existing Flutry project:

```bash
flurty generate route user
```

This creates:

```text
src/routes/user/user.route.ts
src/routes/user/user.service.ts
```

The generated route includes a basic `GET /user` endpoint that returns an `Ok` response.

## Generate A Model

Create a Sequelize model with:

```bash
flurty generate model user
```

This creates:

```text
src/models/user.model.ts
```

The generated model contains an `id` field, a required unique `message` field, and a Sequelize initializer.

## Short Alias

The `generate` command also has a short `g` alias:

```bash
flurty g route user
flurty g model user
```

Generators only run inside a Flutry project. They check for `package.json` and the Flutry router before creating files.

## Environment Configuration

The generator creates a complete environment template, including database values even when the database is initially disabled:

```env
PORT=1337
HOST=0.0.0.0
PREFIX_API=
DB=false
DB_NAME=
DB_USER=
DB_PASS=
DB_HOST=
DB_PORT=3306
DB_TYPE=mariadb
SECRET_KEY=
SECRET_SALT=
JWT_SECRET_KEY=
```

The real `.env` file receives generated secrets. The `.env.example` file never receives database credentials or generated secrets.

## Development

Install dependencies:

```bash
yarn install
```

Build the CLI:

```bash
yarn build
```

Run the compiled CLI:

```bash
yarn start
```

Watch TypeScript files during development:

```bash
yarn dev
```

## Project Structure

```text
src/
  commands/
    generate.ts
    new.ts
  types/
    degit.d.ts
  index.ts
```

## License

MIT
