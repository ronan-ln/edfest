import fs from 'fs'
import path from 'path'
import type { AvailabilityCache } from '../types'

// On Railway: set DATA_PATH=/data/availability.json and mount a volume at /data
// Locally: uses data/availability.json inside edfest-browser/ (same file the crawler writes to)
const AVAILABILITY_PATH = process.env.DATA_PATH
  ? path.resolve(process.env.DATA_PATH)
  : path.join(process.cwd(), 'data', 'availability.json')

export function readAvailability(): AvailabilityCache | null {
  try {
    const raw = fs.readFileSync(AVAILABILITY_PATH, 'utf-8')
    return JSON.parse(raw) as AvailabilityCache
  } catch {
    return null
  }
}

export function writeAvailability(cache: AvailabilityCache): void {
  const dir = path.dirname(AVAILABILITY_PATH)
  fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(AVAILABILITY_PATH, JSON.stringify(cache, null, 2), 'utf-8')
}

export { AVAILABILITY_PATH }
