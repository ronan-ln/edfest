'use client'

import Link from 'next/link'

interface FilterBarProps {
  search: string
  onSearch: (value: string) => void
  category: string
  onCategory: (value: string) => void
  categories: string[]
  promoOnly: boolean
  onPromoOnly: (value: boolean) => void
  totalCount: number
  visibleCount: number
  hasCookie: boolean
  firstName: string
  basketCount: number | null
  onAccountClick: () => void
}

export function FilterBar({
  search,
  onSearch,
  category,
  onCategory,
  categories,
  promoOnly,
  onPromoOnly,
  totalCount,
  visibleCount,
  hasCookie,
  firstName,
  basketCount,
  onAccountClick,
}: FilterBarProps) {
  return (
    <div className="sticky top-0 z-20 border-b border-gray-800 bg-gray-950/90 backdrop-blur-md">
      <div className="mx-auto flex max-w-7xl flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center sm:gap-4">
        <input
          type="text"
          value={search}
          onChange={(e) => onSearch(e.target.value)}
          placeholder="Search by name, venue, or category..."
          className="flex-1 rounded-lg border border-gray-700 bg-gray-900 px-4 py-2 text-sm text-gray-100 placeholder-gray-500 focus:border-green-400 focus:outline-none"
        />
        <select
          value={category}
          onChange={(e) => onCategory(e.target.value)}
          className="rounded-lg border border-gray-700 bg-gray-900 px-3 py-2 text-sm text-gray-100 focus:border-green-400 focus:outline-none"
        >
          <option value="">All categories</option>
          {categories.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
        <label className="flex cursor-pointer items-center gap-2 text-sm text-gray-300">
          <input
            type="checkbox"
            checked={promoOnly}
            onChange={(e) => onPromoOnly(e.target.checked)}
            className="h-4 w-4 rounded border-gray-700 bg-gray-900 text-green-400 focus:ring-green-400"
          />
          Times promo only
        </label>
        <div className="flex flex-1 items-center justify-end gap-4">
          <span className="text-xs text-gray-500 whitespace-nowrap">
            {visibleCount} / {totalCount}
          </span>
          {hasCookie && (
            <Link
              href="/purchases"
              className="flex items-center gap-1.5 rounded-lg border border-gray-700 px-3 py-2 text-sm font-medium text-gray-300 transition hover:border-green-400 hover:text-green-400"
            >
              <span className="text-base">🎟️</span>
              <span>My Tickets</span>
            </Link>
          )}
          <button
            type="button"
            onClick={onAccountClick}
            className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium transition ${hasCookie ? 'border-green-400/40 text-green-400 hover:bg-green-400/10' : 'border-gray-700 text-gray-400 hover:border-green-400 hover:text-green-400'}`}
          >
            <span className="text-base">{hasCookie ? '🛒' : '🔓'}</span>
            <span>
              {hasCookie
                ? `${firstName ? firstName : 'Account'}${basketCount != null ? ` · ${basketCount}` : ''}`
                : 'Connect'}
            </span>
          </button>
        </div>
      </div>
    </div>
  )
}
