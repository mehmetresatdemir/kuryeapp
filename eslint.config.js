// Flat config ile backend (Node.js) ve frontend (React/TypeScript) için ESLint ayarları

module.exports = [
  {
    files: ["backend/**/*.js"],
    languageOptions: {
      ecmaVersion: 2021,
      sourceType: "script",
      globals: {
        __dirname: true,
        require: true,
        module: true,
        process: true,
        exports: true,
        __filename: true
      },
    },
    plugins: {},
    rules: {
      "no-undef": "off",
      "no-unused-vars": ["warn", { "args": "none" }],
    },
  },
  {
    files: ["app/**/*.tsx", "app/**/*.ts", "components/**/*.tsx", "lib/**/*.ts"],
    languageOptions: {
      parser: require("@typescript-eslint/parser"),
      ecmaVersion: 2021,
      sourceType: "module",
      globals: {
        window: true,
        document: true,
        navigator: true,
        fetch: true,
        __DEV__: true
      },
    },
    plugins: {
      "@typescript-eslint": require("@typescript-eslint/eslint-plugin"),
      "react": require("eslint-plugin-react"),
      "react-hooks": require("eslint-plugin-react-hooks"),
    },
    rules: {
      "react/react-in-jsx-scope": "off",
      "@typescript-eslint/no-unused-vars": ["warn", { "args": "none" }],
      "react-hooks/exhaustive-deps": "warn",
      "import/no-unresolved": "off"
    },
    settings: {
      react: { version: "detect" },
    },
  },
];
