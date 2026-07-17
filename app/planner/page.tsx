'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import { CookieSetup, getCookie, getFirstName } from '../components/CookieSetup'

interface Assignee {
  id: number
  name: string
  color: string
}

interface Ticket {
  id: number
  barcode: string | null
  barcodeUrl: string | null
  sourceFirstName: string
  sourceColor: string
  assigneeId: number | null
  assigneeName: string | null
  assigneeColor: string | null
}

interface Performance {
  performanceId: string
  eventName: string
  eventSlug: string | null
  venue: string | null
  subvenue: string | null
  datetime: string
  dayKey: string
  sourceCount: number
  assignedCount: number
  unassignedCount: number
  tickets: Ticket[]
}

function formatDayLabel(dayKey: string): string {
  const date = new Date(`${dayKey}T12:00:00`)
  return date.toLocaleDateString('en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  })
}

function formatDateTime(value: string): string {
  const date = new Date(value.replace(' ', 'T'))
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleString('en-GB', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function groupByDay(performances: Performance[]): Array<{ dayKey: string; rows: Performance[] }> {
  const map = new Map<string, Performance[]>()
  for (const perf of performances) {
    const rows = map.get(perf.dayKey)
    if (rows) {
      rows.push(perf)
    } else {
      map.set(perf.dayKey, [perf])
    }
  }

  return Array.from(map.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([dayKey, rows]) => ({
      dayKey,
      rows: rows.sort((left, right) => left.datetime.localeCompare(right.datetime)),
    }))
}

export default function PlannerPage() {
  const [loading, setLoading] = useState(true)
  const [importing, setImporting] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [showCookieSetup, setShowCookieSetup] = useState(false)
  const [hasCookie, setHasCookie] = useState(() => !!getCookie())
  const [firstName, setFirstName] = useState(() => getFirstName())

  const [performances, setPerformances] = useState<Performance[]>([])
  const [assignees, setAssignees] = useState<Assignee[]>([])
  const [newAssigneeName, setNewAssigneeName] = useState('')
  const [selectedAssigneeId, setSelectedAssigneeId] = useState<number | null>(null)
  const [filterAssigneeId, setFilterAssigneeId] = useState<number | null>(null)
  const [selectedTickets, setSelectedTickets] = useState<Record<number, boolean>>({})

  async function loadAssignees() {
    const res = await fetch('/api/planner/assignees', { cache: 'no-store' })
    const data = await res.json() as { assignees?: Assignee[]; error?: string }
    if (!res.ok) throw new Error(data.error || 'failed to load assignees')
    const nextAssignees = data.assignees || []
    setAssignees(nextAssignees)
    if (selectedAssigneeId == null && nextAssignees.length > 0) {
      setSelectedAssigneeId(nextAssignees[0].id)
    }
  }

  async function loadPerformances() {
    const params = new URLSearchParams()
    if (filterAssigneeId != null) {
      params.set('assigneeId', String(filterAssigneeId))
    }
    const qs = params.toString()
    const url = qs ? `/api/planner/performances?${qs}` : '/api/planner/performances'

    const res = await fetch(url, { cache: 'no-store' })
    const data = await res.json() as { performances?: Performance[]; error?: string }
    if (!res.ok) throw new Error(data.error || 'failed to load planner performances')
    setPerformances(data.performances || [])
  }

  async function refreshAll() {
    setLoading(true)
    setError(null)
    try {
      await Promise.all([loadAssignees(), loadPerformances()])
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'failed to load planner'
      setError(msg)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    let cancelled = false

    async function init() {
      try {
        const [assigneesRes, performancesRes] = await Promise.all([
          fetch('/api/planner/assignees', { cache: 'no-store' }),
          fetch('/api/planner/performances', { cache: 'no-store' }),
        ])

        const assigneesData = await assigneesRes.json() as { assignees?: Assignee[]; error?: string }
        if (!assigneesRes.ok) {
          throw new Error(assigneesData.error || 'failed to load assignees')
        }

        const performancesData = await performancesRes.json() as { performances?: Performance[]; error?: string }
        if (!performancesRes.ok) {
          throw new Error(performancesData.error || 'failed to load planner performances')
        }

        if (cancelled) return
        const nextAssignees = assigneesData.assignees || []
        setAssignees(nextAssignees)
        if (nextAssignees.length > 0) {
          setSelectedAssigneeId((current) => current ?? nextAssignees[0].id)
        }
        setPerformances(performancesData.performances || [])
        setLoading(false)
      } catch (err) {
        if (cancelled) return
        const msg = err instanceof Error ? err.message : 'failed to load planner'
        setError(msg)
        setLoading(false)
      }
    }

    void Promise.resolve().then(init)
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (loading) return
    let cancelled = false
    const params = new URLSearchParams()
    if (filterAssigneeId != null) {
      params.set('assigneeId', String(filterAssigneeId))
    }
    const qs = params.toString()
    const url = qs ? `/api/planner/performances?${qs}` : '/api/planner/performances'

    void Promise.resolve()
      .then(async () => {
        const res = await fetch(url, { cache: 'no-store' })
        const data = await res.json() as { performances?: Performance[]; error?: string }
        if (!res.ok) {
          throw new Error(data.error || 'failed to load planner performances')
        }
        if (cancelled) return
        setPerformances(data.performances || [])
      })
      .catch((err) => {
        if (cancelled) return
        const msg = err instanceof Error ? err.message : 'failed to load planner performances'
        setError(msg)
      })

    return () => {
      cancelled = true
    }
  }, [filterAssigneeId, loading])

  const dayGroups = useMemo(() => groupByDay(performances), [performances])
  const selectedTicketIds = useMemo(
    () => Object.keys(selectedTickets).filter((id) => selectedTickets[Number(id)]).map(Number),
    [selectedTickets]
  )
  const showCount = useMemo(() => {
    const unique = new Set(performances.map((perf) => perf.eventName.toLowerCase()))
    return unique.size
  }, [performances])

  function toggleTicket(id: number) {
    setSelectedTickets((current) => ({ ...current, [id]: !current[id] }))
  }

  async function importFromCookie() {
    const cookie = getCookie()
    if (!cookie) {
      setShowCookieSetup(true)
      setError('Connect your edfest session first.')
      return
    }

    setImporting(true)
    setError(null)
    setMessage(null)
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
        source?: { first_name: string }
      }
      if (!res.ok) {
        throw new Error(data.error || 'import failed')
      }

      setMessage(
        `Imported ${data.importedTickets ?? 0} tickets across ${data.importedPerformances ?? 0} performances from ${data.source?.first_name || 'source account'}.`
      )
      setSelectedTickets({})
      await refreshAll()
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'import failed'
      setError(msg)
    } finally {
      setImporting(false)
    }
  }

  async function createAssignee() {
    const name = newAssigneeName.trim()
    if (!name) return

    setError(null)
    const res = await fetch('/api/planner/assignees', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name }),
    })
    const data = await res.json() as { assignee?: Assignee; error?: string }
    if (!res.ok) {
      setError(data.error || 'failed to create assignee')
      return
    }

    setNewAssigneeName('')
    await loadAssignees()
    if (data.assignee) {
      setSelectedAssigneeId(data.assignee.id)
    }
  }

  async function assignSelection(unassign: boolean) {
    if (selectedTicketIds.length === 0) return

    if (!unassign && !selectedAssigneeId) {
      setError('Select an assignee before assigning tickets.')
      return
    }

    setError(null)
    const payload: Record<string, unknown> = {
      ticketIds: selectedTicketIds,
    }

    if (unassign) {
      payload.unassign = true
    } else {
      payload.assigneeId = selectedAssigneeId
    }

    const res = await fetch('/api/planner/assignments', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
    })

    const data = await res.json() as { error?: string }
    if (!res.ok) {
      setError(data.error || 'failed to update assignments')
      return
    }

    setSelectedTickets({})
    await loadPerformances()
  }

  return (
    <div className="min-h-screen flex-1 bg-gray-950 text-gray-100">
      <header className="border-b border-gray-800 bg-gray-950">
        <div className="mx-auto flex max-w-7xl flex-col gap-4 px-4 py-6 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-100">EdFest Scheduler</h1>
            <p className="text-sm text-gray-400">
              Load purchased shows, assign tickets to named users, and browse calendars with ticket details.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Link
              href="/purchases"
              className="rounded-lg border border-gray-700 bg-gray-900 px-4 py-2 text-sm font-medium text-gray-200 hover:border-green-400 hover:text-green-400"
            >
              Raw ticket list
            </Link>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl space-y-4 px-4 py-6">
        {(message || error) && (
          <div
            className={`rounded-lg border px-4 py-3 text-sm ${
              error
                ? 'border-red-800 bg-red-950/50 text-red-300'
                : 'border-green-800 bg-green-950/30 text-green-300'
            }`}
          >
            {error || message}
          </div>
        )}

        <section className="rounded-xl border border-gray-800 bg-gray-900 p-4">
          <p className="mb-3 text-xs font-semibold uppercase tracking-[0.2em] text-gray-500">1. Load shows</p>
          <div className="grid gap-3 sm:grid-cols-[1fr_auto_auto] sm:items-center">
            <div className="rounded-lg border border-gray-800 bg-gray-950 p-3">
              <p className="text-sm text-gray-300">
                {hasCookie
                  ? `Connected as ${firstName || 'edfest user'}`
                  : 'No cookie connected'}
              </p>
              <p className="mt-1 text-xs text-gray-500">
                {showCount} show{showCount !== 1 ? 's' : ''} loaded · {performances.length} performance{performances.length !== 1 ? 's' : ''} in scheduler
              </p>
            </div>
            <button
              type="button"
              onClick={() => setShowCookieSetup(true)}
              className="rounded-lg border border-gray-700 bg-gray-950 px-3 py-2 text-sm font-medium text-gray-200 hover:border-green-400 hover:text-green-400"
            >
              {hasCookie ? 'Edit cookie' : 'Connect cookie'}
            </button>
            <button
              type="button"
              onClick={importFromCookie}
              disabled={importing}
              className="rounded-lg bg-green-400 px-4 py-2 text-sm font-semibold text-gray-950 hover:bg-green-300 disabled:opacity-60"
            >
              {importing ? 'Importing...' : 'Import shows'}
            </button>
          </div>
        </section>

        <section className="rounded-xl border border-gray-800 bg-gray-900 p-4">
          <p className="mb-3 text-xs font-semibold uppercase tracking-[0.2em] text-gray-500">2. Browse calendar and assign users</p>
          <div className="grid gap-3 sm:grid-cols-[1.5fr_1fr_1fr_auto_auto] sm:items-end">
            <label className="flex flex-col gap-1 text-sm text-gray-300">
              Create assignee
              <input
                value={newAssigneeName}
                onChange={(e) => setNewAssigneeName(e.target.value)}
                placeholder="Type a name"
                className="rounded-lg border border-gray-700 bg-gray-950 px-3 py-2 text-sm text-gray-100 focus:border-green-400 focus:outline-none"
              />
            </label>

            <button
              type="button"
              onClick={createAssignee}
              className="rounded-lg border border-gray-700 bg-gray-950 px-3 py-2 text-sm font-medium text-gray-200 hover:border-green-400 hover:text-green-400"
            >
              Add name
            </button>

            <label className="flex flex-col gap-1 text-sm text-gray-300">
              Assign selected to
              <select
                value={selectedAssigneeId ?? ''}
                onChange={(e) => setSelectedAssigneeId(e.target.value ? Number(e.target.value) : null)}
                className="rounded-lg border border-gray-700 bg-gray-950 px-3 py-2 text-sm text-gray-100 focus:border-green-400 focus:outline-none"
              >
                <option value="">Select assignee</option>
                {assignees.map((assignee) => (
                  <option key={assignee.id} value={assignee.id}>
                    {assignee.name}
                  </option>
                ))}
              </select>
            </label>

            <button
              type="button"
              onClick={() => assignSelection(false)}
              disabled={selectedTicketIds.length === 0}
              className="rounded-lg bg-green-400 px-3 py-2 text-sm font-semibold text-gray-950 hover:bg-green-300 disabled:opacity-50"
            >
              Assign ({selectedTicketIds.length})
            </button>

            <button
              type="button"
              onClick={() => assignSelection(true)}
              disabled={selectedTicketIds.length === 0}
              className="rounded-lg border border-gray-700 bg-gray-950 px-3 py-2 text-sm font-medium text-gray-200 hover:border-gray-500 disabled:opacity-50"
            >
              Unassign
            </button>
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-3">
            <label className="text-sm text-gray-300">Filter calendar by assignee</label>
            <select
              value={filterAssigneeId ?? ''}
              onChange={(e) => setFilterAssigneeId(e.target.value ? Number(e.target.value) : null)}
              className="rounded-lg border border-gray-700 bg-gray-950 px-3 py-2 text-sm text-gray-100 focus:border-green-400 focus:outline-none"
            >
              <option value="">All</option>
              {assignees.map((assignee) => (
                <option key={assignee.id} value={assignee.id}>
                  {assignee.name}
                </option>
              ))}
            </select>
          </div>
        </section>

        {loading && (
          <div className="flex items-center gap-3 py-8 text-sm text-gray-400">
            <div className="h-4 w-4 animate-spin rounded-full border-2 border-gray-700 border-t-green-400" />
            Loading scheduler...
          </div>
        )}

        {!loading && dayGroups.length === 0 && (
          <div className="rounded-lg border border-gray-800 bg-gray-900 p-6 text-sm text-gray-400">
            No imported tickets yet. Connect your cookie and use Import shows.
          </div>
        )}

        {!loading && dayGroups.length > 0 && (
          <div className="space-y-5">
            {dayGroups.map(({ dayKey, rows }) => (
              <section key={dayKey} className="rounded-xl border border-gray-800 bg-gray-900 p-4">
                <h2 className="text-lg font-semibold text-gray-100">{formatDayLabel(dayKey)}</h2>
                <div className="mt-3 space-y-3">
                  {rows.map((perf) => (
                    <article key={perf.performanceId} className="rounded-lg border border-gray-800 bg-gray-950 p-3">
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div>
                          <h3 className="text-base font-semibold text-gray-100">{perf.eventName}</h3>
                          <p className="text-sm text-gray-400">
                            {formatDateTime(perf.datetime)}
                            {perf.venue ? ` - ${perf.venue}` : ''}
                            {perf.subvenue ? ` / ${perf.subvenue}` : ''}
                          </p>
                        </div>
                        <div className="flex items-center gap-2 text-xs">
                          <span className="rounded-full border border-gray-700 px-2 py-1 text-gray-300">
                            {perf.assignedCount} assigned
                          </span>
                          <span className="rounded-full border border-gray-700 px-2 py-1 text-gray-300">
                            {perf.unassignedCount} unassigned
                          </span>
                        </div>
                      </div>

                      <ul className="mt-3 space-y-2">
                        {perf.tickets.map((ticket) => (
                          <li key={ticket.id} className="rounded-md border border-gray-800 bg-gray-900 p-2">
                            <div className="flex flex-wrap items-center gap-2">
                              <input
                                type="checkbox"
                                checked={!!selectedTickets[ticket.id]}
                                onChange={() => toggleTicket(ticket.id)}
                                className="h-4 w-4 rounded border-gray-700 bg-gray-950"
                              />

                              <span
                                className="rounded-full px-2 py-1 text-xs font-medium text-gray-100"
                                style={{ backgroundColor: ticket.sourceColor }}
                              >
                                Source: {ticket.sourceFirstName}
                              </span>

                              {ticket.assigneeName ? (
                                <span
                                  className="rounded-full px-2 py-1 text-xs font-medium text-gray-100"
                                  style={{ backgroundColor: ticket.assigneeColor || 'rgba(113, 113, 122, 0.55)' }}
                                >
                                  Assigned: {ticket.assigneeName}
                                </span>
                              ) : (
                                <span className="rounded-full bg-gray-800 px-2 py-1 text-xs font-medium text-gray-400">
                                  Unassigned
                                </span>
                              )}

                              <span className="text-xs text-gray-500">
                                {ticket.barcode || 'No barcode'}
                              </span>

                              {ticket.barcodeUrl && (
                                <a
                                  href={ticket.barcodeUrl}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="rounded-md border border-gray-700 px-2 py-1 text-xs text-gray-300 hover:border-green-400 hover:text-green-400"
                                >
                                  View QR
                                </a>
                              )}
                            </div>
                          </li>
                        ))}
                      </ul>
                    </article>
                  ))}
                </div>
              </section>
            ))}
          </div>
        )}
      </main>

      {showCookieSetup && (
        <CookieSetup
          onClose={() => {
            setShowCookieSetup(false)
            localStorage.setItem('edfest_setup_dismissed', '1')
          }}
          onSaved={(name) => {
            setHasCookie(true)
            if (name) setFirstName(name)
          }}
        />
      )}
    </div>
  )
}
