'use client'

import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { Suspense, startTransition, useEffect, useMemo, useState } from 'react'
import { getCookie } from '../components/CookieSetup'

const DAY_START_MINUTES = 10 * 60
const MIN_EVENT_MINUTES = 30
const DEFAULT_EVENT_MINUTES = 60
const PIXELS_PER_MINUTE = 1.35

type ViewMode = 'list' | 'diary'

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
  }[]
}

interface Purchase {
  orderid: string
  performances: PurchasePerformance[]
}

interface OfferCategory {
  categories_id?: {
    name?: string
  }
}

interface OfferMeta {
  description: string | null
  durationMinutes: number | null
  imageThumbnail: string | null
  tags: string[]
}

interface FlatEvent {
  key: string
  event: string
  eventId: string
  venue: string
  subvenue: string
  date: string
  dayKey: string
  startMinutes: number
  endMinutes: number
  durationMinutes: number
  ticketItems: TicketItem[]
  ticketCount: number
  description: string | null
  imageThumbnail: string | null
  tags: string[]
}

interface PositionedEvent extends FlatEvent {
  column: number
  columns: number
}

function normalizeName(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, ' ')
}

function parseDate(dateStr: string): Date {
  return new Date(dateStr.replace(' ', 'T'))
}

function parseDurationMinutes(duration: string | null | undefined): number | null {
  if (!duration) return null
  const value = Number.parseFloat(duration)
  if (!Number.isFinite(value) || value <= 0) return null
  return Math.max(MIN_EVENT_MINUTES, Math.round(value))
}

function stripHtml(value: string | null): string {
  if (!value) return ''
  return value
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim()
}

function formatDayKey(date: Date): string {
  const year = date.getFullYear()
  const month = `${date.getMonth() + 1}`.padStart(2, '0')
  const day = `${date.getDate()}`.padStart(2, '0')
  return `${year}-${month}-${day}`
}

function formatDayLabel(dayKey: string): string {
  const date = new Date(`${dayKey}T12:00:00`)
  return date.toLocaleDateString('en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  })
}

function formatTimeLabel(minutes: number): string {
  const hours = Math.floor(minutes / 60)
  const mins = minutes % 60
  return `${`${hours}`.padStart(2, '0')}:${`${mins}`.padStart(2, '0')}`
}

function formatDateTime(dateStr: string): { date: string; time: string } {
  const date = parseDate(dateStr)
  return {
    date: date.toLocaleDateString('en-GB', {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    }),
    time: date.toLocaleTimeString('en-GB', {
      hour: '2-digit',
      minute: '2-digit',
    }),
  }
}

function getImageUrl(imageThumbnail: string | null): string | null {
  if (!imageThumbnail) return null
  return `https://edfest.pazaz.studio/assets/${imageThumbnail}?width=640&fit=cover&quality=80&height=480`
}

function getEventColor(seed: string): { background: string; border: string } {
  let hash = 0
  for (let index = 0; index < seed.length; index += 1) {
    hash = seed.charCodeAt(index) + ((hash << 5) - hash)
  }
  const hue = Math.abs(hash) % 360
  return {
    background: `hsla(${hue}, 78%, 52%, 0.32)`,
    border: `hsla(${hue}, 88%, 72%, 0.95)`,
  }
}

function layoutDayEvents(events: FlatEvent[]): PositionedEvent[] {
  const positioned: PositionedEvent[] = []
  let cluster: FlatEvent[] = []
  let clusterEnd = -1

  const flushCluster = () => {
    if (cluster.length === 0) return
    const columnsEnd: number[] = []
    const clustered: PositionedEvent[] = []

    for (const event of cluster) {
      let column = columnsEnd.findIndex((endMinutes) => endMinutes <= event.startMinutes)
      if (column === -1) {
        column = columnsEnd.length
        columnsEnd.push(event.endMinutes)
      } else {
        columnsEnd[column] = event.endMinutes
      }
      clustered.push({ ...event, column, columns: 0 })
    }

    const totalColumns = Math.max(1, columnsEnd.length)
    for (const event of clustered) {
      event.columns = totalColumns
      positioned.push(event)
    }

    cluster = []
    clusterEnd = -1
  }

  for (const event of events) {
    if (cluster.length === 0 || event.startMinutes < clusterEnd) {
      cluster.push(event)
      clusterEnd = Math.max(clusterEnd, event.endMinutes)
    } else {
      flushCluster()
      cluster.push(event)
      clusterEnd = event.endMinutes
    }
  }

  flushCluster()
  return positioned
}

function getViewMode(view: string | null): ViewMode {
  return view === 'diary' ? 'diary' : 'list'
}

function TicketAccordion({
  event,
  expandedTickets,
  onToggleTicket,
}: {
  event: FlatEvent
  expandedTickets: Record<string, boolean>
  onToggleTicket: (ticketKey: string) => void
}) {
  return (
    <div className="space-y-3">
      {event.ticketItems.map((ticket, index) => {
        const ticketKey = `${event.key}:${ticket.ticketId}`
        const isOpen = !!expandedTickets[ticketKey]
        return (
          <div key={ticket.ticketId} className="overflow-hidden rounded-xl border border-gray-800 bg-gray-950">
            <button
              type="button"
              onClick={() => onToggleTicket(ticketKey)}
              className="flex w-full items-center justify-between gap-4 px-4 py-3 text-left"
            >
              <span className="text-sm font-medium text-gray-100">Ticket {index + 1}</span>
              <span className="text-sm text-gray-400">{isOpen ? 'v' : '>'}</span>
            </button>
            {isOpen && (
              <div className="border-t border-gray-800 bg-white px-4 py-4 text-center">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={ticket.barcodeURL}
                  alt={`Barcode for ticket ${index + 1}`}
                  className="mx-auto h-auto w-full max-w-[220px]"
                />
                <p className="mt-3 font-mono text-xs text-gray-500">{ticket.barcode}</p>
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

function DiaryModal({
  event,
  expandedTickets,
  onClose,
  onToggleTicket,
}: {
  event: FlatEvent
  expandedTickets: Record<string, boolean>
  onClose: () => void
  onToggleTicket: (ticketKey: string) => void
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm" onClick={onClose}>
      <div
        className="max-h-[90vh] w-full max-w-4xl overflow-hidden rounded-3xl border border-gray-800 bg-gray-950 shadow-2xl shadow-black/40"
        onClick={(eventClick) => eventClick.stopPropagation()}
      >
        <div className="grid max-h-[90vh] grid-cols-1 overflow-y-auto lg:grid-cols-[1.1fr_0.9fr]">
          <div className="border-b border-gray-800 lg:border-b-0 lg:border-r">
            {getImageUrl(event.imageThumbnail) ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={getImageUrl(event.imageThumbnail)!}
                alt={event.event}
                className="h-64 w-full object-cover lg:h-full"
              />
            ) : (
              <div className="flex h-64 items-center justify-center bg-gray-900 text-6xl lg:h-full">🎭</div>
            )}
          </div>

          <div className="flex flex-col p-6">
            <div className="mb-5 flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.22em] text-green-400">Show details</p>
                <h2 className="mt-2 text-2xl font-bold text-white">{event.event}</h2>
                <p className="mt-2 text-sm text-gray-300">
                  {event.venue} · {event.subvenue}
                </p>
                <p className="text-sm text-green-400">
                  {formatDateTime(event.date).date} at {formatDateTime(event.date).time}
                </p>
              </div>
              <button
                type="button"
                onClick={onClose}
                className="rounded-full border border-gray-700 px-3 py-1 text-sm text-gray-300 hover:border-gray-500 hover:text-white"
              >
                Close
              </button>
            </div>

            {event.tags.length > 0 && (
              <div className="mb-4 flex flex-wrap gap-2">
                {event.tags.map((tag) => (
                  <span key={tag} className="rounded-full border border-gray-700 bg-gray-900 px-3 py-1 text-xs text-gray-300">
                    {tag}
                  </span>
                ))}
              </div>
            )}

            {event.description && (
              <p className="mb-5 text-sm leading-6 text-gray-300">{stripHtml(event.description)}</p>
            )}

            <div className="mb-4 flex flex-wrap gap-2 text-sm text-gray-300">
              <span className="rounded-full border border-gray-700 bg-gray-900 px-3 py-1">
                {event.ticketCount} ticket{event.ticketCount !== 1 ? 's' : ''}
              </span>
              <span className="rounded-full border border-gray-700 bg-gray-900 px-3 py-1">
                {event.durationMinutes} minutes
              </span>
            </div>

            <TicketAccordion event={event} expandedTickets={expandedTickets} onToggleTicket={onToggleTicket} />
          </div>
        </div>
      </div>
    </div>
  )
}

function PurchasesPageContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [events, setEvents] = useState<FlatEvent[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selectedEvent, setSelectedEvent] = useState<FlatEvent | null>(null)
  const [expandedEventKey, setExpandedEventKey] = useState<string | null>(null)
  const [expandedTickets, setExpandedTickets] = useState<Record<string, boolean>>({})

  useEffect(() => {
    const cookie = getCookie()
    if (!cookie) {
      startTransition(() => {
        setError('No cookie configured. Go to the main page to set up your session.')
        setLoading(false)
      })
      return
    }

    Promise.all([
      fetch('/offers.json').then((response) =>
        response.json() as Promise<
          Array<{
            name: string
            description: string | null
            short_description: string | null
            duration: string | null
            image_thumbnail: string | null
            categories?: OfferCategory[]
            event_type?: string | null
            raw_data?: { ageSuitabilityTitle?: string | null } | null
          }>
        >
      ),
      fetch('/api/purchases', {
        headers: { 'x-edfest-cookie': cookie },
      }).then((response) => response.json() as Promise<{ error?: string; purchases?: Purchase[] }>),
    ])
      .then(([offers, data]) => {
        if (data.error) {
          setError(data.error)
          setLoading(false)
          return
        }

        const offersMap = new Map<string, OfferMeta>()
        for (const offer of offers) {
          const tags = new Set<string>()
          for (const category of offer.categories ?? []) {
            const name = category.categories_id?.name?.trim()
            if (name) tags.add(name)
          }
          if (offer.event_type) tags.add(offer.event_type)
          if (offer.raw_data?.ageSuitabilityTitle) tags.add(offer.raw_data.ageSuitabilityTitle)

          offersMap.set(normalizeName(offer.name), {
            description: offer.short_description ?? offer.description,
            durationMinutes: parseDurationMinutes(offer.duration),
            imageThumbnail: offer.image_thumbnail,
            tags: Array.from(tags),
          })
        }

        const purchases = data.purchases || []
        const now = new Date()
        const flat: FlatEvent[] = []

        for (const purchase of purchases) {
          for (const perf of purchase.performances || []) {
            const startAt = parseDate(perf.date)
            if (startAt < now) continue

            const meta = offersMap.get(normalizeName(perf.event))
            const durationMinutes = meta?.durationMinutes ?? DEFAULT_EVENT_MINUTES
            const startMinutes = startAt.getHours() * 60 + startAt.getMinutes()
            const ticketItems = (perf.tickets || []).flatMap((ticket) => ticket.ticketItems || [])

            flat.push({
              key: `${purchase.orderid}-${perf.performanceId}-${perf.date}`,
              event: perf.event,
              eventId: perf.eventId,
              venue: perf.venue,
              subvenue: perf.subvenue,
              date: perf.date,
              dayKey: formatDayKey(startAt),
              startMinutes,
              endMinutes: startMinutes + durationMinutes,
              durationMinutes,
              ticketItems,
              ticketCount: ticketItems.length,
              description: meta?.description ?? null,
              imageThumbnail: meta?.imageThumbnail ?? null,
              tags: meta?.tags ?? [],
            })
          }
        }

        flat.sort((left, right) => parseDate(left.date).getTime() - parseDate(right.date).getTime())
        setEvents(flat)
        setLoading(false)
      })
      .catch((err: Error) => {
        setError(err.message || 'Failed to load purchases')
        setLoading(false)
      })
  }, [])

  const dayKeys = useMemo(() => Array.from(new Set(events.map((event) => event.dayKey))), [events])
  const currentView = getViewMode(searchParams.get('view'))

  useEffect(() => {
    if (dayKeys.length === 0) return
    const requestedDay = searchParams.get('day')
    const nextDay = requestedDay && dayKeys.includes(requestedDay) ? requestedDay : dayKeys[0]
    const params = new URLSearchParams(searchParams.toString())
    let changed = false

    if (params.get('day') !== nextDay) {
      params.set('day', nextDay)
      changed = true
    }

    if (params.get('view') !== currentView) {
      params.set('view', currentView)
      changed = true
    }

    if (changed) {
      router.replace(`/purchases?${params.toString()}`, { scroll: false })
    }
  }, [currentView, dayKeys, router, searchParams])

  const eventsByDay = useMemo(() => {
    const grouped = new Map<string, FlatEvent[]>()
    for (const event of events) {
      const current = grouped.get(event.dayKey)
      if (current) {
        current.push(event)
      } else {
        grouped.set(event.dayKey, [event])
      }
    }
    return grouped
  }, [events])

  const requestedDay = searchParams.get('day')
  const currentDay = requestedDay && dayKeys.includes(requestedDay) ? requestedDay : dayKeys[0] ?? null
  const currentDayIndex = currentDay ? dayKeys.indexOf(currentDay) : -1
  const sortedEvents = useMemo(() => [...events], [events])
  const dayEvents = useMemo(() => {
    if (!currentDay) return []
    return eventsByDay.get(currentDay) ?? []
  }, [currentDay, eventsByDay])
  const positionedEvents = useMemo(() => layoutDayEvents(dayEvents), [dayEvents])
  const dayEndMinutes = useMemo(() => {
    if (dayEvents.length === 0) return 22 * 60
    return Math.max(...dayEvents.map((event) => event.endMinutes))
  }, [dayEvents])
  const timelineHeight = Math.max(720, (dayEndMinutes - DAY_START_MINUTES) * PIXELS_PER_MINUTE)

  const timeMarks = useMemo(() => {
    const marks: number[] = []
    for (let minutes = DAY_START_MINUTES; minutes <= dayEndMinutes; minutes += 15) {
      marks.push(minutes)
    }
    if (marks[marks.length - 1] !== dayEndMinutes) {
      marks.push(dayEndMinutes)
    }
    return marks
  }, [dayEndMinutes])

  function pushParams(updates: Record<string, string>) {
    const params = new URLSearchParams(searchParams.toString())
    for (const [key, value] of Object.entries(updates)) {
      params.set(key, value)
    }
    router.push(`/purchases?${params.toString()}`, { scroll: false })
  }

  function navigateDay(offset: number) {
    if (currentDayIndex < 0) return
    const nextDay = dayKeys[currentDayIndex + offset]
    if (!nextDay) return
    pushParams({ day: nextDay })
  }

  function toggleTicket(ticketKey: string) {
    setExpandedTickets((current) => ({
      ...current,
      [ticketKey]: !current[ticketKey],
    }))
  }

  return (
    <div className="min-h-screen flex-1 bg-gray-950 text-gray-100">
      <header className="border-b border-gray-800 bg-gray-950">
        <div className="mx-auto max-w-7xl px-4 py-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h1 className="text-2xl font-bold text-gray-100">My Tickets</h1>
              <p className="text-sm text-gray-400">
                {events.length} upcoming performance{events.length !== 1 ? 's' : ''} across {dayKeys.length} day{dayKeys.length !== 1 ? 's' : ''}
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

      <main className="mx-auto max-w-7xl px-4 py-6">
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

        {!loading && !error && events.length > 0 && currentDay && (
          <div className="space-y-6">
            <div className="flex flex-wrap gap-2 rounded-2xl border border-gray-800 bg-gray-900/80 p-3">
              {dayKeys.map((dayKey) => {
                const active = dayKey === currentDay
                return (
                  <button
                    key={dayKey}
                    type="button"
                    onClick={() => pushParams({ day: dayKey })}
                    className={`rounded-xl px-4 py-2 text-sm font-medium transition ${active ? 'bg-green-400 text-gray-950' : 'bg-gray-800 text-gray-300 hover:bg-gray-700 hover:text-gray-100'}`}
                  >
                    {formatDayLabel(dayKey)}
                  </button>
                )
              })}
            </div>

            <div className="mb-6 flex flex-col gap-4 rounded-2xl border border-gray-800 bg-gray-900/70 p-4 backdrop-blur sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-xs uppercase tracking-[0.24em] text-gray-500">Showing day</p>
                <h2 className="mt-1 text-2xl font-semibold text-white">{formatDayLabel(currentDay)}</h2>
                <p className="mt-1 text-sm text-gray-400">
                  {currentView === 'diary'
                    ? 'Timeline starts at 10:00 and runs until the last performance ends.'
                    : 'Click a card to expand the show details, description, tags, and individual ticket barcodes.'}
                </p>
              </div>
              <div className="flex flex-col items-stretch gap-3 sm:items-end">
                <div className="inline-flex rounded-xl border border-gray-800 bg-gray-950 p-1">
                  {(['list', 'diary'] as const).map((view) => (
                    <button
                      key={view}
                      type="button"
                      onClick={() => pushParams({ view })}
                      className={`rounded-lg px-4 py-2 text-sm font-medium transition ${currentView === view ? 'bg-green-400 text-gray-950' : 'text-gray-300 hover:text-white'}`}
                    >
                      {view === 'list' ? 'List' : 'Diary'}
                    </button>
                  ))}
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => navigateDay(-1)}
                    disabled={currentDayIndex <= 0}
                    className="rounded-lg border border-gray-700 px-4 py-2 text-sm text-gray-200 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    Previous day
                  </button>
                  <div className="rounded-lg border border-gray-800 bg-gray-950 px-3 py-2 text-sm text-gray-300">
                    {currentDayIndex + 1} / {dayKeys.length}
                  </div>
                  <button
                    type="button"
                    onClick={() => navigateDay(1)}
                    disabled={currentDayIndex < 0 || currentDayIndex >= dayKeys.length - 1}
                    className="rounded-lg border border-gray-700 px-4 py-2 text-sm text-gray-200 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    Next day
                  </button>
                </div>
              </div>
            </div>

            {currentView === 'list' ? (
              <div className="space-y-3">
                {sortedEvents.map((event) => {
                  const when = formatDateTime(event.date)
                  const image = getImageUrl(event.imageThumbnail)
                  const isExpanded = expandedEventKey === event.key

                  return (
                    <div key={event.key} className="overflow-hidden rounded-2xl border border-gray-800 bg-gray-900">
                      <button
                        type="button"
                        onClick={() => setExpandedEventKey(isExpanded ? null : event.key)}
                        className="flex w-full items-center gap-4 p-4 text-left transition hover:bg-gray-900/80"
                      >
                        <div className="h-20 w-20 shrink-0 overflow-hidden rounded-xl bg-gray-800">
                          {image ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={image} alt={event.event} className="h-full w-full object-cover" />
                          ) : (
                            <div className="flex h-full w-full items-center justify-center text-2xl text-gray-600">🎭</div>
                          )}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <h3 className="text-base font-semibold text-white">{event.event}</h3>
                            <span className="rounded-full bg-green-400/10 px-2.5 py-1 text-xs font-medium text-green-300">
                              {event.ticketCount} ticket{event.ticketCount !== 1 ? 's' : ''}
                            </span>
                          </div>
                          <p className="mt-1 text-sm text-green-300">
                            {when.date} at {when.time}
                          </p>
                          <p className="mt-1 text-sm text-gray-400">
                            {event.venue} · {event.subvenue}
                          </p>
                        </div>
                        <span className="text-sm text-gray-400">{isExpanded ? 'v' : '>'}</span>
                      </button>

                      {isExpanded && (
                        <div className="border-t border-gray-800 bg-gray-950/80 p-4">
                          {event.tags.length > 0 && (
                            <div className="mb-4 flex flex-wrap gap-2">
                              {event.tags.map((tag) => (
                                <span key={tag} className="rounded-full border border-gray-700 bg-gray-900 px-3 py-1 text-xs text-gray-300">
                                  {tag}
                                </span>
                              ))}
                            </div>
                          )}

                          {event.description && (
                            <p className="mb-4 text-sm leading-6 text-gray-300">{stripHtml(event.description)}</p>
                          )}

                          <TicketAccordion event={event} expandedTickets={expandedTickets} onToggleTicket={toggleTicket} />
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            ) : (
              <div className="overflow-hidden rounded-2xl border border-gray-800 bg-gray-950">
                <div className="grid grid-cols-[72px_minmax(0,1fr)]">
                  <div className="border-r border-gray-800 bg-gray-900/80" style={{ height: timelineHeight }}>
                    <div className="relative h-full">
                      {timeMarks.map((minutes) => {
                        const top = (minutes - DAY_START_MINUTES) * PIXELS_PER_MINUTE
                        const isHour = minutes % 60 === 0
                        return (
                          <div key={minutes} className="absolute inset-x-0" style={{ top }}>
                            <div className="-translate-y-1/2 pr-3 text-right text-xs text-gray-500">
                              {isHour ? formatTimeLabel(minutes) : ''}
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </div>

                  <div className="relative" style={{ height: timelineHeight }}>
                    {timeMarks.map((minutes) => {
                      const top = (minutes - DAY_START_MINUTES) * PIXELS_PER_MINUTE
                      const isHour = minutes % 60 === 0
                      return (
                        <div
                          key={minutes}
                          className={`pointer-events-none absolute inset-x-0 z-0 border-t ${isHour ? 'border-gray-700' : 'border-gray-800/80'}`}
                          style={{ top }}
                        />
                      )
                    })}

                    {positionedEvents.map((event) => {
                      const colors = getEventColor(event.eventId || event.event)
                      const top = (event.startMinutes - DAY_START_MINUTES) * PIXELS_PER_MINUTE
                      const height = Math.max(
                        MIN_EVENT_MINUTES * PIXELS_PER_MINUTE,
                        (event.endMinutes - event.startMinutes) * PIXELS_PER_MINUTE
                      )
                      const compact = height < 96
                      const ultraCompact = height < 70
                      const width = `calc(${100 / event.columns}% - 8px)`
                      const left = `calc(${(100 / event.columns) * event.column}% + 4px)`

                      return (
                        <button
                          key={event.key}
                          type="button"
                          onClick={() => setSelectedEvent(event)}
                          title={`${event.event}\n${formatTimeLabel(event.startMinutes)} - ${formatTimeLabel(event.endMinutes)} (${event.durationMinutes} min)\n${event.venue} · ${event.subvenue}\n${event.ticketCount} ticket${event.ticketCount !== 1 ? 's' : ''}`}
                          className={`absolute z-10 overflow-hidden rounded-2xl border text-left shadow-lg shadow-black/25 transition hover:-translate-y-0.5 hover:shadow-xl ${compact ? 'p-2' : 'p-3'}`}
                          style={{
                            top: `${top}px`,
                            left,
                            width,
                            height: `${height}px`,
                            backgroundColor: colors.background,
                            borderColor: colors.border,
                          }}
                        >
                          <div className={`flex h-full flex-col text-white ${compact ? 'gap-0.5' : 'gap-1'}`}>
                            <div className="flex items-start justify-between gap-2">
                              <span className={`font-semibold uppercase text-white/75 ${ultraCompact ? 'text-[10px] tracking-[0.14em]' : 'text-[11px] tracking-[0.18em]'}`}>
                                {formatTimeLabel(event.startMinutes)} - {formatTimeLabel(event.endMinutes)}
                              </span>
                              {!ultraCompact && <span className="text-xs text-white/85">{event.durationMinutes} min</span>}
                            </div>

                            <h3 className={`font-semibold leading-tight ${compact ? 'line-clamp-1 text-xs' : 'line-clamp-2 text-sm'}`}>
                              {event.event}
                            </h3>

                            {!compact && <p className="line-clamp-1 text-xs text-white/85">{event.venue} · {event.subvenue}</p>}

                            <div className={`text-xs text-white/95 ${compact ? '' : 'mt-auto'}`}>
                              {event.ticketCount} ticket{event.ticketCount !== 1 ? 's' : ''}
                            </div>
                          </div>
                        </button>
                      )
                    })}
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </main>

      {selectedEvent && (
        <DiaryModal
          event={selectedEvent}
          expandedTickets={expandedTickets}
          onClose={() => setSelectedEvent(null)}
          onToggleTicket={toggleTicket}
        />
      )}
    </div>
  )
}

function PurchasesFallback() {
  return (
    <div className="min-h-screen flex-1 bg-gray-950 text-gray-100">
      <header className="border-b border-gray-800 bg-gray-950">
        <div className="mx-auto max-w-7xl px-4 py-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h1 className="text-2xl font-bold text-gray-100">My Tickets</h1>
              <p className="text-sm text-gray-400">Loading your purchases...</p>
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

      <main className="mx-auto max-w-7xl px-4 py-6">
        <div className="flex items-center gap-3 py-12 text-sm text-gray-400">
          <div className="h-4 w-4 animate-spin rounded-full border-2 border-gray-700 border-t-green-400" />
          Loading your tickets...
        </div>
      </main>
    </div>
  )
}

export default function PurchasesPage() {
  return (
    <Suspense fallback={<PurchasesFallback />}>
      <PurchasesPageContent />
    </Suspense>
  )
}
