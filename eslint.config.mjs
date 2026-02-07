export default [
  {
    files: ["**/*.gs"],
    languageOptions: {
      ecmaVersion: 2020,
      sourceType: "script",
      globals: {
        SpreadsheetApp: "readonly",
        PropertiesService: "readonly",
        UrlFetchApp: "readonly",
        HtmlService: "readonly",
        Utilities: "readonly",
        Logger: "readonly",
        console: "readonly",
      }
    },
    rules: {
      "no-undef": "off",
      "no-unused-vars": "off",
      "semi": ["error", "always"],
      "no-extra-semi": "error",
      "no-unreachable": "error",
      "no-dupe-keys": "error",
      "no-duplicate-case": "error",
      "no-empty": ["error", { "allowEmptyCatch": true }],
      "no-irregular-whitespace": "error",
      "valid-typeof": "error",
      "no-var": "error",
      "eqeqeq": ["error", "always"],
    }
  },
];
