import { NextRequest, NextResponse } from 'next/server'
import {
  sourceKeyFromCookie,
  upsertPerformance,
  upsertSourceAccount,
  upsertTicket,
} from '../../../lib/planner-db'

const EDFEST_USER_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:151.0) Gecko/20100101 Firefox/151.0',
  'Accept': '*/*',
  'Referer': 'https://edfest.com/account',
  'Origin': 'https://edfest.com',
}

const EDFEST_PURCHASE_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:151.0) Gecko/20100101 Firefox/151.0',
  'Accept': '*/*',
  'Referer': 'https://edfest.com/account/purchases',
  'Origin': 'https://edfest.com',
}

interface TicketItem {
  ticketId?: number | string
  barcode?: string
  barcodeURL?: string
  status?: string
  [key: string]: unknown
}

interface PurchasePerformance {
  performanceId?: string | number
  event?: string
  eventId?: string | number
  eventSlug?: string
  venue?: string
  subvenue?: string
  date?: string
  status?: string
  tickets?: Array<{ ticketItems?: TicketItem[] }>
}

interface Purchase {
  orderid?: string | number
  performances?: PurchasePerformance[]
}

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

function toStringOrNull(value: unknown): string | null {
  if (value == null) return null
  const next = String(value).trim()
  return next ? next : null
}

function isFuturePerformance(datetime: string): boolean {
  const parsed = new Date(datetime.replace(' ', 'T'))
  if (Number.isNaN(parsed.getTime())) return false
  return parsed.getTime() > Date.now()
}

export async function POST(req: NextRequest) {
  const cookie = req.headers.get('x-edfest-cookie') || ''
  if (!cookie) {
    return NextResponse.json({ error: 'no cookie' }, { status: 401 })
  }

  const sourceKey = sourceKeyFromCookie(cookie)

  try {
    const [userRes, purchasesRes] = await Promise.all([
      fetch('https://edfest.com/api/user/me', {
        headers: { ...EDFEST_USER_HEADERS, Cookie: cookie },
        cache: 'no-store',
      }),
      fetch('https://edfest.com/api/user/purchases', {
        headers: { ...EDFEST_PURCHASE_HEADERS, Cookie: cookie },
        cache: 'no-store',
      }),
    ])

    if (!userRes.ok) {
      return NextResponse.json({ error: `failed user fetch: ${userRes.status}` }, { status: 502 })
    }

    if (!purchasesRes.ok) {
      return NextResponse.json({ error: `failed purchases fetch: ${purchasesRes.status}` }, { status: 502 })
    }

    const userData = await userRes.json() as {
      firstname?: string
      first_name?: string
      firstName?: string
      user?: {
        firstname?: string
        first_name?: string
        firstName?: string
      }
    }
    const purchasesText = await purchasesRes.text()
    let purchasesData: { purchases?: Purchase[] }
    try {
      purchasesData = purchasesText ? JSON.parse(purchasesText) as { purchases?: Purchase[] } : {}
    } catch {
      return NextResponse.json({ error: 'invalid purchases response from edfest' }, { status: 502 })
    }

    const resolvedFirstName =
      userData.firstname ??
      userData.first_name ??
      userData.firstName ??
      userData.user?.firstname ??
      userData.user?.first_name ??
      userData.user?.firstName ??
      ''
    const firstName = resolvedFirstName.trim() || 'Unknown'
    const source = upsertSourceAccount({ sourceKey, firstName })

    const purchases = purchasesData.purchases || []
    let importedTickets = 0
    let importedPerformances = 0
    let skippedPastPerformances = 0

    for (const purchase of purchases) {
      const orderId = toStringOrNull(purchase.orderid)
      if (!orderId) continue

      for (const performance of purchase.performances || []) {
        const performanceId = toStringOrNull(performance.performanceId)
        const eventName = toStringOrNull(performance.event)
        const datetime = toStringOrNull(performance.date)

        if (!performanceId || !eventName || !datetime) {
          continue
        }

        if (!isFuturePerformance(datetime)) {
          skippedPastPerformances += 1
          continue
        }

        upsertPerformance({
          performanceId,
          eventId: toStringOrNull(performance.eventId),
          eventName,
          eventSlug: toStringOrNull(performance.eventSlug),
          venue: toStringOrNull(performance.venue),
          subvenue: toStringOrNull(performance.subvenue),
          datetime,
          status: toStringOrNull(performance.status),
        })
        importedPerformances += 1

        let ticketCounter = 0
        for (const ticketGroup of performance.tickets || []) {
          for (const ticket of ticketGroup.ticketItems || []) {
            const externalTicketId =
              toStringOrNull(ticket.ticketId) || `${performanceId}:${ticketCounter + 1}`

            upsertTicket({
              sourceAccountId: source.id,
              performanceId,
              orderId,
              externalTicketId,
              barcode: toStringOrNull(ticket.barcode),
              barcodeUrl: toStringOrNull(ticket.barcodeURL),
              status: toStringOrNull(ticket.status),
              rawJson: JSON.stringify(ticket),
              ticketIndex: ticketCounter,
            })
            importedTickets += 1
            ticketCounter += 1
          }
        }
      }
    }

    return NextResponse.json({
      source,
      importedTickets,
      importedPerformances,
      skippedPastPerformances,
      purchases: purchases.length,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'unknown import error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
