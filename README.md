<p align="center">
  <img
    src="https://raw.githubusercontent.com/Flutry-HQ/cli/main/assets/logo.png"
    alt="Flutry CLI logo"
    width="180"
  />
</p>

# Flutry CLI

A small, reliable command-line tool for creating and extending Flutry projects.

## Features

- Interactive Flutry project creation
- Secure `.env` secret generation
- Optional database configuration with MySQL or MariaDB
- Optional Redis integration and global RateLimit configuration
- Route and service generation
- Sequelize model generation
- npm, Yarn, and pnpm support
- Animated and colored terminal feedback
- Protection against overwriting existing files

## Installation

Install the package globally:

```bash
npm install -g @flutry/cli
```

Or run it directly using `npx`:

```bash
npx @flutry/cli new
```

## Create a Project

Start the interactive project generator:

```bash
flutry new
```

The generator asks for:

- Project folder and package name
- Database activation and connection settings
- Socket.IO activation
- Redis integration (default: no)
- Global RateLimit (default: no), its quota and window, and optional Redis storage
- Package manager
- Dependency installation

After creation, the project includes `.env` and `.env.example` files.

### Redis and RateLimit choices

After the existing database and Socket.IO questions, the generator asks:

1. `Enable Redis integration?` — defaults to false.
2. `Enable global RateLimit?` — defaults to false.
3. If RateLimit is enabled: `Maximum requests per window?` (100), followed by
   `Time window in seconds?` (60). Both must be positive safe integers; the window
   must also be safely representable in milliseconds.
4. Only if both integrations are enabled: `Use Redis for RateLimit storage?` —
   defaults to false.

| Redis | RateLimit | Redis storage | Generated behavior |
| --- | --- | --- | --- |
| No | No | Not asked | Neither integration runs |
| No | Yes | Not asked | Memory-based RateLimit |
| Yes | No | Not asked | Redis connects at startup and closes at shutdown |
| Yes | Yes | No | Redis integration plus memory-based RateLimit |
| Yes | Yes | Yes | Redis integration plus distributed RateLimit |

Redis selection adds `@flutry/redis` to runtime dependencies. The selected package
manager installs it with the other dependencies, either immediately or when you
later run install. Unselected Redis is neither installed nor imported by main.ts.
There is no `REDIS=true/false` environment flag.

Redis-enabled projects include `REDIS_HOST=localhost`, `REDIS_PORT=6379`, empty
`REDIS_PASSWORD`, and empty `REDIS_PREFIX`. Set credentials before deployment.
RateLimit settings are retained in both environment files, using the chosen
quota/window and a stable application-specific `RATE_LIMIT_NAME`. Disabled limits
use `RATE_LIMIT_ENABLED=false`; unselected Redis storage uses
`RATE_LIMIT_REDIS=false`. Redis startup errors prevent HTTP startup; explicitly
selected Redis storage never falls back to memory.

## Generate a Route

Run this command from the root of an existing Flutry project:

```bash
flutry generate route user
```

This creates:

```text
src/routes/user/user.route.ts
src/routes/user/user.service.ts
```

The generated route includes a basic `GET /user` endpoint that returns an `Ok` response.

## Generate a Model

Create a Sequelize model using:

```bash
flutry generate model user
```

This creates:

```text
src/models/user.model.ts
```

The generated model contains:

- An `id` field
- A required, unique `message` field
- A Sequelize model initializer

## Short Alias

The `generate` command also supports the `g` alias:

```bash
flutry g route user
flutry g model user
```

Run generators from the root of an existing Flutry project. They use the current
working directory and check for existing target files; they do not validate the
project's identity. Coordinate concurrent generation because the file check and
write are separate operations.

## Environment Configuration

The project generator creates an environment configuration template:

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
DB_DIALECT=mariadb

SECRET_KEY=
SECRET_SALT=
JWT_SECRET_KEY=
```

The generated `.env` file contains securely generated application secrets.

The `.env.example` file serves as a configuration template and does not contain real database credentials or generated secrets.

### Environment Files

| File           | Purpose                                                    |
| -------------- | ---------------------------------------------------------- |
| `.env`         | Local application configuration and generated secrets      |
| `.env.example` | Example environment configuration without sensitive values |

Do not commit your `.env` file to version control.

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
├── commands/
│   ├── generate.ts
│   └── new.ts
├── types/
│   └── degit.d.ts
└── index.ts
```

## License

MIT
