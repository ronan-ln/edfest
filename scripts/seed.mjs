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

if (fs.existsSync(dataPath)) {
  console.log('availability.json already exists, skipping seed')
  process.exit(0)
}

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const source = path.join(__dirname, '..', 'data', 'availability.json')
if (!fs.existsSync(source)) {
  console.log('No bundled seed file found, skipping')
  process.exit(0)
}

fs.copyFileSync(source, dataPath)
console.log(`Seeded ${dataPath} from bundled data/availability.json`)
