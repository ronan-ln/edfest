'use client'

import { useEffect, useMemo, useState } from 'react'
import type { Event, Performance } from '../types'

interface EventModalProps {
  event: Event
  onClose: () => void
}

const TIMES_CODE = 'TIMESGIVEAWAY'

function fmtDate(dt: string): string {
  const d = new Date(dt.replace(' ', 'T'))
  if (isNaN(d.getTime())) return dt
  return d.toLocaleString('en-GB', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function timesConcession(perf: Performance) {
  for (const p of perf.prices ?? []) {
    for (const c of p.concessions ?? []) {
      if (c.code === TIMES_CODE) return c
    }
  }
  return null
}

function heroImageUrl(thumb: string | null): string | null {
  if (!thumb) return null
  return `https://edfest.pazaz.studio/assets/${thumb}?width=800&fit=cover&quality=80&height=400`
}

function sanitizeHtml(html: string | null): string {
  if (!html) return ''
  // Strip script/style tags entirely (incl. content) but keep other markup so the description renders rich.
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/ on[a-z]+="[^"]*"/gi, '')
    .replace(/ on[a-z]+='[^']*'/gi, '')
}

export function EventModal({ event, onClose }: EventModalProps) {
  const [perfs, setPerfs] = useState<Performance[] | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    fetch(`/api/performances?slug=${encodeURIComponent(event.slug)}`)
      .then(async (res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        return res.json()
      })
      .then((data: Performance[]) => {
        if (cancelled) return
        setPerfs(data)
        setLoading(false)
      })
      .catch((err: Error) => {
        if (cancelled) return
        setError(err.message)
        setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [event.slug])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const timesPerfs = (perfs ?? []).filter((p) => {
    const c = timesConcession(p)
    return c !== null
  })

  const bookHref = `https://edfest.com/whats-on/${event.slug}/book`
  const hero = heroImageUrl(event.image_thumbnail)
  const ageRating = event.minimum_age || event.raw_data?.ageSuitabilityTitle || null
  const sanitizedDesc = useMemo(() => sanitizeHtml(event.description), [event.description])
  const cats = (event.categories ?? [])
    .map((c) => c.categories_id?.name)
    .filter(Boolean) as string[]
  const venueAddress = event.venue_id?.display_address ?? null
  const detailRows: { label: string; value: string }[] = []
  if (event.venue_id?.name) {
    detailRows.push({
      label: 'Venue',
      value: venueAddress ? `${event.venue_id.name} - ${venueAddress}` : event.venue_id.name,
    })
  }
  if (event.duration) detailRows.push({ label: 'Duration', value: `${event.duration} mins` })
  if (event.event_type) detailRows.push({ label: 'Type', value: event.event_type })
  if (ageRating) detailRows.push({ label: 'Age', value: ageRating })

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/80 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="relative my-8 w-full max-w-2xl overflow-hidden rounded-xl border border-gray-800 bg-gray-900 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          onClick={onClose}
          className="absolute right-3 top-3 z-10 rounded-full bg-gray-800/80 p-2 text-gray-300 hover:bg-gray-700 hover:text-white"
          aria-label="Close"
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <path d="M3 3l10 10M13 3L3 13" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>
        </button>

        {hero && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={hero}
            alt={event.name}
            className="h-48 w-full object-cover sm:h-56"
          />
        )}

        <div className="border-b border-gray-800 p-5">
          <h2 className="text-xl font-semibold text-gray-100">{event.name}</h2>
          <p className="mt-1 text-sm text-gray-400">
            {event.venue_id?.name ?? 'Unknown venue'}
            {event.event_type ? ` · ${event.event_type}` : ''}
          </p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {ageRating && (
              <span className="rounded bg-amber-900/40 px-2 py-0.5 text-[11px] font-medium uppercase tracking-wide text-amber-300">
                {ageRating}
              </span>
            )}
            {event.duration && (
              <span className="rounded bg-gray-800 px-2 py-0.5 text-[11px] font-medium uppercase tracking-wide text-gray-400">
                {event.duration}
              </span>
            )}
            {cats.slice(0, 4).map((c) => (
              <span
                key={c}
                className="rounded bg-gray-800 px-2 py-0.5 text-[11px] font-medium uppercase tracking-wide text-gray-400"
              >
                {c}
              </span>
            ))}
          </div>
          <a
            href={bookHref}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-4 inline-flex items-center gap-2 rounded-lg bg-green-400 px-4 py-2 text-sm font-semibold text-gray-950 hover:bg-green-300"
          >
            Book on edfest.com
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
              <path d="M6 3h7v7M13 3L3 13" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
          </a>
        </div>

        {detailRows.length > 0 && (
          <div className="border-b border-gray-800 p-5">
            <dl className="grid grid-cols-1 gap-x-4 gap-y-2 sm:grid-cols-2">
              {detailRows.map((row) => (
                <div key={row.label} className="flex flex-col gap-0.5">
                  <dt className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">
                    {row.label}
                  </dt>
                  <dd className="text-sm text-gray-200">{row.value}</dd>
                </div>
              ))}
            </dl>
          </div>
        )}

        {sanitizedDesc && (
          <div className="border-b border-gray-800 p-5">
            <div
              className="prose prose-sm prose-invert max-w-none max-h-48 overflow-y-auto text-sm leading-relaxed text-gray-300 [&_a]:text-green-400 [&_a:hover]:underline [&_p]:my-2"
              dangerouslySetInnerHTML={{ __html: sanitizedDesc }}
            />
          </div>
        )}

        <div className="p-5">
          <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-gray-400">
            Times Giveaway availability
          </h3>

          {loading && (
            <div className="flex items-center gap-3 py-8 text-sm text-gray-400">
              <div className="h-4 w-4 animate-spin rounded-full border-2 border-gray-700 border-t-green-400" />
              Loading live availability...
            </div>
          )}

          {error && !loading && (
            <p className="rounded-lg border border-red-900/50 bg-red-950/50 p-3 text-sm text-red-300">
              Failed to load: {error}
            </p>
          )}

          {!loading && !error && timesPerfs.length === 0 && (
            <p className="rounded-lg border border-gray-800 bg-gray-950 p-3 text-sm text-gray-500">
              No Times Giveaway performances found for this show.
            </p>
          )}

          {!loading && !error && timesPerfs.length > 0 && (
            <ul className="divide-y divide-gray-800 overflow-hidden rounded-lg border border-gray-800">
              {timesPerfs.map((perf) => {
                const c = timesConcession(perf)!
                // null/undefined = unknown, treat as available; any value > 0 = available
                const promoAvailable = c.remainingLimitValue == null || c.remainingLimitValue > 0
                const available = promoAvailable && !perf.is_sold_out
                const promoLabel = perf.is_sold_out
                  ? 'Sold out'
                  : !promoAvailable
                  ? 'Promo exhausted'
                  : c.remainingLimitValue != null && c.remainingLimitValue > 1
                  ? `${c.remainingLimitValue} promo slots`
                  : 'Promo available'
                return (
                  <li key={perf.id} className="flex flex-col gap-1 p-3 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <p className="text-sm font-medium text-gray-100">{fmtDate(perf.datetime)}</p>
                      <p className="text-xs text-gray-500">{perf.availability} seats available</p>
                    </div>
                    <span
                      className={
                        available
                          ? 'self-start rounded-full bg-green-400/10 px-2 py-1 text-xs font-semibold text-green-400 sm:self-auto'
                          : 'self-start rounded-full bg-gray-800 px-2 py-1 text-xs font-semibold text-gray-500 sm:self-auto'
                      }
                    >
                      {promoLabel}
                    </span>
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      </div>
    </div>
  )
}
