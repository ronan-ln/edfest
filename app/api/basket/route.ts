import { NextRequest, NextResponse } from 'next/server'

const EDFEST_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:151.0) Gecko/20100101 Firefox/151.0',
  'Accept': 'application/json',
  'Referer': 'https://edfest.com/',
  'Origin': 'https://edfest.com',
}

export const dynamic = 'force-dynamic'

// GET /api/basket — fetch current basket to show item count
export async function GET(req: NextRequest) {
  const cookie = req.headers.get('x-edfest-cookie') || ''
  if (!cookie) return NextResponse.json({ error: 'no cookie' }, { status: 401 })

  try {
    const res = await fetch('https://edfest.com/api/basket', {
      headers: { ...EDFEST_HEADERS, Cookie: cookie },
      cache: 'no-store',
    })

    const text = await res.text()
    console.log('GET /api/basket response:', { status: res.status, text, headers: Object.fromEntries(res.headers) })

    let data
    try {
      data = text ? JSON.parse(text) : {}
    } catch {
      return NextResponse.json({ error: 'Invalid response from edfest.com', rawResponse: text, status: res.status }, { status: 502 })
    }
    return NextResponse.json(data, { status: res.status })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    console.error('GET /api/basket error:', msg)
    return NextResponse.json({ error: msg }, { status: 502 })
  }
}

// POST /api/basket — add item to basket
export async function POST(req: NextRequest) {
  const cookie = req.headers.get('x-edfest-cookie') || ''
  if (!cookie) return NextResponse.json({ error: 'no cookie' }, { status: 401 })

  try {
    const body = await req.json()
    console.log('POST /api/basket request:', {
      url: 'https://edfest.com/api/basket',
      method: 'POST',
      body,
      headers: { 'content-type': 'application/json', Cookie: '***redacted***' },
    })

    const res = await fetch('https://edfest.com/api/basket', {
      method: 'POST',
      headers: {
        ...EDFEST_HEADERS,
        'content-type': 'application/json',
        Cookie: cookie,
      },
      body: JSON.stringify(body),
      cache: 'no-store',
    })

    const text = await res.text()
    console.log('POST /api/basket response:', {
      status: res.status,
      statusText: res.statusText,
      contentLength: text.length,
      text: text.slice(0, 500),
      headers: Object.fromEntries(res.headers),
    })

    let data: any = { success: false }
    if (res.status === 204) {
      data = { success: true, message: 'Item added to basket' }
    } else if (text) {
      try {
        data = JSON.parse(text)
        if (res.ok) data.success = true
      } catch {
        return NextResponse.json({ error: 'Invalid JSON from edfest.com', rawResponse: text, status: res.status }, { status: 502 })
      }
    } else if (!res.ok) {
      return NextResponse.json({ error: 'Request failed', status: res.status }, { status: res.status === 500 ? 502 : res.status })
    } else {
      data = { success: true, message: 'Item added to basket' }
    }

    if (!res.ok) {
      const message = data?.error || data?.message || 'Failed to add item to basket'
      return NextResponse.json(
        {
          success: false,
          error: message,
          upstreamStatus: res.status,
          upstream: data,
        },
        { status: res.status === 500 ? 502 : res.status }
      )
    }

    return NextResponse.json(data, { status: 200 })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    console.error('POST /api/basket error:', msg)
    return NextResponse.json({ error: msg }, { status: 502 })
  }
}
