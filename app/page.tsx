'use client'

import { useEffect, useMemo, useState } from 'react'
import type { AvailabilityCache, Event, Performance } from './types'
import { FilterBar } from './components/FilterBar'
import { EventCard } from './components/EventCard'
import { EventModal } from './components/EventModal'
import { CookieSetup, getCookie, getFirstName } from './components/CookieSetup'

const TIMES_CODE = 'TIMESGIVEAWAY'

function hasTimesPromo(perfs: Performance[] | null): boolean {
  if (!perfs) return false
  return perfs.some((perf) =>
    perf.prices?.some((p) =>
      p.concessions?.some(
        (c) => c.code === TIMES_CODE && c.remainingLimitValue > 0
      )
    )
  )
}

export default function Home() {
  const [events, setEvents] = useState<Event[]>([])
  const [cache, setCache] = useState<AvailabilityCache>({})
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [category, setCategory] = useState('')
  const [promoOnly, setPromoOnly] = useState(false)
  const [selected, setSelected] = useState<Event | null>(null)
  const [selectedDate, setSelectedDate] = useState<string | null>(null)
  const [visibleLimit, setVisibleLimit] = useState(60)
  const [showCookieSetup, setShowCookieSetup] = useState(false)
  const [hasCookie, setHasCookie] = useState(false)
  const [firstName, setFirstName] = useState('')
  const [basketCount, setBasketCount] = useState<number | null>(null)
  const [availLoading, setAvailLoading] = useState(true)

  useEffect(() => {
    const cookie = getCookie()
    setHasCookie(!!cookie)
    setFirstName(getFirstName())
    // Show setup on first visit if no cookie configured
    if (!cookie && !localStorage.getItem('edfest_setup_dismissed')) {
      setShowCookieSetup(true)
    }
    if (cookie) {
      fetch('/api/basket', {
        headers: { 'x-edfest-cookie': cookie },
      })
        .then(r => r.json())
        .then(d => { if (d.basket?.summary?.notickets != null) setBasketCount(d.basket.summary.notickets) })
        .catch(() => {})
    }
  }, [])

  // Sync modal open/close with browser history so the back button closes it
  useEffect(() => {
    if (selected) {
      window.history.pushState({ modal: selected.slug }, '')
    }
  }, [selected])

  useEffect(() => {
    const onPop = () => setSelected(null)
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [])

  // Handle deeplinks like ?slug=event-slug&date=2026-08-12T15:00:00
  useEffect(() => {
    if (typeof window === 'undefined') return
    const params = new URLSearchParams(window.location.search)
    const slug = params.get('slug')
    const date = params.get('date')

    if (slug && events.length > 0) {
      const event = events.find(e => e.slug === slug)
      if (event) {
        setSelected(event)
        if (date) setSelectedDate(date)
      }
    }
  }, [events])

  useEffect(() => {
    let cancelled = false
    // Load events first, then availability separately
    fetch('/offers.json')
      .then((r) => r.json() as Promise<Event[]>)
      .then((offers) => {
        if (cancelled) return
        const seen = new Set<string>()
        const unique: Event[] = []
        for (const e of offers) {
          if (seen.has(e.slug)) continue
          seen.add(e.slug)
          unique.push(e)
        }
        setEvents(unique)
        setLoading(false)
      })
      .catch(() => {
        if (cancelled) return
        setLoading(false)
      })

    fetch('/api/cached-availability')
      .then((r) => r.json() as Promise<AvailabilityCache>)
      .then((avail) => {
        if (cancelled) return
        setCache(avail || {})
        setAvailLoading(false)
      })
      .catch(() => {
        if (cancelled) return
        setAvailLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  const categories = useMemo(() => {
    const set = new Set<string>()
    for (const e of events) {
      for (const c of e.categories ?? []) {
        const name = c.categories_id?.name
        if (name) set.add(name)
      }
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b))
  }, [events])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return events.filter((e) => {
      if (category) {
        const has = e.categories?.some((c) => c.categories_id?.name === category)
        if (!has) return false
      }
      if (q) {
        const venueName = e.venue_id?.name ?? ''
        const cats = (e.categories ?? []).map((c) => c.categories_id?.name ?? '').join(' ')
        const hay = `${e.name} ${venueName} ${cats} ${e.event_type ?? ''}`.toLowerCase()
        if (!hay.includes(q)) return false
      }
      if (promoOnly) {
        const perfs = cache[e.slug]?.performances ?? null
        if (!hasTimesPromo(perfs)) return false
      }
      return true
    })
  }, [events, search, category, promoOnly, cache])

  const visible = filtered.slice(0, visibleLimit)

  function updateCachedPerformance(slug: string, perf: Performance) {
    setCache((prev) => {
      const current = prev[slug]?.performances ?? []
      const id = String(perf.id)
      const idx = current.findIndex((p) => String(p.id) === id)
      const next = [...current]
      if (idx >= 0) {
        next[idx] = perf
      } else {
        next.push(perf)
      }

      return {
        ...prev,
        [slug]: {
          fetchedAt: new Date().toISOString(),
          performances: next,
        },
      }
    })
  }

  return (
    <div className="min-h-screen flex-1 bg-gray-950 text-gray-100">
      <header className="border-b border-gray-800 bg-gray-950">
        <div className="mx-auto max-w-7xl px-4 py-6">
          <h1 className="text-2xl font-bold text-gray-100">EdFest browser</h1>
          <p className="text-sm text-gray-400">
            {events.length.toLocaleString()} shows · click any card to check Times Giveaway availability
          </p>
        </div>
      </header>

      <FilterBar
        search={search}
        onSearch={(v) => {
          setSearch(v)
          setVisibleLimit(60)
        }}
        category={category}
        onCategory={(v) => {
          setCategory(v)
          setVisibleLimit(60)
        }}
        categories={categories}
        promoOnly={promoOnly}
        onPromoOnly={(v) => {
          setPromoOnly(v)
          setVisibleLimit(60)
        }}
        totalCount={events.length}
        visibleCount={filtered.length}
        hasCookie={hasCookie}
        firstName={firstName}
        basketCount={basketCount}
        onAccountClick={() => setShowCookieSetup(true)}
      />

      <main className="mx-auto max-w-7xl px-4 py-6">
        {loading && (
          <div className="flex items-center gap-3 py-12 text-sm text-gray-400">
            <div className="h-4 w-4 animate-spin rounded-full border-2 border-gray-700 border-t-green-400" />
            Loading {events.length.toLocaleString()} events...
          </div>
        )}

        {!loading && filtered.length === 0 && (
          <div className="rounded-lg border border-gray-800 bg-gray-900 p-8 text-center text-sm text-gray-400">
            No events match your filters.
          </div>
        )}

        {!loading && filtered.length > 0 && (
          <>
            {availLoading && (
              <div className="mb-4 flex items-center gap-2 rounded-lg border border-gray-800 bg-gray-900 px-4 py-3 text-sm text-gray-400">
                <div className="h-3 w-3 animate-spin rounded-full border-2 border-gray-700 border-t-green-400" />
                <span>Updating availability...</span>
              </div>
            )}
            <div className="grid grid-cols-1 gap-5">
              {visible.map((e) => (
                <EventCard
                  key={e.id}
                  event={e}
                  cachedPerfs={cache[e.slug]?.performances ?? null}
                  onClick={() => setSelected(e)}
                />
              ))}
            </div>
            {visibleLimit < filtered.length && (
              <div className="mt-6 flex justify-center">
                <button
                  type="button"
                  onClick={() => setVisibleLimit((n) => n + 60)}
                  className="rounded-lg border border-gray-700 bg-gray-900 px-6 py-2 text-sm font-medium text-gray-200 hover:border-green-400 hover:text-green-400"
                >
                  Show more ({filtered.length - visibleLimit} remaining)
                </button>
              </div>
            )}
          </>
        )}
      </main>

      {selected && (
        <EventModal
          event={selected}
          cachedPerfs={cache[selected.slug]?.performances ?? null}
          onClose={() => window.history.back()}
          onNeedCookie={() => setShowCookieSetup(true)}
          onPerformanceUpdated={updateCachedPerformance}
        />
      )}

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
