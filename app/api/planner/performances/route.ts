import { NextRequest, NextResponse } from 'next/server'
import { listPerformancesWithTickets } from '../../../lib/planner-db'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function GET(req: NextRequest) {
  const day = req.nextUrl.searchParams.get('day') || undefined
  const assigneeIdParam = req.nextUrl.searchParams.get('assigneeId')
  const assigneeId = assigneeIdParam ? Number.parseInt(assigneeIdParam, 10) : undefined

  if (assigneeIdParam && (!Number.isInteger(assigneeId) || assigneeId! <= 0)) {
    return NextResponse.json({ error: 'invalid assigneeId' }, { status: 400 })
  }

  const performances = listPerformancesWithTickets(day, assigneeId)
  return NextResponse.json({ performances })
}
