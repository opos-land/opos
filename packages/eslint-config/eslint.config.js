import tseslint from 'typescript-eslint'
import { node } from './index.js'

export default tseslint.config(node, {
  // The fixtures belong to no TypeScript project; react.test.js lints them with its own config.
  files: ['fixtures/**'],
  extends: [tseslint.configs.disableTypeChecked],
})
