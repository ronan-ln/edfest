import fs from 'fs'
import path from 'path'
import type { AvailabilityCache } from '../types'

// On Railway: mount a volume at /data and set DATA_PATH=/data/availability.json
// Locally: falls back to the data/ directory inside edfest-browser/
const VOLUME_PATH = process.env.DATA_PATH
  ? path.resolve(process.env.DATA_PATH)
  : path.join(process.cwd(), '..', 'data', 'availability.json')

// Seed file committed alongside the app — used to initialise the volume on first deploy
const SEED_PATH = path.join(process.cwd(), 'data', 'availability.json')

function seedVolumeIfNeeded(): void {
  if (fs.existsSync(VOLUME_PATH)) return
  // Volume is empty — copy the committed seed file if it exists
  try {
    const dir = path.dirname(VOLUME_PATH)
    fs.mkdirSync(dir, { recursive: true })
    if (fs.existsSync(SEED_PATH)) {
      fs.copyFileSync(SEED_PATH, VOLUME_PATH)
      console.log('[availability] seeded volume from committed data')
    }
  } catch (err) {
    console.warn('[availability] could not seed volume:', err)
  }
}

export function readAvailability(): AvailabilityCache | null {
  seedVolumeIfNeeded()
  try {
    const raw = fs.readFileSync(VOLUME_PATH, 'utf-8')
    return JSON.parse(raw) as AvailabilityCache
  } catch {
    return null
  }
}

export function writeAvailability(cache: AvailabilityCache): void {
  const dir = path.dirname(VOLUME_PATH)
  fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(VOLUME_PATH, JSON.stringify(cache, null, 2), 'utf-8')
}

export { VOLUME_PATH as AVAILABILITY_PATH }
