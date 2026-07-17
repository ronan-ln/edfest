'use client'

import Link from 'next/link'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { Suspense, useEffect, useMemo, useState } from 'react'

const DAY_START_MINUTES = 10 * 60
const MIN_EVENT_MINUTES = 30
const DEFAULT_EVENT_MINUTES = 60
const PIXELS_PER_MINUTE = 1.35
const UNASSIGNED_FILTER = '__unassigned__'

type ViewMode = 'list' | 'diary'

interface TicketItem {
  ticketId: number
  barcode: string
  barcodeURL: string
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
  performanceId: string
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

interface PlannerAssignee {
  id: number
  name: string
}

interface PlannerTicket {
  id: number
  assigneeName: string | null
  barcode: string | null
  barcodeUrl: string | null
  sourceFirstName: string
  sourceColor: string
}

interface PlannerPerformance {
  performanceId: string
  eventName: string
  eventSlug: string | null
  venue: string | null
  subvenue: string | null
  datetime: string
  tickets: PlannerTicket[]
}

interface AssignmentCount {
  name: string
  count: number
}

interface OwnerCount {
  name: string
  count: number
  color: string
}

interface OwnerStyle {
  name: string
  background: string
  border: string
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

function ownerStyleFromColor(ownerName: string, color: string): OwnerStyle {
  // sourceColor already comes from planner (hsla), keep it as the visual base.
  return {
    name: ownerName,
    background: color,
    border: color,
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

function parseAssigneeParam(raw: string): string[] {
  const value = raw.trim()
  if (!value) return []

  const unique: string[] = []
  const seen = new Set<string>()
  for (const part of value.split(',')) {
    const name = part.trim()
    if (!name) continue
    const normalized = name.toLowerCase()
    if (seen.has(normalized)) continue
    seen.add(normalized)
    unique.push(name)
  }
  return unique
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

function TicketAssignModal({
  event,
  plannerTickets,
  assigneeOptions,
  draftByTicket,
  busy,
  error,
  onTicketChange,
  onSave,
  onClearAll,
  onClose,
}: {
  event: FlatEvent
  plannerTickets: PlannerTicket[]
  assigneeOptions: PlannerAssignee[]
  draftByTicket: Record<number, string>
  busy: boolean
  error: string | null
  onTicketChange: (ticketId: number, value: string) => void
  onSave: () => void
  onClearAll: () => void
  onClose: () => void
}) {
  const assignableCount = plannerTickets.length
  const assignedCount = plannerTickets.filter((ticket) => (draftByTicket[ticket.id] || '').trim()).length
  const canSave = assignableCount > 0 && !busy
  const canClear = assignableCount > 0 && !busy

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm" onClick={onClose}>
      <div
        className="w-full max-w-lg rounded-2xl border border-gray-800 bg-gray-950 p-5 shadow-2xl"
        onClick={(eventClick) => eventClick.stopPropagation()}
      >
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <p className="text-xs uppercase tracking-[0.2em] text-gray-500">Assign tickets</p>
            <h3 className="mt-1 text-lg font-semibold text-white">{event.event}</h3>
            <p className="mt-1 text-sm text-gray-400">
              {formatDateTime(event.date).date} at {formatDateTime(event.date).time} · {event.venue}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full border border-gray-700 px-3 py-1 text-xs text-gray-300 hover:border-gray-500 hover:text-white"
          >
            Close
          </button>
        </div>

        <div className="rounded-xl border border-gray-800 bg-gray-900 p-3">
          <p className="text-sm text-gray-300">
            {assignableCount > 0
              ? `${assignableCount} planner ticket${assignableCount !== 1 ? 's' : ''} available for assignment.`
              : 'This performance is not imported into the scheduler yet. Use Import shows on the scheduler page first.'}
          </p>
          <p className="mt-1 text-xs text-gray-500">
            {assignedCount > 0 ? `${assignedCount} ticket${assignedCount !== 1 ? 's are' : ' is'} assigned in this draft.` : 'No tickets assigned in this draft.'}
          </p>
        </div>

        <div className="mt-4 space-y-3">
          <label className="text-sm text-gray-300">Assign each ticket</label>
          <datalist id="assignment-user-options">
            {assigneeOptions.map((assignee) => (
              <option key={assignee.id} value={assignee.name} />
            ))}
          </datalist>

          {plannerTickets.map((ticket, index) => (
            <div key={ticket.id} className="rounded-lg border border-gray-800 bg-gray-900 p-3">
              <p className="mb-2 text-xs uppercase tracking-[0.15em] text-gray-500">Ticket {index + 1}</p>
              <input
                value={draftByTicket[ticket.id] || ''}
                onChange={(e) => onTicketChange(ticket.id, e.target.value)}
                list="assignment-user-options"
                placeholder="Select or type a user (empty = unassigned)"
                className="w-full rounded-lg border border-gray-700 bg-gray-950 px-3 py-2 text-sm text-gray-100 focus:border-green-400 focus:outline-none"
              />
            </div>
          ))}
        </div>

        {error && (
          <div className="mt-3 rounded-lg border border-red-900/50 bg-red-950/40 px-3 py-2 text-sm text-red-300">
            {error}
          </div>
        )}

        <div className="mt-4 flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={onSave}
            disabled={!canSave}
            className="rounded-lg bg-green-400 px-4 py-2 text-sm font-semibold text-gray-950 hover:bg-green-300 disabled:opacity-50"
          >
            {busy ? 'Saving...' : 'Save assignments'}
          </button>
          <button
            type="button"
            onClick={onClearAll}
            disabled={!canClear}
            className="rounded-lg border border-gray-700 bg-gray-900 px-4 py-2 text-sm text-gray-200 hover:border-gray-500 disabled:opacity-50"
          >
            Clear all
          </button>
        </div>
      </div>
    </div>
  )
}

function AssignedQrModal({
  event,
  assigneeName,
  tickets,
  onClose,
}: {
  event: FlatEvent
  assigneeName: string
  tickets: PlannerTicket[]
  onClose: () => void
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm" onClick={onClose}>
      <div
        className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-gray-800 bg-gray-950 p-5 shadow-2xl"
        onClick={(eventClick) => eventClick.stopPropagation()}
      >
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <p className="text-xs uppercase tracking-[0.2em] text-gray-500">Assigned ticket QR codes</p>
            <h3 className="mt-1 text-lg font-semibold text-white">{event.event}</h3>
            <p className="mt-1 text-sm text-gray-400">
              {assigneeName} · {tickets.length} ticket{tickets.length !== 1 ? 's' : ''}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full border border-gray-700 px-3 py-1 text-xs text-gray-300 hover:border-gray-500 hover:text-white"
          >
            Close
          </button>
        </div>

        <div className="space-y-3">
          {tickets.map((ticket, index) => (
            <div key={ticket.id} className="overflow-hidden rounded-xl border border-gray-800 bg-gray-900">
              <div className="border-b border-gray-800 px-4 py-2 text-sm text-gray-200">
                Ticket {index + 1}
              </div>
              <div className="bg-white px-4 py-4 text-center">
                {ticket.barcodeUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={ticket.barcodeUrl}
                    alt={`Assigned barcode for ${assigneeName} ticket ${index + 1}`}
                    className="mx-auto h-auto w-full max-w-[260px]"
                  />
                ) : (
                  <p className="text-sm text-gray-500">No QR available for this ticket.</p>
                )}
                {ticket.barcode && <p className="mt-3 font-mono text-xs text-gray-500">{ticket.barcode}</p>}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

function ImportShowsModal({
  cookie,
  onCookieChange,
  connected,
  firstName,
  showCount,
  connectBusy,
  busy,
  error,
  onConnect,
  onImport,
  onClose,
}: {
  cookie: string
  onCookieChange: (value: string) => void
  connected: boolean
  firstName: string
  showCount: number
  connectBusy: boolean
  busy: boolean
  error: string | null
  onConnect: () => void
  onImport: () => void
  onClose: () => void
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm" onClick={onClose}>
      <div
        className="w-full max-w-xl rounded-2xl border border-gray-800 bg-gray-950 p-5 shadow-2xl"
        onClick={(eventClick) => eventClick.stopPropagation()}
      >
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <p className="text-xs uppercase tracking-[0.2em] text-gray-500">Import shows</p>
            <h3 className="mt-1 text-lg font-semibold text-white">Load shows from edfest account</h3>
            <p className="mt-1 text-sm text-gray-400">
              Paste a cookie and import. Imported shows/tickets are saved in the backend scheduler database.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full border border-gray-700 px-3 py-1 text-xs text-gray-300 hover:border-gray-500 hover:text-white"
          >
            Close
          </button>
        </div>

        {!connected && (
          <>
            <label className="mb-2 block text-sm text-gray-300">edfest cookie</label>
            <textarea
              value={cookie}
              onChange={(e) => onCookieChange(e.target.value)}
              placeholder="Paste full Cookie header value"
              className="h-28 w-full resize-none rounded-lg border border-gray-700 bg-gray-900 p-3 font-mono text-xs text-gray-100 focus:border-green-400 focus:outline-none"
            />
          </>
        )}

        {connected && (
          <div className="rounded-lg border border-green-900/50 bg-green-950/30 px-3 py-2 text-sm text-green-300">
            Connected as {firstName || 'Unknown'} · {showCount} future show{showCount !== 1 ? 's' : ''} found
          </div>
        )}

        {error && (
          <div className="mt-3 rounded-lg border border-red-900/50 bg-red-950/30 px-3 py-2 text-sm text-red-300">
            {error}
          </div>
        )}

        <div className="mt-4 flex items-center gap-2">
          {!connected && (
            <button
              type="button"
              onClick={onConnect}
              disabled={!cookie.trim() || connectBusy}
              className="rounded-lg border border-gray-700 bg-gray-900 px-4 py-2 text-sm font-semibold text-gray-100 hover:border-green-400 hover:text-green-300 disabled:opacity-50"
            >
              {connectBusy ? 'Connecting...' : 'Connect'}
            </button>
          )}
          <button
            type="button"
            onClick={onImport}
            disabled={!connected || busy}
            className="rounded-lg bg-green-400 px-4 py-2 text-sm font-semibold text-gray-950 hover:bg-green-300 disabled:opacity-50"
          >
            {busy ? 'Importing...' : 'Import and save'}
          </button>
        </div>
      </div>
    </div>
  )
}

function PurchasesPageContent() {
  const pathname = usePathname()
  const router = useRouter()
  const searchParams = useSearchParams()
  const [events, setEvents] = useState<FlatEvent[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selectedEvent, setSelectedEvent] = useState<FlatEvent | null>(null)
  const [expandedEventKey, setExpandedEventKey] = useState<string | null>(null)
  const [expandedTickets, setExpandedTickets] = useState<Record<string, boolean>>({})
  const [plannerAssignees, setPlannerAssignees] = useState<PlannerAssignee[]>([])
  const [plannerByPerformance, setPlannerByPerformance] = useState<Record<string, PlannerPerformance>>({})
  const [assignTarget, setAssignTarget] = useState<FlatEvent | null>(null)
  const [assignDraft, setAssignDraft] = useState<Record<number, string>>({})
  const [assignBusy, setAssignBusy] = useState(false)
  const [assignError, setAssignError] = useState<string | null>(null)
  const [qrTarget, setQrTarget] = useState<{ event: FlatEvent; assigneeName: string } | null>(null)
  const [copiedAssigneeName, setCopiedAssigneeName] = useState<string | null>(null)
  const [showImportModal, setShowImportModal] = useState(false)
  const [importCookie, setImportCookie] = useState('')
  const [importConnected, setImportConnected] = useState(false)
  const [importConnectBusy, setImportConnectBusy] = useState(false)
  const [importFirstName, setImportFirstName] = useState('')
  const [importShowCount, setImportShowCount] = useState(0)
  const [importBusy, setImportBusy] = useState(false)
  const [importError, setImportError] = useState<string | null>(null)
  const assigneeParam = searchParams.get('assignee') || ''
  const selectedAssignees = parseAssigneeParam(assigneeParam)
  const selectedAssigneeSet = new Set(selectedAssignees.map((name) => name.toLowerCase()))

  function getAssignmentCounts(performanceId: string): AssignmentCount[] {
    const performance = plannerByPerformance[performanceId]
    if (!performance) return []

    const counts = new Map<string, number>()
    for (const ticket of performance.tickets) {
      if (!ticket.assigneeName) continue
      counts.set(ticket.assigneeName, (counts.get(ticket.assigneeName) || 0) + 1)
    }

    return Array.from(counts.entries())
      .map(([name, count]) => ({ name, count }))
      .sort((left, right) => left.name.localeCompare(right.name))
  }

  function getOwnerCounts(performanceId: string): OwnerCount[] {
    const performance = plannerByPerformance[performanceId]
    if (!performance) return []

    const counts = new Map<string, OwnerCount>()
    for (const ticket of performance.tickets) {
      const current = counts.get(ticket.sourceFirstName)
      if (current) {
        current.count += 1
      } else {
        counts.set(ticket.sourceFirstName, {
          name: ticket.sourceFirstName,
          count: 1,
          color: ticket.sourceColor,
        })
      }
    }

    return Array.from(counts.values()).sort((left, right) => left.name.localeCompare(right.name))
  }

  function getPrimaryOwnerStyle(performanceId: string, seed: string): OwnerStyle {
    const owners = getOwnerCounts(performanceId)
    if (owners.length === 0) {
      const fallback = getEventColor(seed)
      return {
        name: 'Unknown',
        background: fallback.background,
        border: fallback.border,
      }
    }

    const dominant = owners.reduce((best, current) => {
      if (current.count > best.count) return current
      return best
    }, owners[0])

    return ownerStyleFromColor(dominant.name, dominant.color)
  }

  function getAssignedTickets(performanceId: string, assigneeName: string): PlannerTicket[] {
    const performance = plannerByPerformance[performanceId]
    if (!performance) return []
    const normalized = assigneeName.trim().toLowerCase()
    return performance.tickets.filter(
      (ticket) => (ticket.assigneeName || '').trim().toLowerCase() === normalized
    )
  }

  function isAssigneeSelected(name: string): boolean {
    if (selectedAssignees.length === 0) return false
    const normalized = name.trim().toLowerCase()
    return selectedAssignees.some((value) => value.trim().toLowerCase() === normalized)
  }

  function getUnassignedTicketCount(event: FlatEvent): number {
    const performance = plannerByPerformance[event.performanceId]
    if (!performance) return event.ticketCount
    return performance.tickets.filter((ticket) => !(ticket.assigneeName || '').trim()).length
  }

  function openAssignModal(event: FlatEvent) {
    setAssignError(null)
    const nextDraft: Record<number, string> = {}
    for (const ticket of plannerByPerformance[event.performanceId]?.tickets || []) {
      nextDraft[ticket.id] = ticket.assigneeName || ''
    }
    setAssignDraft(nextDraft)
    setAssignTarget(event)
  }

  function updateAssigneeFilter(next: string[]) {
    const params = new URLSearchParams(searchParams.toString())
    if (next.length === 0) {
      params.delete('assignee')
    } else {
      params.set('assignee', next.join(','))
    }
    const targetPath = pathname || '/purchases'
    router.replace(`${targetPath}?${params.toString()}`, { scroll: false })
  }

  function toggleAssigneeFilter(name: string) {
    const exists = selectedAssignees.some((value) => value.toLowerCase() === name.toLowerCase())
    if (exists) {
      updateAssigneeFilter(selectedAssignees.filter((value) => value.toLowerCase() !== name.toLowerCase()))
      return
    }
    updateAssigneeFilter([...selectedAssignees, name])
  }

  function buildPersonalizedUrl(assigneeName: string): string {
    const params = new URLSearchParams(searchParams.toString())
    params.set('assignee', assigneeName)
    const targetPath = pathname || '/purchases'
    const query = params.toString()
    return `${window.location.origin}${targetPath}${query ? `?${query}` : ''}`
  }

  async function copyPersonalizedUrl(assigneeName: string) {
    const url = buildPersonalizedUrl(assigneeName)
    let copied = false
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(url)
        copied = true
      }
    } catch {
      copied = false
    }

    if (!copied) {
      const textArea = document.createElement('textarea')
      textArea.value = url
      textArea.setAttribute('readonly', '')
      textArea.style.position = 'fixed'
      textArea.style.top = '-1000px'
      textArea.style.left = '-1000px'
      document.body.appendChild(textArea)
      textArea.select()
      copied = document.execCommand('copy')
      document.body.removeChild(textArea)
    }

    if (copied) {
      setCopiedAssigneeName(assigneeName)
      window.setTimeout(() => {
        setCopiedAssigneeName((current) => (current === assigneeName ? null : current))
      }, 1800)
    } else {
      setCopiedAssigneeName(null)
    }
  }

  async function loadPlannerData() {
    const [assigneesRes, performancesRes] = await Promise.all([
      fetch('/api/planner/assignees', { cache: 'no-store' }),
      fetch('/api/planner/performances', { cache: 'no-store' }),
    ])

    const assigneesData = await assigneesRes.json() as { assignees?: PlannerAssignee[] }
    const performancesData = await performancesRes.json() as { performances?: PlannerPerformance[] }

    setPlannerAssignees(assigneesData.assignees || [])
    const index: Record<string, PlannerPerformance> = {}
    for (const performance of performancesData.performances || []) {
      index[performance.performanceId] = performance
    }
    setPlannerByPerformance(index)
  }

  async function loadSchedulerData() {
    setLoading(true)
    setError(null)
    try {
      const [offers, assigneesData, performancesData] = await Promise.all([
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
        fetch('/api/planner/assignees', { cache: 'no-store' }).then((response) =>
          response.json() as Promise<{ assignees?: PlannerAssignee[] }>
        ),
        fetch('/api/planner/performances', { cache: 'no-store' }).then((response) =>
          response.json() as Promise<{ performances?: PlannerPerformance[] }>
        ),
      ])

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

        const plannerPerformances = performancesData.performances || []
        const flat: FlatEvent[] = []

        for (const perf of plannerPerformances) {
          const startAt = parseDate(perf.datetime)
          const meta = offersMap.get(normalizeName(perf.eventName))
          const durationMinutes = meta?.durationMinutes ?? DEFAULT_EVENT_MINUTES
          const startMinutes = startAt.getHours() * 60 + startAt.getMinutes()
          const ticketItems = (perf.tickets || []).map((ticket) => ({
            ticketId: ticket.id,
            barcode: ticket.barcode || `ticket-${ticket.id}`,
            barcodeURL: ticket.barcodeUrl || '',
          }))

          flat.push({
            key: `${perf.performanceId}-${perf.datetime}`,
            performanceId: perf.performanceId,
            event: perf.eventName,
            eventId: perf.eventSlug || perf.performanceId,
            venue: perf.venue || 'Unknown venue',
            subvenue: perf.subvenue || '',
            date: perf.datetime,
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

        flat.sort((left, right) => parseDate(left.date).getTime() - parseDate(right.date).getTime())
        setEvents(flat)
        setPlannerAssignees(assigneesData.assignees || [])
        const index: Record<string, PlannerPerformance> = {}
        for (const performance of performancesData.performances || []) {
          index[performance.performanceId] = performance
        }
        setPlannerByPerformance(index)
        setLoading(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load scheduler data')
      setLoading(false)
    }
  }

  useEffect(() => {
    void Promise.resolve().then(() => loadSchedulerData())
  }, [])

  async function importShows() {
    if (!importConnected) {
      setImportError('Connect first before importing.')
      return
    }

    const cookie = importCookie.trim()
    if (!cookie) {
      setImportError('Cookie is required to import.')
      return
    }

    setImportBusy(true)
    setImportError(null)
    try {
      const res = await fetch('/api/planner/import', {
        method: 'POST',
        headers: {
          'x-edfest-cookie': cookie,
        },
      })
      const data = await res.json() as {
        error?: string
        importedTickets?: number
        importedPerformances?: number
        source?: { first_name?: string }
      }

      if (!res.ok) {
        throw new Error(data.error || 'Import failed')
      }
      await loadSchedulerData()
      setShowImportModal(false)
      setImportConnected(false)
      setImportFirstName('')
      setImportShowCount(0)
      setImportError(null)
    } catch (err) {
      setImportError(err instanceof Error ? err.message : 'Import failed')
    } finally {
      setImportBusy(false)
    }
  }

  async function connectImportSource() {
    const cookie = importCookie.trim()
    if (!cookie) {
      setImportError('Cookie is required to connect.')
      return
    }

    setImportConnectBusy(true)
    setImportError(null)
    try {
      const [userRes, purchasesRes] = await Promise.all([
        fetch('/api/user', {
          headers: { 'x-edfest-cookie': cookie },
          cache: 'no-store',
        }),
        fetch('/api/purchases', {
          headers: { 'x-edfest-cookie': cookie },
          cache: 'no-store',
        }),
      ])

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
      const purchasesData = await purchasesRes.json() as {
        purchases?: Array<{
          performances?: Array<{
            event?: string
            date?: string
          }>
        }>
      }

      if (!userRes.ok || !purchasesRes.ok) {
        throw new Error('Cookie rejected. Please check and try again.')
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
      const now = Date.now()
      const futureShowNames = new Set<string>()

      for (const purchase of purchasesData.purchases || []) {
        for (const performance of purchase.performances || []) {
          const eventName = (performance.event || '').trim()
          const dateRaw = (performance.date || '').trim()
          if (!eventName || !dateRaw) continue
          const parsed = new Date(dateRaw.replace(' ', 'T'))
          if (Number.isNaN(parsed.getTime())) continue
          if (parsed.getTime() <= now) continue
          futureShowNames.add(eventName.toLowerCase())
        }
      }

      setImportFirstName(firstName)
      setImportShowCount(futureShowNames.size)
      setImportConnected(true)
    } catch (err) {
      setImportConnected(false)
      setImportFirstName('')
      setImportShowCount(0)
      setImportError(err instanceof Error ? err.message : 'Failed to connect')
    } finally {
      setImportConnectBusy(false)
    }
  }

  const assigneeFilterOptions = useMemo(() => {
    const names = new Set<string>()
    for (const performance of Object.values(plannerByPerformance)) {
      for (const ticket of performance.tickets) {
        if (ticket.assigneeName) names.add(ticket.assigneeName)
      }
    }
    return Array.from(names).sort((left, right) => left.localeCompare(right))
  }, [plannerByPerformance])

  const hasUnassignedTickets = useMemo(
    () =>
      Object.values(plannerByPerformance).some((performance) =>
        performance.tickets.some((ticket) => !(ticket.assigneeName || '').trim())
      ),
    [plannerByPerformance]
  )

  const visibleEvents = selectedAssigneeSet.size === 0
    ? events
    : events.filter((event) => {
      const performance = plannerByPerformance[event.performanceId]
      if (!performance) return false
      const includeUnassigned = selectedAssigneeSet.has(UNASSIGNED_FILTER)
      return performance.tickets.some((ticket) => {
        const name = (ticket.assigneeName || '').trim().toLowerCase()
        if (!name) return includeUnassigned
        return selectedAssigneeSet.has(name)
      })
    })

  const dayKeys = useMemo(() => Array.from(new Set(visibleEvents.map((event) => event.dayKey))), [visibleEvents])
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
      const targetPath = pathname || '/purchases'
      router.replace(`${targetPath}?${params.toString()}`, { scroll: false })
    }
  }, [currentView, dayKeys, pathname, router, searchParams])

  const eventsByDay = useMemo(() => {
    const grouped = new Map<string, FlatEvent[]>()
    for (const event of visibleEvents) {
      const current = grouped.get(event.dayKey)
      if (current) {
        current.push(event)
      } else {
        grouped.set(event.dayKey, [event])
      }
    }
    return grouped
  }, [visibleEvents])

  const requestedDay = searchParams.get('day')
  const currentDay = requestedDay && dayKeys.includes(requestedDay) ? requestedDay : dayKeys[0] ?? null
  const currentDayIndex = currentDay ? dayKeys.indexOf(currentDay) : -1
  const sortedEvents = useMemo(() => [...visibleEvents], [visibleEvents])
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
    const targetPath = pathname || '/purchases'
    router.push(`${targetPath}?${params.toString()}`, { scroll: false })
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

  async function assignTargetTickets() {
    if (!assignTarget) return
    const plannerPerf = plannerByPerformance[assignTarget.performanceId]
    const tickets = plannerPerf?.tickets || []
    if (tickets.length === 0) {
      setAssignError('This performance has no imported planner tickets yet.')
      return
    }
    const groups = new Map<string, number[]>()
    const unassignIds: number[] = []

    for (const ticket of tickets) {
      const nextName = (assignDraft[ticket.id] || '').trim()
      const currentName = (ticket.assigneeName || '').trim()

      if (!nextName && !currentName) continue
      if (!nextName && currentName) {
        unassignIds.push(ticket.id)
        continue
      }
      if (nextName && currentName && nextName.toLowerCase() === currentName.toLowerCase()) {
        continue
      }

      const list = groups.get(nextName) || []
      list.push(ticket.id)
      groups.set(nextName, list)
    }

    if (groups.size === 0 && unassignIds.length === 0) {
      setAssignTarget(null)
      setAssignDraft({})
      return
    }

    setAssignBusy(true)
    setAssignError(null)
    try {
      const calls: Promise<void>[] = []

      if (unassignIds.length > 0) {
        calls.push(
          fetch('/api/planner/assignments', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({
              ticketIds: unassignIds,
              unassign: true,
            }),
          }).then(async (res) => {
            const data = await res.json() as { error?: string }
            if (!res.ok) throw new Error(data.error || 'failed to unassign tickets')
          })
        )
      }

      for (const [name, ticketIds] of groups.entries()) {
        calls.push(
          fetch('/api/planner/assignments', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({
              ticketIds,
              assigneeName: name,
            }),
          }).then(async (res) => {
            const data = await res.json() as { error?: string }
            if (!res.ok) throw new Error(data.error || 'failed to assign tickets')
          })
        )
      }

      await Promise.all(calls)

      await loadPlannerData()
      setAssignTarget(null)
      setAssignDraft({})
    } catch (err) {
      setAssignError(err instanceof Error ? err.message : 'failed to assign tickets')
    } finally {
      setAssignBusy(false)
    }
  }

  async function clearTargetAssignments() {
    if (!assignTarget) return
    const plannerPerf = plannerByPerformance[assignTarget.performanceId]
    const ticketIds = plannerPerf?.tickets.map((ticket) => ticket.id) || []
    if (ticketIds.length === 0) {
      setAssignError('This performance has no imported planner tickets yet.')
      return
    }

    setAssignBusy(true)
    setAssignError(null)
    try {
      const res = await fetch('/api/planner/assignments', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          ticketIds,
          unassign: true,
        }),
      })
      const data = await res.json() as { error?: string }
      if (!res.ok) {
        throw new Error(data.error || 'failed to clear assignments')
      }

      await loadPlannerData()
      setAssignTarget(null)
      setAssignDraft({})
    } catch (err) {
      setAssignError(err instanceof Error ? err.message : 'failed to clear assignments')
    } finally {
      setAssignBusy(false)
    }
  }

  return (
    <div className="min-h-screen flex-1 bg-gray-950 text-gray-100">
      <header className="border-b border-gray-800 bg-gray-950">
        <div className="mx-auto max-w-7xl px-4 py-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h1 className="text-2xl font-bold text-gray-100">My Tickets</h1>
              <p className="text-sm text-gray-400">
                {visibleEvents.length} visible performance{visibleEvents.length !== 1 ? 's' : ''} across {dayKeys.length} day{dayKeys.length !== 1 ? 's' : ''}
              </p>
            </div>
            <button
              type="button"
              onClick={() => {
                setShowImportModal(true)
                setImportConnected(false)
                setImportFirstName('')
                setImportShowCount(0)
                setImportError(null)
              }}
              className="rounded-lg border border-gray-700 bg-gray-900 px-4 py-2 text-sm font-medium text-gray-200 hover:border-green-400 hover:text-green-400"
            >
              Import shows
            </button>
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

        {!loading && !error && visibleEvents.length === 0 && (
          <div className="rounded-lg border border-gray-800 bg-gray-900 p-8 text-center text-sm text-gray-400">
            No events match your selected assignee filters.
          </div>
        )}

        {!loading && !error && visibleEvents.length > 0 && currentDay && (
          <div className="space-y-6">
            {(assigneeFilterOptions.length > 0 || hasUnassignedTickets) && (
              <div className="rounded-2xl border border-gray-800 bg-gray-900/80 p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs uppercase tracking-[0.18em] text-gray-500">Assignee filters</span>
                  <button
                    type="button"
                    onClick={() => updateAssigneeFilter([])}
                    className={`rounded-full px-3 py-1 text-xs font-medium ${selectedAssignees.length === 0 ? 'bg-green-400 text-gray-950' : 'bg-gray-800 text-gray-300 hover:bg-gray-700'}`}
                  >
                    All
                  </button>
                  <button
                    type="button"
                    onClick={() => toggleAssigneeFilter(UNASSIGNED_FILTER)}
                    className={`rounded-full px-3 py-1 text-xs font-medium ${selectedAssigneeSet.has(UNASSIGNED_FILTER) ? 'bg-green-400 text-gray-950' : 'bg-gray-800 text-gray-300 hover:bg-gray-700'}`}
                  >
                    Unassigned
                  </button>
                  {assigneeFilterOptions.map((name) => {
                    const active = selectedAssignees.some((value) => value.toLowerCase() === name.toLowerCase())
                    return (
                      <div key={name} className="inline-flex items-center overflow-hidden rounded-full">
                        <button
                          type="button"
                          onClick={() => toggleAssigneeFilter(name)}
                          className={`px-3 py-1 text-xs font-medium ${active ? 'bg-green-400 text-gray-950' : 'bg-gray-800 text-gray-300 hover:bg-gray-700'}`}
                        >
                          {name}
                        </button>
                        <button
                          type="button"
                          onClick={() => void copyPersonalizedUrl(name)}
                          className={`px-2 py-1 text-xs font-semibold ${copiedAssigneeName === name ? 'bg-green-300 text-gray-950' : active ? 'bg-green-300/90 text-gray-900 hover:bg-green-200' : 'bg-gray-700 text-gray-200 hover:bg-gray-600'}`}
                          title={copiedAssigneeName === name ? `Copied link for ${name}` : `Copy assigned-shows link for ${name}`}
                        >
                          <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M10 14a5 5 0 0 1 0-7l2-2a5 5 0 0 1 7 7l-1.5 1.5" />
                            <path d="M14 10a5 5 0 0 1 0 7l-2 2a5 5 0 0 1-7-7L6.5 10.5" />
                          </svg>
                        </button>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

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
                    : 'Click a card to expand details. Click the tickets bubble to assign users.'}
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
                  const assignmentCounts = getAssignmentCounts(event.performanceId)
                  const unassignedTicketCount = getUnassignedTicketCount(event)
                  const ownerStyle = getPrimaryOwnerStyle(event.performanceId, event.eventId || event.event)

                  return (
                    <div
                      key={event.key}
                      className="overflow-hidden rounded-2xl border"
                      style={{
                        borderColor: ownerStyle.border,
                        backgroundColor: ownerStyle.background,
                      }}
                    >
                      <button
                        type="button"
                        onClick={() => setExpandedEventKey(isExpanded ? null : event.key)}
                        className="flex w-full items-center gap-4 p-4 text-left transition hover:bg-black/15"
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
                            {unassignedTicketCount > 0 && (
                              <span
                                className="rounded-full bg-green-400/10 px-2.5 py-1 text-xs font-medium text-green-300 hover:bg-green-400/20"
                              >
                                {unassignedTicketCount} ticket{unassignedTicketCount !== 1 ? 's' : ''}
                              </span>
                            )}
                            <button
                              type="button"
                              onClick={(eventClick) => {
                                eventClick.stopPropagation()
                                openAssignModal(event)
                              }}
                              className="rounded-full border border-white/20 bg-black/20 px-2.5 py-1 text-xs font-medium text-white/90 hover:bg-black/30"
                            >
                              Assign
                            </button>
                            {assignmentCounts.length > 0 && (
                              <div className="flex flex-wrap items-center gap-1">
                                <span className="text-xs text-blue-200/90">Assigned:</span>
                                {assignmentCounts.map((entry) => (
                                  isAssigneeSelected(entry.name) ? (
                                  <button
                                    key={entry.name}
                                    type="button"
                                    onClick={(eventClick) => {
                                      eventClick.stopPropagation()
                                      setQrTarget({ event, assigneeName: entry.name })
                                    }}
                                    className="rounded-full bg-blue-400/15 px-2 py-0.5 text-xs font-medium text-blue-200 hover:bg-blue-400/25"
                                  >
                                    {entry.name} ({entry.count})
                                  </button>
                                  ) : (
                                  <span
                                    key={entry.name}
                                    className="rounded-full bg-blue-400/10 px-2 py-0.5 text-xs font-medium text-blue-200/70"
                                  >
                                    {entry.name} ({entry.count})
                                  </span>
                                  )
                                ))}
                              </div>
                            )}
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
                      const ownerStyle = getPrimaryOwnerStyle(event.performanceId, event.eventId || event.event)
                      const top = (event.startMinutes - DAY_START_MINUTES) * PIXELS_PER_MINUTE
                      const height = Math.max(
                        MIN_EVENT_MINUTES * PIXELS_PER_MINUTE,
                        (event.endMinutes - event.startMinutes) * PIXELS_PER_MINUTE
                      )
                      const compact = height < 96
                      const ultraCompact = height < 70
                      const width = `calc(${100 / event.columns}% - 8px)`
                      const left = `calc(${(100 / event.columns) * event.column}% + 4px)`

                      const assignmentCounts = getAssignmentCounts(event.performanceId)
                      const ownerCounts = getOwnerCounts(event.performanceId)
                      const unassignedTicketCount = getUnassignedTicketCount(event)

                      return (
                        <div
                          key={event.key}
                          role="button"
                          tabIndex={0}
                          onClick={() => setSelectedEvent(event)}
                          onKeyDown={(eventKey) => {
                            if (eventKey.key === 'Enter' || eventKey.key === ' ') {
                              eventKey.preventDefault()
                              setSelectedEvent(event)
                            }
                          }}
                          title={`${event.event}\n${formatTimeLabel(event.startMinutes)} - ${formatTimeLabel(event.endMinutes)} (${event.durationMinutes} min)\n${event.venue} · ${event.subvenue}`}
                          className={`absolute z-10 cursor-pointer overflow-hidden rounded-2xl border text-left shadow-lg shadow-black/25 transition hover:-translate-y-0.5 hover:shadow-xl focus:outline-none focus:ring-2 focus:ring-green-400/60 ${compact ? 'p-2' : 'p-3'}`}
                          style={{
                            top: `${top}px`,
                            left,
                            width,
                            height: `${height}px`,
                            backgroundColor: ownerStyle.background,
                            borderColor: ownerStyle.border,
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

                            {!compact && ownerCounts.length > 0 && (
                              <div className="flex flex-wrap gap-1 text-[10px]">
                                {ownerCounts.map((owner) => (
                                  <span
                                    key={owner.name}
                                    className="rounded-full px-2 py-0.5 font-medium text-white"
                                    style={{ backgroundColor: owner.color }}
                                  >
                                    {owner.name} ({owner.count})
                                  </span>
                                ))}
                              </div>
                            )}

                            <div className={`mt-auto flex flex-wrap items-center gap-1 text-xs text-white/95`}>
                              {unassignedTicketCount > 0 && (
                                <span
                                  className="rounded-full border border-white/35 bg-black/25 px-2 py-0.5 font-medium text-white hover:bg-black/35"
                                >
                                  {unassignedTicketCount} ticket{unassignedTicketCount !== 1 ? 's' : ''}
                                </span>
                              )}
                              <button
                                type="button"
                                onClick={(eventClick) => {
                                  eventClick.stopPropagation()
                                  openAssignModal(event)
                                }}
                                className="rounded-full border border-white/35 bg-black/20 px-2 py-0.5 font-medium text-white hover:bg-black/35"
                              >
                                Assign
                              </button>
                              {assignmentCounts.map((entry) => (
                                isAssigneeSelected(entry.name) ? (
                                  <button
                                    key={entry.name}
                                    type="button"
                                    onClick={(eventClick) => {
                                      eventClick.stopPropagation()
                                      setQrTarget({ event, assigneeName: entry.name })
                                    }}
                                    className="rounded-full bg-black/30 px-2 py-0.5 text-white/90 hover:bg-black/45"
                                  >
                                    {entry.name} ({entry.count})
                                  </button>
                                ) : (
                                  <span
                                    key={entry.name}
                                    className="rounded-full bg-black/20 px-2 py-0.5 text-white/70"
                                  >
                                    {entry.name} ({entry.count})
                                  </span>
                                )
                              ))}
                            </div>
                          </div>
                        </div>
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

      {assignTarget && (
        <TicketAssignModal
          event={assignTarget}
          plannerTickets={plannerByPerformance[assignTarget.performanceId]?.tickets || []}
          assigneeOptions={plannerAssignees}
          draftByTicket={assignDraft}
          busy={assignBusy}
          error={assignError}
          onTicketChange={(ticketId, value) => {
            setAssignDraft((current) => ({
              ...current,
              [ticketId]: value,
            }))
          }}
          onSave={assignTargetTickets}
          onClearAll={clearTargetAssignments}
          onClose={() => {
            setAssignTarget(null)
            setAssignDraft({})
            setAssignError(null)
          }}
        />
      )}

      {qrTarget && (
        <AssignedQrModal
          event={qrTarget.event}
          assigneeName={qrTarget.assigneeName}
          tickets={getAssignedTickets(qrTarget.event.performanceId, qrTarget.assigneeName)}
          onClose={() => setQrTarget(null)}
        />
      )}

      {showImportModal && (
        <ImportShowsModal
          cookie={importCookie}
          onCookieChange={(value) => {
            setImportCookie(value)
            setImportConnected(false)
            setImportFirstName('')
            setImportShowCount(0)
            setImportError(null)
          }}
          connected={importConnected}
          firstName={importFirstName}
          showCount={importShowCount}
          connectBusy={importConnectBusy}
          busy={importBusy}
          error={importError}
          onConnect={connectImportSource}
          onImport={importShows}
          onClose={() => {
            setShowImportModal(false)
            setImportConnected(false)
            setImportFirstName('')
            setImportShowCount(0)
            setImportError(null)
          }}
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
