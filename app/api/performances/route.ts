import { NextRequest, NextResponse } from 'next/server'
import type { Performance } from '../../types'
import { readAvailability, writeAvailability } from '../../lib/availability'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const slug = req.nextUrl.searchParams.get('slug')
  if (!slug) return NextResponse.json({ error: 'missing slug' }, { status: 400 })

  const cookie = req.headers.get('x-edfest-cookie') || ''

  const res = await fetch(
    `https://edfest.com/api/projects/${slug}/performances`,
    {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:151.0) Gecko/20100101 Firefox/151.0',
        'Accept': '*/*',
        'Referer': 'https://edfest.com/',
        Cookie: cookie,
      },
      cache: 'no-store',
    }
  )

  if (!res.ok) {
    return NextResponse.json({ error: `upstream ${res.status}` }, { status: res.status })
  }

  const data = await res.json()
  const performances: Performance[] = Array.isArray(data) ? data : (data.cache ?? [])

  try {
    const existing = readAvailability() ?? {}
    existing[slug] = {
      fetchedAt: new Date().toISOString(),
      performances,
    }
    writeAvailability(existing)
  } catch (err) {
    console.error('failed to persist availability', err)
  }

  return NextResponse.json(performances)
}
