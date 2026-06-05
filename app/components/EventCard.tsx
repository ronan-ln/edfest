'use client'

import type { Event, Performance } from '../types'

interface EventCardProps {
  event: Event
  cachedPerfs: Performance[] | null
  onClick: () => void
}

const TIMES_CODE = 'TIMESGIVEAWAY'

function imageUrl(thumb: string | null): string | null {
  if (!thumb) return null
  return `https://edfest.pazaz.studio/assets/${thumb}?width=400&fit=cover&quality=80&height=400`
}

function stripHtml(s: string | null): string {
  if (!s) return ''
  return s
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

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

function parseDay(dt: string | null | undefined): { d: number; m: number } | null {
  if (!dt) return null
  const date = new Date(dt.replace(' ', 'T'))
  if (isNaN(date.getTime())) return null
  return { d: date.getDate(), m: date.getMonth() }
}

function fmtDateRange(first: string | null | undefined, last: string | null | undefined): string | null {
  const a = parseDay(first)
  const b = parseDay(last)
  if (!a && !b) return null
  if (!a) return `${b!.d} ${MONTHS[b!.m]}`
  if (!b) return `${a.d} ${MONTHS[a.m]}`
  if (a.d === b.d && a.m === b.m) return `${a.d} ${MONTHS[a.m]}`
  if (a.m === b.m) return `${a.d}-${b.d} ${MONTHS[a.m]}`
  return `${a.d} ${MONTHS[a.m]} - ${b.d} ${MONTHS[b.m]}`
}

function fmtStartTime(dt: string | null | undefined): string | null {
  if (!dt) return null
  const date = new Date(dt.replace(' ', 'T'))
  if (isNaN(date.getTime())) return null
  return date.toLocaleTimeString('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
  })
}

function fmtDuration(duration: string | number | null | undefined): string | null {
  if (duration == null) return null
  const value = typeof duration === 'number' ? duration : Number.parseFloat(String(duration))
  if (!Number.isFinite(value) || value <= 0) return null
  const totalMinutes = Math.round(value)
  return `${totalMinutes}min`
}

function countTimesPromo(perfs: Performance[] | null): number {
  if (!perfs) return 0
  let count = 0
  for (const perf of perfs) {
    const has = perf.prices?.some((p) =>
      p.concessions?.some(
        (c) => c.code === TIMES_CODE && (c.remainingLimitValue == null || c.remainingLimitValue > 0)
      )
    )
    if (has) count++
  }
  return count
}

export function EventCard({ event, cachedPerfs, onClick }: EventCardProps) {
  const promoCount = countTimesPromo(cachedPerfs)
  const img = imageUrl(event.image_thumbnail)
  const venueName = event.venue_id?.name ?? 'Unknown venue'
  const cats = event.categories
    ?.map((c) => c.categories_id?.name)
    .filter(Boolean)
    .slice(0, 3) ?? []
  const snippet = stripHtml(event.short_description) || stripHtml(event.description)
  const ageRating = event.raw_data?.ageSuitabilityTitle ?? null
  const dateRange = fmtDateRange(event.first_performance_date, event.last_performance_date)
  const startTime = fmtStartTime(event.first_performance_date)
  const duration = fmtDuration(event.duration)

  return (
    <button
      type="button"
      onClick={onClick}
      className="group flex overflow-hidden rounded-xl border border-gray-800 bg-gray-900 text-left transition hover:-translate-y-0.5 hover:border-green-400/40 hover:shadow-lg hover:shadow-green-400/5"
    >
      {/* Left: fixed-width image */}
      <div className="relative w-48 shrink-0 overflow-hidden bg-gray-800 sm:w-56">
        {img ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={img}
            alt={event.name}
            loading="lazy"
            className="h-full w-full object-cover transition group-hover:scale-105"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-xs text-gray-600">
            No image
          </div>
        )}
        {promoCount > 0 && (
          <span className="absolute left-1.5 top-1.5 rounded-full bg-green-400 px-2 py-0.5 text-[10px] font-semibold text-gray-950">
            {promoCount} dates
          </span>
        )}
      </div>

      {/* Right: text content */}
      <div className="flex flex-1 flex-col gap-2 p-4">
        <div className="flex flex-wrap items-center gap-1.5">
          {event.event_type && (
            <span className="rounded bg-gray-800 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-gray-400">
              {event.event_type}
            </span>
          )}
          {ageRating && (
            <span className="rounded bg-amber-900/40 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-amber-300">
              {ageRating}
            </span>
          )}
          {cats.map((c) => (
            <span
              key={c}
              className="rounded bg-gray-800 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-gray-400"
            >
              {c}
            </span>
          ))}
        </div>

        <h3 className="text-sm font-semibold leading-snug text-gray-100 group-hover:text-green-400">
          {event.name}
        </h3>

        <p className="text-xs text-gray-500">{venueName}{dateRange ? ` · ${dateRange}` : ''}</p>

        {(startTime || duration) && (
          <div className="flex flex-wrap items-center gap-2 text-xs">
            {startTime && (
              <span className="rounded-full border border-gray-700 bg-gray-900 px-2 py-0.5 text-gray-300">
                Time {startTime}
              </span>
            )}
            {duration && (
              <span className="rounded-full border border-gray-700 bg-gray-900 px-2 py-0.5 text-gray-300">
                Duration {duration}
              </span>
            )}
          </div>
        )}

        {snippet && (
          <p className="line-clamp-4 text-sm leading-relaxed text-gray-300">{snippet}</p>
        )}
      </div>
    </button>
  )
}
