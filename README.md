# foreign-exchange-bc
**EXPERIMENTAL** vNext Foreign Exchange Management Bounded Context

## Usage

### Install NVM - Node version manager

More information on how to install NVM: https://github.com/nvm-sh/nvm

#### Use NVM to install the correct Node.js version

```bash
# (In the repository root directory - one having the .nvmrc file)
nvm install
nvm use
```

### Install Dependencies

All commands below assume you're positioned at the root of the monorepo.

```bash
npm install
```

### Build

```bash
npm run build
```

### Run

```bash
npm run start
```

### Unit Tests

```bash
npm run test:unit
```

### Integration Tests

```bash
npm run test:integration
```

### Execute locally the pre-commit checks - these will be executed with every commit and in the default CI/CD pipeline
Make sure these pass before committing any code

```bash
npm run pre_commit_check
```

