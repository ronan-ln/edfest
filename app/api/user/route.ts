import { NextRequest, NextResponse } from 'next/server'

const EDFEST_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:151.0) Gecko/20100101 Firefox/151.0',
  'Accept': '*/*',
  'Referer': 'https://edfest.com/account',
  'Origin': 'https://edfest.com',
}

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const cookie = req.headers.get('x-edfest-cookie') || ''
  if (!cookie) return NextResponse.json({ error: 'no cookie' }, { status: 401 })

  const res = await fetch('https://edfest.com/api/user/me', {
    headers: { ...EDFEST_HEADERS, Cookie: cookie },
    cache: 'no-store',
  })

  const data = await res.json()
  return NextResponse.json(data, { status: res.status })
}
