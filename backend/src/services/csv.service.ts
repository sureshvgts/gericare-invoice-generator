import path from 'path'

import Papa from 'papaparse'

import { db } from '../db'
import type { BillSummary, ServiceItem } from '../types/invoice'

// Place your CSVs in backend/data/
const DATA_DIR = path.join(import.meta.dir, '..', '..', 'data')

function parseRows(text: string): { headers: string[]; rows: string[][] } {
  const result = Papa.parse<string[]>(text, { skipEmptyLines: true })
  const allRows = result.data
  // Row 0: report title (skip), Row 1: column headers, Row 2+: data
  const headers = (allRows[1] ?? []).map((h) => h.trim().toUpperCase())
  const rows = allRows.slice(2) as string[][]
  return { headers, rows }
}

function col(row: string[], headers: string[], name: string): string {
  const idx = headers.indexOf(name)
  return idx >= 0 ? (row[idx] ?? '').trim() : ''
}

async function parseBillSummaries(): Promise<BillSummary[]> {
  const text = await Bun.file(path.join(DATA_DIR, 'bill_summary.csv')).text()
  const { headers, rows } = parseRows(text)

  return rows
    .filter((r) => col(r, headers, 'BILL NO') !== '')
    .map((r) => ({
      billNo: col(r, headers, 'BILL NO'),
      patientName: col(r, headers, 'PATIENT NAME'),
      uhid: col(r, headers, 'UHID'),
      totalNetAmount: parseFloat(col(r, headers, 'TOTAL NET AMOUNT')) || 0,
      date: col(r, headers, 'DATE'),
    }))
}

async function parseServiceItems(): Promise<ServiceItem[]> {
  const text = await Bun.file(path.join(DATA_DIR, 'item_report.csv')).text()
  const { headers, rows } = parseRows(text)

  return rows
    .filter((r) => col(r, headers, 'BILL NO') !== '')
    .map((r) => ({
      billNo: col(r, headers, 'BILL NO'),
      serviceName: col(r, headers, 'SERVICE NAME'),
      serviceQty: parseFloat(col(r, headers, 'SERVICE QTY')) || 0,
      serviceUnitPrice: parseFloat(col(r, headers, 'SERVICE UNITPRICE')) || 0,
      serviceAmount: parseFloat(col(r, headers, 'SERVICE AMOUNT')) || 0,
    }))
}

export async function importCsvToDb(): Promise<{ bills: number; items: number }> {
  const [summaries, items] = await Promise.all([parseBillSummaries(), parseServiceItems()])

  // Upsert bill summaries
  for (const s of summaries) {
    await db`
      INSERT INTO bill_summary (bill_no, patient_name, uhid, total_net_amount, date)
      VALUES (${s.billNo}, ${s.patientName}, ${s.uhid}, ${s.totalNetAmount}, ${s.date})
      ON CONFLICT (bill_no) DO UPDATE SET
        patient_name     = EXCLUDED.patient_name,
        uhid             = EXCLUDED.uhid,
        total_net_amount = EXCLUDED.total_net_amount,
        date             = EXCLUDED.date
    `
  }

  // Replace service items per bill (delete + re-insert for clean sync)
  const billNos = [...new Set(items.map((i) => i.billNo))]
  for (const billNo of billNos) {
    await db`DELETE FROM service_items WHERE bill_no = ${billNo}`
  }

  for (const item of items) {
    await db`
      INSERT INTO service_items (bill_no, service_name, service_qty, service_unit_price, service_amount)
      VALUES (${item.billNo}, ${item.serviceName}, ${item.serviceQty}, ${item.serviceUnitPrice}, ${item.serviceAmount})
    `
  }

  return { bills: summaries.length, items: items.length }
}
