import { NextRequest, NextResponse } from 'next/server'
import { getOrCreateAssignee, listAssignees } from '../../../lib/planner-db'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function GET() {
  return NextResponse.json({ assignees: listAssignees() })
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as { name?: string }
    const name = (body.name || '').trim()
    if (!name) {
      return NextResponse.json({ error: 'name is required' }, { status: 400 })
    }

    const assignee = getOrCreateAssignee(name)
    return NextResponse.json({ assignee })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'failed to create assignee'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
