module.exports = {
  extends: ['standard', 'plugin:prettier/recommended'],
  rules: {
    'prettier/prettier': 'error',
  },
  env: {
    node: true,
    es2017: true,
  },
  ignorePatterns: ['dist/**/*.js', 'lambda/dist/**/*.js'],
}
