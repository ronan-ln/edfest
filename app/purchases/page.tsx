'use client'

import { useEffect, useState } from 'react'
import { getCookie } from '../components/CookieSetup'
import Link from 'next/link'

interface TicketItem {
  ticketId: number
  barcode: string
  barcodeURL: string
}

interface PurchasePerformance {
  performanceId: string
  event: string
  eventId: string
  venue: string
  subvenue: string
  date: string
  tickets: {
    ticketItems: TicketItem[]
    quantity: number
  }[]
}

interface Purchase {
  orderid: string
  performances: PurchasePerformance[]
}

interface FlatEvent {
  key: string
  event: string
  eventId: string
  venue: string
  subvenue: string
  date: string
  ticketItems: TicketItem[]
  ticketCount: number
}

function imageUrl(name: string, eventsMap: Map<string, string>): string | null {
  const thumb = eventsMap.get(name.toLowerCase())
  if (!thumb) return null
  return `https://edfest.pazaz.studio/assets/${thumb}?width=400&fit=cover&quality=80&height=400`
}

function formatDateTime(dateStr: string): { date: string; time: string } {
  const d = new Date(dateStr.replace(' ', 'T'))
  const date = d.toLocaleDateString('en-GB', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
  const time = d.toLocaleTimeString('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
  })
  return { date, time }
}

export default function PurchasesPage() {
  const [events, setEvents] = useState<FlatEvent[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [expanded, setExpanded] = useState<string | null>(null)
  const [eventsMap, setEventsMap] = useState<Map<string, string>>(new Map())

  // Load offers.json for image matching
  useEffect(() => {
    fetch('/offers.json')
      .then((r) => r.json())
      .then((offers: { name: string; image_thumbnail: string | null }[]) => {
        const map = new Map<string, string>()
        for (const o of offers) {
          if (o.image_thumbnail) {
            map.set(o.name.toLowerCase(), o.image_thumbnail)
          }
        }
        setEventsMap(map)
      })
      .catch(() => {})
  }, [])

  useEffect(() => {
    const cookie = getCookie()
    if (!cookie) {
      setError('No cookie configured. Go to the main page to set up your session.')
      setLoading(false)
      return
    }

    fetch('/api/purchases', {
      headers: { 'x-edfest-cookie': cookie },
    })
      .then((r) => r.json())
      .then((data) => {
        if (data.error) {
          setError(data.error)
          setLoading(false)
          return
        }

        const purchases: Purchase[] = data.purchases || []
        const now = new Date()
        const flat: FlatEvent[] = []

        for (const purchase of purchases) {
          for (const perf of purchase.performances || []) {
            const perfDate = new Date(perf.date.replace(' ', 'T'))
            if (perfDate < now) continue // only upcoming

            const ticketItems: TicketItem[] = []
            let ticketCount = 0
            for (const t of perf.tickets || []) {
              for (const item of t.ticketItems || []) {
                ticketItems.push(item)
              }
              ticketCount += t.ticketItems?.length || 0
            }

            flat.push({
              key: `${purchase.orderid}-${perf.performanceId}-${perf.date}`,
              event: perf.event,
              eventId: perf.eventId,
              venue: perf.venue,
              subvenue: perf.subvenue,
              date: perf.date,
              ticketItems,
              ticketCount,
            })
          }
        }

        // Sort by date ascending
        flat.sort((a, b) => {
          const da = new Date(a.date.replace(' ', 'T')).getTime()
          const db = new Date(b.date.replace(' ', 'T')).getTime()
          return da - db
        })

        setEvents(flat)
        setLoading(false)
      })
      .catch((err) => {
        setError(err.message || 'Failed to load purchases')
        setLoading(false)
      })
  }, [])

  return (
    <div className="min-h-screen flex-1 bg-gray-950 text-gray-100">
      <header className="border-b border-gray-800 bg-gray-950">
        <div className="mx-auto max-w-4xl px-4 py-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-gray-100">My Tickets</h1>
              <p className="text-sm text-gray-400">
                {events.length} upcoming event{events.length !== 1 ? 's' : ''}
              </p>
            </div>
            <Link
              href="/"
              className="rounded-lg border border-gray-700 bg-gray-900 px-4 py-2 text-sm font-medium text-gray-200 hover:border-green-400 hover:text-green-400"
            >
              ← Browse shows
            </Link>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-4xl px-4 py-6">
        {loading && (
          <div className="flex items-center gap-3 py-12 text-sm text-gray-400">
            <div className="h-4 w-4 animate-spin rounded-full border-2 border-gray-700 border-t-green-400" />
            Loading your tickets...
          </div>
        )}

        {error && (
          <div className="rounded-lg border border-red-800 bg-red-950/50 p-6 text-center text-sm text-red-300">
            {error}
          </div>
        )}

        {!loading && !error && events.length === 0 && (
          <div className="rounded-lg border border-gray-800 bg-gray-900 p-8 text-center text-sm text-gray-400">
            No upcoming events found.
          </div>
        )}

        {!loading && !error && events.length > 0 && (
          <div className="space-y-3">
            {events.map((ev) => {
              const { date, time } = formatDateTime(ev.date)
              const isExpanded = expanded === ev.key
              const img = imageUrl(ev.event, eventsMap)

              return (
                <div key={ev.key} className="overflow-hidden rounded-xl border border-gray-800 bg-gray-900">
                  <button
                    type="button"
                    onClick={() => setExpanded(isExpanded ? null : ev.key)}
                    className="flex w-full items-center gap-4 p-4 text-left transition hover:bg-gray-800/50"
                  >
                    {/* Image */}
                    <div className="h-16 w-16 shrink-0 overflow-hidden rounded-lg bg-gray-800">
                      {img ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={img}
                          alt={ev.event}
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center text-lg">
                          🎭
                        </div>
                      )}
                    </div>

                    {/* Info */}
                    <div className="min-w-0 flex-1">
                      <h3 className="truncate text-base font-semibold text-gray-100">
                        {ev.event}
                      </h3>
                      <p className="text-sm text-gray-400">
                        {ev.venue} · {ev.subvenue}
                      </p>
                      <p className="text-sm text-green-400">
                        {date} at {time}
                      </p>
                    </div>

                    {/* Ticket count + chevron */}
                    <div className="flex shrink-0 items-center gap-3">
                      <span className="rounded-full bg-green-400/10 px-3 py-1 text-sm font-medium text-green-400">
                        {ev.ticketCount} ticket{ev.ticketCount !== 1 ? 's' : ''}
                      </span>
                      <svg
                        className={`h-5 w-5 text-gray-500 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                      </svg>
                    </div>
                  </button>

                  {/* Expanded barcodes */}
                  {isExpanded && (
                    <div className="border-t border-gray-800 bg-gray-950 px-4 py-4">
                      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                        {ev.ticketItems.map((ticket, i) => (
                          <div
                            key={ticket.ticketId}
                            className="flex flex-col items-center gap-2 rounded-lg border border-gray-800 bg-white p-4"
                          >
                            <p className="text-xs font-medium text-gray-600">
                              Ticket {i + 1}
                            </p>
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                              src={ticket.barcodeURL}
                              alt={`Barcode for ticket ${i + 1}`}
                              className="h-auto w-full max-w-[200px]"
                            />
                            <p className="font-mono text-xs text-gray-500">
                              {ticket.barcode}
                            </p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </main>
    </div>
  )
}
