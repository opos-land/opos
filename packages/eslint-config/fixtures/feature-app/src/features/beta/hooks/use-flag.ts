import { useState } from 'react'

export function useFlag(enabled: boolean) {
  if (enabled) {
    return useState(true)
  }
  return null
}
