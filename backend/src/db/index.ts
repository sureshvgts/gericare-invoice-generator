import { SQL } from 'bun'

if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is not set')

export const db = new SQL(process.env.DATABASE_URL)

export async function setupTables(): Promise<void> {
  // Drop and recreate for POC — ensures schema is always in sync
  await db`DROP TABLE IF EXISTS service_items`
  await db`DROP TABLE IF EXISTS bill_summary`

  await db`
    CREATE TABLE IF NOT EXISTS bill_summary (
      bill_no          TEXT PRIMARY KEY,
      uhid             TEXT NOT NULL DEFAULT '',
      encounter_no     TEXT NOT NULL DEFAULT '',
      patient_name     TEXT NOT NULL,
      consultant_name  TEXT DEFAULT '',
      department       TEXT DEFAULT '',
      pay_type         TEXT DEFAULT '',
      total_net_amount NUMERIC(12, 2) NOT NULL DEFAULT 0,
      date             TEXT NOT NULL DEFAULT '',
      doa              TEXT DEFAULT '',
      dod              TEXT DEFAULT '',
      ward             TEXT DEFAULT ''
    )
  `

  await db`
    CREATE TABLE IF NOT EXISTS service_items (
      id                 SERIAL PRIMARY KEY,
      bill_no            TEXT NOT NULL,
      order_date         TEXT DEFAULT '',
      service_group_name TEXT DEFAULT '',
      service_code       TEXT DEFAULT '',
      service_name       TEXT NOT NULL,
      service_qty        NUMERIC(10, 2) NOT NULL DEFAULT 0,
      service_unit_price NUMERIC(12, 2) NOT NULL DEFAULT 0,
      service_amount     NUMERIC(12, 2) NOT NULL DEFAULT 0
    )
  `

  await db`CREATE INDEX IF NOT EXISTS idx_service_items_bill_no ON service_items(bill_no)`
}
