# Task Brainstorm & Plan: New Project Configuration Blueprint

## 1. Brainstorming

### Goal

Prepare a comprehensive plan and set of configuration templates for starting a new project that shares the exact same configuration as the current `portfolio-bento` project (Vite, React 18, TypeScript, Chakra UI v2, Vitest, Playwright, ESLint v9, and Prettier).

### Constraints

- Must match the exact dependencies and versions where appropriate to prevent peer dependency conflicts (e.g., React 18 + Chakra UI v2).
- Must include the linting, formatting, and testing configurations (Vitest + JSDOM, Playwright).
- Output must be structured clearly so the user can easily replicate it for a new project.

### Risks

- **Dependency incompatibility**: React 18 and Chakra UI v2 must match exactly to avoid compatibility issues.

### Acceptance Criteria

- A step-by-step plan detailing commands to run to scaffold the new project.
- Complete copy-pasteable configuration files (`package.json`, `vite.config.ts`, `vitest.config.ts`, `eslint.config.js`, `.prettierrc`, and tsconfigs).
- Clear instructions on verification of the configuration (linting, formatting, testing, and building).

---

## 2. Step-by-Step Implementation Plan

### Phase 1: Project Scaffolding

1. Commands to initialize a new Vite project with React + TypeScript.
2. Replacing the default `package.json` dependencies with the exact versions from the source repository.
3. Steps to run the initial package installation.

### Phase 2: Configuration Templates

1. Copy-paste templates for:
   - `eslint.config.js` (ESLint v9 flat config structure matching the source config)
   - `.prettierrc`
   - `vite.config.ts`
   - `vitest.config.ts` (Vitest + JSDOM testing configuration)
   - `tsconfig.json` & `tsconfig.node.json`
2. Setting up standard entry point structures (`src/test/setup.ts`, etc.) to satisfy testing imports.

### Phase 3: Verification Checklist

1. Running linting (`npm run lint`).
2. Running formatting checks (`npm run format`).
3. Running test suite (`npm run test`).
4. Running the production build (`npm run build`).

---

## 3. Verification Plan

- **Dependency Match**: Cross-reference the proposed dependencies in the configuration blueprint with `j:\Scraper\package.json`.
- **Config Syntactic Validation**: Ensure the ESLint v9 configuration syntax and TypeScript configurations are valid.
