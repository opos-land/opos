export default {
  extends: ['@commitlint/config-conventional'],
  rules: {
    'type-enum': [
      2,
      'always',
      ['build', 'chore', 'ci', 'docs', 'feat', 'fix', 'perf', 'refactor', 'revert', 'test'],
    ],
    'scope-enum': [
      2,
      'always',
      ['api', 'panel', 'portal', 'cms', 'mobile', 'db', 'contract', 'i18n', 'e2e', 'infra', 'repo'],
    ],
    'header-max-length': [2, 'always', 72],
    'subject-full-stop': [2, 'never', '.'],
  },
}
