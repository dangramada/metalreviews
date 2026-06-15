# New Project Configuration Blueprint Guide

This guide provides a comprehensive configuration template and setup instructions to bootstrap a new Vite + React 18 + TypeScript project with Chakra UI v2, ESLint v9, Prettier, Vitest, and Playwright, matching the configuration of the current project.

---

## Phase 1: Project Scaffolding

1. **Initialize the Vite App**:
   Create a new directory for your project and run:

   ```bash
   npm create vite@latest . -- --template react-ts
   ```

2. **Install Core Dependencies**:
   Install the correct React 18 and Chakra UI v2 packages (along with Emotion and Framer Motion for Chakra styling support):

   ```bash
   npm install react@18.2.0 react-dom@18.2.0 react-router-dom@7.8.0 @chakra-ui/react@2.8.2 @emotion/react@11.11.1 @emotion/styled@11.11.0 framer-motion@12.23.12 lucide-react@0.453.0 @vercel/analytics@1.6.1 @vercel/speed-insights@1.3.1
   ```

3. **Install Dev Dependencies**:
   Install Vite, TypeScript, testing utilities, Vitest, Playwright, and linting/formatting configs:
   ```bash
   npm install -D vite@5.4.15 typescript@5.9.3 @types/react@18.2.0 @types/react-dom@18.2.0 @vitejs/plugin-react@5.1.4 eslint@9.39.4 eslint-config-prettier@10.1.8 eslint-plugin-prettier@5.5.5 eslint-plugin-react-hooks@7.0.1 eslint-plugin-react-refresh@0.5.2 globals@15.12.0 prettier@3.8.1 vitest@4.0.18 jsdom@25.0.0 @testing-library/react@16.0.0 @testing-library/jest-dom@6.4.6 @playwright/test@1.58.1 @typescript-eslint/eslint-plugin@8.57.2 @typescript-eslint/parser@8.57.2 typescript-eslint@8.57.2 vite-plugin-webfont-dl@3.12.0
   ```

---

## Phase 2: Configuration Files

Replace/create the following configuration files in the root of the new project directory.

### 1. `package.json`

```json
{
  "name": "new-project",
  "private": true,
  "version": "1.0.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "test": "vitest",
    "test:watch": "vitest",
    "test:coverage": "vitest run --coverage",
    "lint": "eslint .",
    "lint:fix": "eslint . --fix",
    "format": "prettier --write .",
    "type-check": "tsc --noEmit"
  },
  "dependencies": {
    "@chakra-ui/react": "^2.8.2",
    "@emotion/react": "^11.11.1",
    "@emotion/styled": "^11.11.0",
    "@vercel/analytics": "^1.6.1",
    "@vercel/speed-insights": "^1.3.1",
    "framer-motion": "^12.23.12",
    "lucide-react": "^0.453.0",
    "react": "^18.2.0",
    "react-dom": "^18.2.0",
    "react-router-dom": "^7.8.0"
  },
  "devDependencies": {
    "@playwright/test": "^1.58.1",
    "@testing-library/jest-dom": "^6.4.6",
    "@testing-library/react": "^16.0.0",
    "@types/react": "18.2.0",
    "@types/react-dom": "18.2.0",
    "@typescript-eslint/eslint-plugin": "^8.57.2",
    "@typescript-eslint/parser": "^8.57.2",
    "@vitejs/plugin-react": "^5.1.4",
    "eslint": "^9.39.4",
    "eslint-config-prettier": "^10.1.8",
    "eslint-plugin-prettier": "^5.5.5",
    "eslint-plugin-react-hooks": "^7.0.1",
    "eslint-plugin-react-refresh": "^0.5.2",
    "globals": "15.12.0",
    "jsdom": "^25.0.0",
    "prettier": "^3.8.1",
    "typescript": "^5.9.3",
    "typescript-eslint": "^8.57.2",
    "vite": "^7.3.1",
    "vite-plugin-webfont-dl": "^3.12.0",
    "vitest": "^4.0.18"
  }
}
```

### 2. `vite.config.ts`

```typescript
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import WebfontDownload from 'vite-plugin-webfont-dl';

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), WebfontDownload()],
  base: './',
  server: {
    host: true,
  },
});
```

### 3. `vitest.config.ts`

```typescript
/// <reference types="vitest" />
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: './src/test/setup.ts',
    exclude: ['**/node_modules/**', '**/dist/**', '**/*.spec.ts'],
  },
});
```

### 4. `eslint.config.js`

```javascript
import js from '@eslint/js';
import globals from 'globals';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import tseslint from 'typescript-eslint';
import prettierPlugin from 'eslint-plugin-prettier';
import eslintConfigPrettier from 'eslint-config-prettier';

export default tseslint.config(
  { ignores: ['dist', 'node_modules', '.vercel'] },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
      prettier: prettierPlugin,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
      'prettier/prettier': 'error',
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
      'no-console': ['warn', { allow: ['warn', 'error'] }],
    },
  },
  eslintConfigPrettier
);
```

### 5. `.prettierrc`

```json
{
  "semi": true,
  "trailingComma": "es5",
  "singleQuote": true,
  "printWidth": 100,
  "tabWidth": 2,
  "useTabs": false,
  "endOfLine": "auto"
}
```

### 6. `tsconfig.json`

```json
{
  "files": [],
  "references": [
    {
      "path": "./tsconfig.app.json"
    },
    {
      "path": "./tsconfig.node.json"
    }
  ]
}
```

### 7. `tsconfig.node.json`

```json
{
  "compilerOptions": {
    "tsBuildInfoFile": "./node_modules/.tmp/tsconfig.node.tsbuildinfo",
    "target": "ES2022",
    "lib": ["ES2023"],
    "module": "ESNext",
    "skipLibCheck": true,
    "moduleResolution": "bundler",
    "allowImportingTsExtensions": true,
    "isolatedModules": true,
    "moduleDetection": "force",
    "noEmit": true,
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noFallthroughCasesInSwitch": true,
    "noUncheckedSideEffectImports": true
  },
  "include": ["vite.config.ts"]
}
```

### 8. `tsconfig.app.json`

```json
{
  "compilerOptions": {
    "tsBuildInfoFile": "./node_modules/.tmp/tsconfig.app.tsbuildinfo",
    "target": "ES2022",
    "useDefineForClassFields": true,
    "lib": ["DOM", "DOM.Iterable", "ES2022"],
    "module": "ESNext",
    "skipLibCheck": true,

    /* Bundler mode */
    "moduleResolution": "bundler",
    "allowImportingTsExtensions": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noEmit": true,
    "jsx": "react-jsx",

    /* Linting */
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noFallthroughCasesInSwitch": true,
    "noUncheckedSideEffectImports": true
  },
  "include": ["src"]
}
```

### 9. `src/test/setup.ts`

Create the folder `src/test/` and add the setup file `setup.ts`:

```typescript
import '@testing-library/jest-dom';
```

---

## Phase 3: Verification

Verify the setup step-by-step by running:

1. **Linting Check**:
   ```bash
   npm run lint
   ```
2. **Prettier Format Verification**:
   ```bash
   npm run format
   ```
3. **Type Check**:
   ```bash
   npm run type-check
   ```
4. **Test Execution**:
   ```bash
   npm run test
   ```
5. **Production Build**:
   ```bash
   npm run build
   ```
