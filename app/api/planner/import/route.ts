import { NextRequest, NextResponse } from 'next/server'
import {
  sourceKeyFromCookie,
  upsertPerformance,
  upsertSourceAccount,
  upsertTicket,
} from '../../../lib/planner-db'

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

  const origin = req.nextUrl.origin
  const sourceKey = sourceKeyFromCookie(cookie)

  try {
    const [userRes, purchasesRes] = await Promise.all([
      fetch(`${origin}/api/user`, {
        headers: { 'x-edfest-cookie': cookie },
        cache: 'no-store',
      }),
      fetch(`${origin}/api/purchases`, {
        headers: { 'x-edfest-cookie': cookie },
        cache: 'no-store',
      }),
    ])

    if (!userRes.ok) {
      return NextResponse.json({ error: `failed user fetch: ${userRes.status}` }, { status: 502 })
    }

    if (!purchasesRes.ok) {
      return NextResponse.json({ error: `failed purchases fetch: ${purchasesRes.status}` }, { status: 502 })
    }

    const userData = await userRes.json() as { firstname?: string }
    const purchasesData = await purchasesRes.json() as { purchases?: Purchase[] }

    const firstName = (userData.firstname || 'Unknown').trim() || 'Unknown'
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
