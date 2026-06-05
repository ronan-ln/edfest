import { NextRequest, NextResponse } from 'next/server'
import type { Performance } from '../../../../types'
import { readAvailability, writeAvailability } from '../../../../lib/availability'

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:151.0) Gecko/20100101 Firefox/151.0',
  'Accept': '*/*',
  'Referer': 'https://edfest.com/',
}

export const dynamic = 'force-dynamic'

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string; perfId: string }> }
) {
  const { slug, perfId } = await params
  if (!slug || !perfId) {
    return NextResponse.json({ error: 'missing slug or perfId' }, { status: 400 })
  }

  const cookie = req.headers.get('x-edfest-cookie') || ''

  try {
    const res = await fetch(
      `https://edfest.com/api/projects/${slug}/performances/${perfId}`,
      {
        headers: { ...HEADERS, Cookie: cookie },
        cache: 'no-store',
      }
    )

    if (!res.ok) {
      return NextResponse.json({ error: `upstream ${res.status}` }, { status: res.status })
    }

    const data: Performance = await res.json()

    // Persist single-performance refreshes so card-level cache does not stay stale.
    try {
      const existing = readAvailability() ?? {}
      const current = existing[slug]?.performances ?? []
      const resolvedId = String(data.id ?? perfId)
      const idx = current.findIndex((p) => String(p.id) === resolvedId)

      const next = [...current]
      const normalized: Performance = { ...data, id: resolvedId }
      if (idx >= 0) {
        next[idx] = normalized
      } else {
        next.push(normalized)
      }

      existing[slug] = {
        fetchedAt: new Date().toISOString(),
        performances: next,
      }
      writeAvailability(existing)
    } catch (err) {
      console.error('failed to persist single performance availability', err)
    }

    return NextResponse.json(data)
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: msg }, { status: 502 })
  }
}
