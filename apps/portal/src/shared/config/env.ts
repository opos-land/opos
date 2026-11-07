import { z } from 'zod'

// Build-time addresses: the dev server and the tests fall back to .env.example.
const schema = z.object({
  VITE_API_URL: z.url(),
})

// Named one by one: Vite inlines what the source names, and the whole object is every VITE_* there is.
export const env = schema.parse({ VITE_API_URL: import.meta.env.VITE_API_URL as unknown })
