import { NextRequest, NextResponse } from 'next/server'
import {
  assignTickets,
  getOrCreateAssignee,
  unassignTickets,
} from '../../../lib/planner-db'

interface AssignBody {
  ticketIds?: number[]
  assigneeId?: number
  assigneeName?: string
  unassign?: boolean
}

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as AssignBody
    const ticketIds = (body.ticketIds || [])
      .map((id) => Number(id))
      .filter((id) => Number.isInteger(id) && id > 0)

    if (ticketIds.length === 0) {
      return NextResponse.json({ error: 'ticketIds are required' }, { status: 400 })
    }

    if (body.unassign) {
      unassignTickets(ticketIds)
      return NextResponse.json({ ok: true, unassigned: ticketIds.length })
    }

    let assigneeId = body.assigneeId
    if (!assigneeId && body.assigneeName) {
      assigneeId = getOrCreateAssignee(body.assigneeName).id
    }

    if (!assigneeId || !Number.isInteger(assigneeId) || assigneeId <= 0) {
      return NextResponse.json({ error: 'assigneeId or assigneeName is required' }, { status: 400 })
    }

    assignTickets(ticketIds, assigneeId)
    return NextResponse.json({ ok: true, assigned: ticketIds.length, assigneeId })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'assignment failed'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
