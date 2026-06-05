import { NextResponse } from 'next/server'
import { readAvailability } from '../../lib/availability'

export const dynamic = 'force-dynamic'

export async function GET() {
  const cache = readAvailability() ?? {}
  return NextResponse.json(cache)
}
