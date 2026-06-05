import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const dataPath = process.env.DATA_PATH
if (!dataPath) process.exit(0)

const targetDir = path.dirname(dataPath)
if (!fs.existsSync(targetDir)) {
  console.log('Volume not mounted, skipping seed')
  process.exit(0)
}

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const source = path.join(__dirname, '..', 'data', 'availability.json')
if (!fs.existsSync(source)) {
  console.log('No bundled seed file found, skipping')
  process.exit(0)
}

function readJson(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'))
  } catch {
    return null
  }
}

const seed = readJson(source)
if (!seed || typeof seed !== 'object') {
  console.log('Bundled seed is invalid, skipping')
  process.exit(0)
}

if (fs.existsSync(dataPath)) {
  const existing = readJson(dataPath)
  if (!existing || typeof existing !== 'object') {
    fs.copyFileSync(source, dataPath)
    console.log(`Replaced invalid ${dataPath} from bundled data/availability.json`)
    process.exit(0)
  }

  let added = 0
  for (const [slug, value] of Object.entries(seed)) {
    if (!(slug in existing)) {
      existing[slug] = value
      added++
    }
  }

  if (added === 0) {
    console.log('availability.json already complete, skipping seed')
    process.exit(0)
  }

  fs.writeFileSync(dataPath, JSON.stringify(existing, null, 2), 'utf8')
  console.log(`Backfilled ${added} missing entries into ${dataPath}`)
  process.exit(0)
}

fs.copyFileSync(source, dataPath)
console.log(`Seeded ${dataPath} from bundled data/availability.json`)
