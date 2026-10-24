import { z } from 'zod'

// Build-time addresses (PLAN.md 11): the dev server and the tests fall back to .env.example.
const schema = z.object({
  VITE_API_URL: z.url(),
  VITE_AUTH_URL: z.url(),
})

export const env = schema.parse(import.meta.env)
