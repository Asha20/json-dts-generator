module.exports = {
  preset: "ts-jest",
  testEnvironment: "node",
  // Required to keep ts-jest from complaining about pnpm
  globals: {
    "ts-jest": {
      packageJson: "package.json",
    },
  },
};
