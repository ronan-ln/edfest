import Database from 'better-sqlite3'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'

interface SourceAccountRow {
  id: number
  first_name: string
  color: string
}

interface SourceAccountInput {
  sourceKey: string
  firstName: string
}

interface PerformanceInput {
  performanceId: string
  eventId: string | null
  eventName: string
  eventSlug: string | null
  venue: string | null
  subvenue: string | null
  datetime: string
  status: string | null
}

interface TicketInput {
  sourceAccountId: number
  performanceId: string
  orderId: string
  externalTicketId: string
  barcode: string | null
  barcodeUrl: string | null
  status: string | null
  rawJson: string
  ticketIndex: number
}

export interface PlannerTicket {
  id: number
  barcode: string | null
  barcodeUrl: string | null
  sourceFirstName: string
  sourceColor: string
  assigneeId: number | null
  assigneeName: string | null
  assigneeColor: string | null
  performanceId: string
}

export interface PlannerPerformance {
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
  tickets: PlannerTicket[]
}

export interface PlannerAssignee {
  id: number
  name: string
  color: string
}

const DEFAULT_DB_PATH = path.join(process.cwd(), 'data', 'planner.db')

let db: Database.Database | null = null

function getDbPath(): string {
  if (process.env.DB_PATH) return path.resolve(process.env.DB_PATH)

  if (process.env.DATA_PATH) {
    return path.join(path.dirname(path.resolve(process.env.DATA_PATH)), 'planner.db')
  }

  return DEFAULT_DB_PATH
}

function ensureDbDir(dbPath: string): void {
  const dir = path.dirname(dbPath)
  fs.mkdirSync(dir, { recursive: true })
}

function dayKeyFromDateTime(datetime: string): string {
  const date = new Date(datetime.replace(' ', 'T'))
  if (Number.isNaN(date.getTime())) {
    return datetime.slice(0, 10)
  }
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

function colorFromSeed(seed: string, alpha: number): string {
  const hash = crypto.createHash('sha1').update(seed).digest('hex')
  const n = Number.parseInt(hash.slice(0, 8), 16)
  const hue = n % 360
  return `hsla(${hue}, 80%, 58%, ${alpha})`
}

export function colorForSource(seed: string): string {
  return colorFromSeed(`source:${seed}`, 0.35)
}

export function colorForAssignee(seed: string): string {
  return colorFromSeed(`assignee:${seed}`, 0.4)
}

function initSchema(conn: Database.Database): void {
  conn.pragma('journal_mode = WAL')
  conn.pragma('foreign_keys = ON')

  conn.exec(`
    CREATE TABLE IF NOT EXISTS source_accounts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      source_key TEXT NOT NULL UNIQUE,
      first_name TEXT NOT NULL,
      color TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS performances (
      performance_id TEXT PRIMARY KEY,
      event_id TEXT,
      event_name TEXT NOT NULL,
      event_slug TEXT,
      venue TEXT,
      subvenue TEXT,
      datetime TEXT NOT NULL,
      day_key TEXT NOT NULL,
      status TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS tickets (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      source_account_id INTEGER NOT NULL,
      performance_id TEXT NOT NULL,
      order_id TEXT NOT NULL,
      external_ticket_id TEXT NOT NULL,
      barcode TEXT,
      barcode_url TEXT,
      status TEXT,
      raw_json TEXT NOT NULL,
      ticket_index INTEGER NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(source_account_id, performance_id, order_id, external_ticket_id),
      FOREIGN KEY(source_account_id) REFERENCES source_accounts(id) ON DELETE CASCADE,
      FOREIGN KEY(performance_id) REFERENCES performances(performance_id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS assignees (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL COLLATE NOCASE UNIQUE,
      color TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS ticket_assignments (
      ticket_id INTEGER PRIMARY KEY,
      assignee_id INTEGER NOT NULL,
      assigned_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(ticket_id) REFERENCES tickets(id) ON DELETE CASCADE,
      FOREIGN KEY(assignee_id) REFERENCES assignees(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_performances_day_key ON performances(day_key);
    CREATE INDEX IF NOT EXISTS idx_tickets_performance ON tickets(performance_id);
    CREATE INDEX IF NOT EXISTS idx_tickets_source_account ON tickets(source_account_id);
    CREATE INDEX IF NOT EXISTS idx_ticket_assignments_assignee ON ticket_assignments(assignee_id);
  `)
}

function conn(): Database.Database {
  if (db) return db

  const dbPath = getDbPath()
  ensureDbDir(dbPath)
  db = new Database(dbPath)
  initSchema(db)
  return db
}

export function sourceKeyFromCookie(cookie: string): string {
  return crypto.createHash('sha256').update(cookie).digest('hex').slice(0, 24)
}

export function upsertSourceAccount(input: SourceAccountInput): SourceAccountRow {
  const database = conn()
  const color = colorForSource(input.sourceKey)

  const upsert = database.prepare(`
    INSERT INTO source_accounts(source_key, first_name, color)
    VALUES (@sourceKey, @firstName, @color)
    ON CONFLICT(source_key) DO UPDATE SET
      first_name = excluded.first_name,
      updated_at = CURRENT_TIMESTAMP
  `)

  upsert.run({
    sourceKey: input.sourceKey,
    firstName: input.firstName,
    color,
  })

  return database
    .prepare('SELECT id, first_name, color FROM source_accounts WHERE source_key = ?')
    .get(input.sourceKey) as SourceAccountRow
}

export function upsertPerformance(input: PerformanceInput): void {
  const database = conn()
  const stmt = database.prepare(`
    INSERT INTO performances(
      performance_id,
      event_id,
      event_name,
      event_slug,
      venue,
      subvenue,
      datetime,
      day_key,
      status
    ) VALUES (
      @performanceId,
      @eventId,
      @eventName,
      @eventSlug,
      @venue,
      @subvenue,
      @datetime,
      @dayKey,
      @status
    )
    ON CONFLICT(performance_id) DO UPDATE SET
      event_id = excluded.event_id,
      event_name = excluded.event_name,
      event_slug = excluded.event_slug,
      venue = excluded.venue,
      subvenue = excluded.subvenue,
      datetime = excluded.datetime,
      day_key = excluded.day_key,
      status = excluded.status,
      updated_at = CURRENT_TIMESTAMP
  `)

  stmt.run({
    performanceId: input.performanceId,
    eventId: input.eventId,
    eventName: input.eventName,
    eventSlug: input.eventSlug,
    venue: input.venue,
    subvenue: input.subvenue,
    datetime: input.datetime,
    dayKey: dayKeyFromDateTime(input.datetime),
    status: input.status,
  })
}

export function upsertTicket(input: TicketInput): void {
  const database = conn()
  const stmt = database.prepare(`
    INSERT INTO tickets(
      source_account_id,
      performance_id,
      order_id,
      external_ticket_id,
      barcode,
      barcode_url,
      status,
      raw_json,
      ticket_index
    ) VALUES (
      @sourceAccountId,
      @performanceId,
      @orderId,
      @externalTicketId,
      @barcode,
      @barcodeUrl,
      @status,
      @rawJson,
      @ticketIndex
    )
    ON CONFLICT(source_account_id, performance_id, order_id, external_ticket_id)
    DO UPDATE SET
      barcode = excluded.barcode,
      barcode_url = excluded.barcode_url,
      status = excluded.status,
      raw_json = excluded.raw_json,
      ticket_index = excluded.ticket_index,
      updated_at = CURRENT_TIMESTAMP
  `)

  stmt.run(input)
}

export function listAssignees(): PlannerAssignee[] {
  const database = conn()
  return database
    .prepare('SELECT id, name, color FROM assignees ORDER BY name COLLATE NOCASE ASC')
    .all() as PlannerAssignee[]
}

export function getOrCreateAssignee(name: string): PlannerAssignee {
  const cleaned = name.trim()
  if (!cleaned) {
    throw new Error('assignee name is required')
  }

  const database = conn()
  const existing = database
    .prepare('SELECT id, name, color FROM assignees WHERE name = ? COLLATE NOCASE')
    .get(cleaned) as PlannerAssignee | undefined

  if (existing) return existing

  const color = colorForAssignee(cleaned.toLowerCase())
  database
    .prepare('INSERT INTO assignees(name, color) VALUES(?, ?)')
    .run(cleaned, color)

  return database
    .prepare('SELECT id, name, color FROM assignees WHERE name = ? COLLATE NOCASE')
    .get(cleaned) as PlannerAssignee
}

export function assignTickets(ticketIds: number[], assigneeId: number): void {
  if (ticketIds.length === 0) return
  const database = conn()

  const txn = database.transaction((ids: number[]) => {
    const stmt = database.prepare(`
      INSERT INTO ticket_assignments(ticket_id, assignee_id)
      VALUES(?, ?)
      ON CONFLICT(ticket_id) DO UPDATE SET
        assignee_id = excluded.assignee_id,
        assigned_at = CURRENT_TIMESTAMP
    `)

    for (const id of ids) {
      stmt.run(id, assigneeId)
    }
  })

  txn(ticketIds)
}

export function unassignTickets(ticketIds: number[]): void {
  if (ticketIds.length === 0) return
  const database = conn()
  const stmt = database.prepare('DELETE FROM ticket_assignments WHERE ticket_id = ?')

  const txn = database.transaction((ids: number[]) => {
    for (const id of ids) {
      stmt.run(id)
    }
  })

  txn(ticketIds)
}

export function listPerformancesWithTickets(dayKey?: string, assigneeId?: number): PlannerPerformance[] {
  const database = conn()

  const rows = database
    .prepare(`
      SELECT
        p.performance_id AS performanceId,
        p.event_name AS eventName,
        p.event_slug AS eventSlug,
        p.venue AS venue,
        p.subvenue AS subvenue,
        p.datetime AS datetime,
        p.day_key AS dayKey,
        t.id AS ticketId,
        t.barcode AS barcode,
        t.barcode_url AS barcodeUrl,
        sa.first_name AS sourceFirstName,
        sa.color AS sourceColor,
        a.id AS assigneeId,
        a.name AS assigneeName,
        a.color AS assigneeColor
      FROM performances p
      JOIN tickets t ON t.performance_id = p.performance_id
      JOIN source_accounts sa ON sa.id = t.source_account_id
      LEFT JOIN ticket_assignments ta ON ta.ticket_id = t.id
      LEFT JOIN assignees a ON a.id = ta.assignee_id
      WHERE (@dayKey IS NULL OR p.day_key = @dayKey)
        AND (@assigneeId IS NULL OR a.id = @assigneeId)
      ORDER BY p.datetime ASC, p.event_name ASC, t.ticket_index ASC
    `)
    .all({
      dayKey: dayKey ?? null,
      assigneeId: assigneeId ?? null,
    }) as Array<{
      performanceId: string
      eventName: string
      eventSlug: string | null
      venue: string | null
      subvenue: string | null
      datetime: string
      dayKey: string
      ticketId: number
      barcode: string | null
      barcodeUrl: string | null
      sourceFirstName: string
      sourceColor: string
      assigneeId: number | null
      assigneeName: string | null
      assigneeColor: string | null
    }>

  const map = new Map<string, PlannerPerformance>()

  for (const row of rows) {
    const key = row.performanceId
    const existing = map.get(key)
    const ticket: PlannerTicket = {
      id: row.ticketId,
      barcode: row.barcode,
      barcodeUrl: row.barcodeUrl,
      sourceFirstName: row.sourceFirstName,
      sourceColor: row.sourceColor,
      assigneeId: row.assigneeId,
      assigneeName: row.assigneeName,
      assigneeColor: row.assigneeColor,
      performanceId: row.performanceId,
    }

    if (!existing) {
      map.set(key, {
        performanceId: row.performanceId,
        eventName: row.eventName,
        eventSlug: row.eventSlug,
        venue: row.venue,
        subvenue: row.subvenue,
        datetime: row.datetime,
        dayKey: row.dayKey,
        sourceCount: 1,
        assignedCount: row.assigneeId ? 1 : 0,
        unassignedCount: row.assigneeId ? 0 : 1,
        tickets: [ticket],
      })
      continue
    }

    existing.tickets.push(ticket)
    existing.sourceCount += 1
    if (row.assigneeId) {
      existing.assignedCount += 1
    } else {
      existing.unassignedCount += 1
    }
  }

  return Array.from(map.values())
}
