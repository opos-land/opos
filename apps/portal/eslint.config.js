import { react } from '@opos/eslint-config/react'

export default [
  // The built server beside the portal (`vite build --ssr`)
  { ignores: ['build/**'] },
  ...react(import.meta.dirname),
  {
    // shadcn/ui's Label is the label element itself; its control comes from where it is used.
    files: ['src/shared/ui/label.tsx'],
    rules: { 'jsx-a11y/label-has-associated-control': 'off' },
  },
]
