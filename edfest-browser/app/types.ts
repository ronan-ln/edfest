export interface Category {
  categories_id: {
    id: number
    name: string
    slug: string
  }
}

export interface Venue {
  id: number
  name: string
  slug: string
  display_address: string
}

export interface Event {
  id: number
  name: string
  slug: string
  description: string | null
  short_description: string | null
  image_thumbnail: string | null
  start_date: string
  end_date: string
  first_performance_date: string
  last_performance_date: string
  event_type: string | null
  duration: string | null
  price_from: string | number | null
  min_full_price: string | number | null
  minimum_age: string | null
  venue_id: Venue | null
  categories: Category[]
  offer_code: string | null
  offer_type: string | null
  raw_data?: {
    ageSuitabilityTitle?: string | null
  } | null
}

export interface Concession {
  code: string
  title: string
  concPrice: string
  totalPrice: string
  transactionFeesPrice: string
  promoCodeRequired: boolean
  limitValue: number
  remainingLimitValue: number
  description: string
}

export interface PriceBand {
  price: string
  pricetype: string
  availabilityLevel: string
  seatPercentageRemaining: number
  concessions: Concession[]
}

export interface Performance {
  id: string
  datetime: string
  status: string
  availability: number
  is_sold_out: boolean
  minfullprice: string
  isCancelled: boolean
  prices: PriceBand[]
}

export interface AvailabilityCache {
  [slug: string]: {
    fetchedAt: string
    performances: Performance[]
  }
}
