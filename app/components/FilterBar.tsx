'use client'

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
        <span className="text-xs text-gray-500 whitespace-nowrap">
          {visibleCount} / {totalCount}
        </span>
      </div>
    </div>
  )
}
