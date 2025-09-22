module.exports = {
  root: true,
  parser: "@typescript-eslint/parser",
  parserOptions: {
    tsconfigRootDir: __dirname,
    project: ["./tsconfig.json"],
  },
  env: {
    browser: true,
    es2021: true,
    node: true,
  },
  plugins: ["@typescript-eslint", "react", "react-hooks", "jsx-a11y", "import"],
  extends: [
    "next/core-web-vitals",
    "plugin:@typescript-eslint/recommended",
    "plugin:react/recommended",
    "plugin:jsx-a11y/recommended",
    "plugin:react-hooks/recommended",
    "plugin:import/typescript",
    "eslint:recommended",
    "prettier",
  ],
  settings: {
    react: {
      version: "detect",
    },
    "import/resolver": {
      typescript: {
        project: "./tsconfig.json",
      },
    },
  },
  rules: {
    "react/react-in-jsx-scope": "off",
    "react/prop-types": "off",
    "@typescript-eslint/explicit-module-boundary-types": "off",
    // Prefer TS-aware unused vars rule and allow underscore-prefixed unused identifiers
    "no-unused-vars": "off",
    "@typescript-eslint/no-unused-vars": [
      "error",
      {
        argsIgnorePattern: "^_",
        varsIgnorePattern: "^_",
        caughtErrorsIgnorePattern: "^_",
      },
    ],
  },
  overrides: [
    {
      files: ["**/__tests__/frontend/**/*.test.tsx"],
      env: {
        jest: true,
      },
    },
    {
      files: ["**/__tests__/backend/**/*.test.ts", "**/__tests__/e2e/**/*.spec.ts"],
      env: {
        node: true,
      },
      globals: {
        describe: "readonly",
        it: "readonly",
        expect: "readonly",
        test: "readonly",
      },
    },
  ],
};
