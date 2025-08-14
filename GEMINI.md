# Project Setup Guidelines

This document outlines the setup and operational guidelines for the `crypto` project.

## Project Details
- **Name:** `crypto`
- **Version:** `1.0.0`
- **Description:** (No description provided in package.json)

## Technologies
This project is developed using **TypeScript**.

## Dependencies
This project uses the following key dependencies:
- `chalk`: ^5.5.0 (for terminal styling)
- `cli-table3`: ^0.6.5 (for creating command-line tables)
- `ws`: ^8.18.3 (for WebSocket communication)

### Development Dependencies
- `typescript`: ^5.9.2 (TypeScript compiler)
- `@types/ws`: ^8.18.1 (Type definitions for WebSocket)
- `@types/chalk`: ^2.2.4 (Type definitions for Chalk - *deprecated, but included for completeness*)

## Setup Instructions

### 1. Install Dependencies
This project uses `pnpm` as its package manager. To install the required dependencies, navigate to the project root directory and run:
```bash
pnpm install
```

### 2. Build the Application
Before running, the TypeScript code needs to be compiled into JavaScript.
```bash
pnpm build
```
This will generate JavaScript files in the `dist` directory.

### 3. Running the Application
The main entry point for this application is the compiled `dist/index.js`. You can run it using Node.js:
```bash
node dist/index.js
```

## Development Guidelines
- All work should be based on the current directory.
- Adhere to existing code conventions and style.
- Ensure TypeScript compilation (`pnpm build`) passes without errors before committing changes.

## Communication Guidelines
- **Explanation Language:** All future explanations and communication from the agent will be in Korean.