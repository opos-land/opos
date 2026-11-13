import { linguiConfig } from '@opos/i18n/lingui.config.base'

export default linguiConfig([
  { path: '<rootDir>/src/locales/{locale}', include: ['<rootDir>/src'] },
])
