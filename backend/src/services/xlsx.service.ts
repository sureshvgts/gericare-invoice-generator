import Papa from "papaparse";
import * as XLSX from "xlsx";

import { db } from "../db";
import type { BillSummary, ServiceItem } from "../types/invoice";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatDate(value: unknown): string {
	if (value instanceof Date) {
		const d = value;
		return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;
	}
	if (typeof value === "string" && value.trim()) return value.trim();
	return "";
}

function parseXlsxSheet(buffer: ArrayBuffer): {
	headers: string[];
	rows: unknown[][];
} {
	const wb = XLSX.read(new Uint8Array(buffer), {
		type: "array",
		cellDates: true,
	});

	// Read ALL sheets and concatenate rows (headers from first sheet)
	let headers: string[] = [];
	const allRows: unknown[][] = [];

	for (let s = 0; s < wb.SheetNames.length; s++) {
		const ws = wb.Sheets[wb.SheetNames[s]];
		const data = XLSX.utils.sheet_to_json<unknown[]>(ws, {
			header: 1,
			defval: "",
		});

		if (data.length === 0) continue;

		if (s === 0) {
			// First sheet: Row 0 = title, Row 1 = headers, Row 2+ = data
			headers = ((data[1] as unknown[]) ?? []).map((h) =>
				String(h).trim().toUpperCase(),
			);
			allRows.push(...(data.slice(2) as unknown[][]));
			console.log(
				`[parseXlsx] sheet "${wb.SheetNames[s]}": ${data.length - 2} data rows`,
			);
		} else {
			// Subsequent sheets: check if row 0 or row 1 looks like headers
			const row0 = (data[0] as unknown[]) ?? [];
			const row0Str = row0.map((h) => String(h).trim().toUpperCase());

			// If row 0 matches the headers from sheet 1, skip it (and possible title row)
			const headersMatch =
				headers.length > 0 &&
				headers.slice(0, 3).every((h) => row0Str.includes(h));

			if (headersMatch) {
				// Row 0 is a header row — data starts from row 1
				allRows.push(...(data.slice(1) as unknown[][]));
				console.log(
					`[parseXlsx] sheet "${wb.SheetNames[s]}": ${data.length - 1} data rows (header on row 0)`,
				);
			} else {
				// Check row 1 (title + header pattern like first sheet)
				const row1 = (data[1] as unknown[]) ?? [];
				const row1Str = row1.map((h) => String(h).trim().toUpperCase());
				const row1Match =
					headers.length > 0 &&
					headers.slice(0, 3).every((h) => row1Str.includes(h));

				if (row1Match) {
					allRows.push(...(data.slice(2) as unknown[][]));
					console.log(
						`[parseXlsx] sheet "${wb.SheetNames[s]}": ${data.length - 2} data rows (title + header)`,
					);
				} else {
					// No header detected — treat all rows as data
					allRows.push(...(data as unknown[][]));
					console.log(
						`[parseXlsx] sheet "${wb.SheetNames[s]}": ${data.length} data rows (no header)`,
					);
				}
			}
		}
	}

	console.log(
		`[parseXlsx] total sheets: ${wb.SheetNames.length}, total data rows: ${allRows.length}`,
	);
	return { headers, rows: allRows };
}

// Known header names to detect whether a row is a header row
const KNOWN_HEADERS = [
	"BILL NO",
	"SNO",
	"SN0",
	"UHID",
	"PATIENT NAME",
	"SERVICE NAME",
	"BILL DATE",
];

function isHeaderRow(row: unknown[]): boolean {
	const cells = row.map((c) => String(c).trim().toUpperCase());
	return KNOWN_HEADERS.some((h) => cells.includes(h));
}

function parseCsvSheet(buffer: ArrayBuffer): {
	headers: string[];
	rows: unknown[][];
} {
	const text = new TextDecoder().decode(buffer);
	const result = Papa.parse<string[]>(text, { skipEmptyLines: true });
	const allRows = result.data;

	console.log("data", allRows);

	// Auto-detect: headers on row 0 (no title) or row 1 (with title)
	const row0 = allRows[0] ?? [];
	if (isHeaderRow(row0)) {
		// Headers on row 0, data from row 1
		const headers = row0.map((h) => String(h).trim().toUpperCase());
		console.log("[parseCsv] headers on row 0 (no title row)");
		return { headers, rows: allRows.slice(1) as unknown[][] };
	}
	// Headers on row 1 (row 0 is title), data from row 2
	const headers = (allRows[1] ?? []).map((h) => String(h).trim().toUpperCase());
	console.log("[parseCsv] headers on row 1 (title row skipped)");
	return { headers, rows: allRows.slice(2) as unknown[][] };
}

function parseSheet(
	buffer: ArrayBuffer,
	filename?: string,
): {
	headers: string[];
	rows: unknown[][];
} {
	if (filename?.toLowerCase().endsWith(".csv")) {
		return parseCsvSheet(buffer);
	}
	return parseXlsxSheet(buffer);
}

// Exported for debugging — returns raw structure so you can see what SheetJS parsed
export function debugParseSheet(buffer: ArrayBuffer): {
	headers: string[];
	rows: unknown[][];
	rawRow0: unknown[];
	rawRow1: unknown[];
} {
	const wb = XLSX.read(new Uint8Array(buffer), {
		type: "array",
		cellDates: true,
	});
	const ws = wb.Sheets[wb.SheetNames[1]];
	const data = XLSX.utils.sheet_to_json<unknown[]>(ws, {
		header: 1,
		defval: "",
	});
	const rawRow0 = (data[0] as unknown[]) ?? [];
	const rawRow1 = (data[1] as unknown[]) ?? [];
	const headers = rawRow1.map((h) => String(h).trim().toUpperCase());
	return { headers, rows: data.slice(2) as unknown[][], rawRow0, rawRow1 };
}

// Numbers from xlsx can be floats (e.g. 912540000833.0) — normalize to string
// Also handle scientific notation strings from CSV (e.g. "9.1254E+11")
function col(row: unknown[], headers: string[], name: string): string {
	const idx = headers.indexOf(name);
	if (idx < 0) return "";
	const val = row[idx];
	if (typeof val === "number") return String(Math.round(val));
	const str = String(val ?? "").trim();
	// Convert scientific notation strings like "9.1254E+11" to full integer strings
	if (/^[\d.]+[eE][+\-]?\d+$/.test(str)) {
		const num = Number(str);
		if (!Number.isNaN(num) && Number.isFinite(num))
			return String(Math.round(num));
	}
	return str;
}

function colRaw(row: unknown[], headers: string[], name: string): unknown {
	const idx = headers.indexOf(name);
	return idx >= 0 ? row[idx] : "";
}

// ─── Import ───────────────────────────────────────────────────────────────────

export async function importXlsxToDb(
	billBuffer: ArrayBuffer,
	itemBuffer: ArrayBuffer,
	billFilename?: string,
	itemFilename?: string,
): Promise<{ bills: number; items: number; skipped: number }> {
	const { headers: bh, rows: billRows } = parseSheet(billBuffer, billFilename);
	const { headers: ih, rows: itemRows } = parseSheet(itemBuffer, itemFilename);

	console.log("[import] item headers found:", ih);
	console.log(
		"[import] SERVICE GROUPNAME index:",
		ih.indexOf("SERVICE GROUPNAME"),
	);

	// ── 1. Parse service items
	const items: (ServiceItem & { doa: string; dod: string; ward: string })[] =
		itemRows
			.filter((r) => col(r, ih, "BILL NO") !== "")
			.map((r) => ({
				billNo: col(r, ih, "BILL NO"),
				orderDate: formatDate(colRaw(r, ih, "ORDERDATE")),
				serviceGroupName: col(r, ih, "SERVICE GROUPNAME"),
				serviceCode: col(r, ih, "SERVICE CODE"),
				serviceName: col(r, ih, "SERVICE NAME"),
				serviceQty: parseFloat(col(r, ih, "SERVICE QTY")) || 0,
				serviceUnitPrice: parseFloat(col(r, ih, "SERVICE UNITPRICE")) || 0,
				serviceAmount: parseFloat(col(r, ih, "SERVICE AMOUNT")) || 0,
				doa: formatDate(colRaw(r, ih, "DOA")),
				dod: formatDate(colRaw(r, ih, "DOD")),
				ward: col(r, ih, "WARD"),
			}));

	// ── 2. Parse bill summaries (without DOA/DOD/Ward yet — enriched below)
	const summaries: BillSummary[] = billRows
		.filter((r) => col(r, bh, "BILL NO") !== "")
		.map((r) => ({
			billNo: col(r, bh, "BILL NO"),
			uhid: col(r, bh, "UHID"),
			encounterNo: col(r, bh, "ENCOUNTER NO"),
			patientName: col(r, bh, "PATIENT NAME"),
			consultantName: col(r, bh, "CONSULTANT NAME"),
			department: col(r, bh, "DEPARTMENT"),
			payType: col(r, bh, "PAY TYPE"),
			totalNetAmount: parseFloat(col(r, bh, "TOTAL NET AMOUNT")) || 0,
			date: formatDate(colRaw(r, bh, "DATE")),
			doa: "",
			dod: "",
			ward: "",
		}));

	// ── 3. Fix bill number precision loss from Excel
	// Excel may truncate large numbers: 912540000833 → 9.1254E+11 → 912540000000
	// Use bill summary as source of truth and remap item bill numbers
	const correctBillNos = summaries.map((s) => s.billNo);
	const billNoFixMap = new Map<string, string>();
	const uniqueItemBillNos = new Set(items.map((i) => i.billNo));

	for (const itemBillNo of uniqueItemBillNos) {
		if (correctBillNos.includes(itemBillNo)) {
			billNoFixMap.set(itemBillNo, itemBillNo);
		} else {
			// Match by first 6 digits + same length (handles precision loss)
			const match = correctBillNos.find(
				(correct) =>
					correct.startsWith(itemBillNo.slice(0, 6)) &&
					correct.length === itemBillNo.length,
			);
			if (match) {
				billNoFixMap.set(itemBillNo, match);
				console.log(`[import] bill number fix: "${itemBillNo}" -> "${match}"`);
			} else {
				billNoFixMap.set(itemBillNo, itemBillNo);
			}
		}
	}

	// Apply fix to all items
	for (const item of items) {
		item.billNo = billNoFixMap.get(item.billNo) ?? item.billNo;
	}

	// ── 4. Group items by bill and enrich summaries with DOA/DOD/Ward
	const itemsByBill = new Map<string, typeof items>();
	for (const item of items) {
		if (!itemsByBill.has(item.billNo)) itemsByBill.set(item.billNo, []);
		itemsByBill.get(item.billNo)?.push(item);
	}

	for (const s of summaries) {
		const billItems = itemsByBill.get(s.billNo);
		const first = billItems?.[0];
		if (first) {
			s.doa = first.doa;
			s.dod = first.dod;
			s.ward = first.ward;
		}
	}

	// ── Logging
	console.log(
		"[import] bill rows (raw):",
		billRows.length,
		"-> parsed summaries:",
		summaries.length,
	);
	console.log(
		"[import] item rows (raw):",
		itemRows.length,
		"-> parsed items:",
		items.length,
	);
	if (summaries.length > 0) console.log("[import] first bill:", summaries[0]);
	if (items.length > 0) console.log("[import] first item:", items[0]);
	for (const [billNo, billItems] of itemsByBill) {
		console.log(`[import] bill ${billNo}: ${billItems.length} items`);
	}

	// ── 5. Upsert bill summaries
	for (const s of summaries) {
		await db`
      INSERT INTO bill_summary
        (bill_no, uhid, encounter_no, patient_name, consultant_name, department, pay_type, total_net_amount, date, doa, dod, ward)
      VALUES
        (${s.billNo}, ${s.uhid}, ${s.encounterNo}, ${s.patientName}, ${s.consultantName}, ${s.department}, ${s.payType}, ${s.totalNetAmount}, ${s.date}, ${s.doa}, ${s.dod}, ${s.ward})
      ON CONFLICT (bill_no) DO UPDATE SET
        uhid             = EXCLUDED.uhid,
        encounter_no     = EXCLUDED.encounter_no,
        patient_name     = EXCLUDED.patient_name,
        consultant_name  = EXCLUDED.consultant_name,
        department       = EXCLUDED.department,
        pay_type         = EXCLUDED.pay_type,
        total_net_amount = EXCLUDED.total_net_amount,
        date             = EXCLUDED.date,
        doa              = EXCLUDED.doa,
        dod              = EXCLUDED.dod,
        ward             = EXCLUDED.ward
    `;
	}

	// ── 6. Replace service items
	const uniqueBillNos = [...new Set(items.map((i) => i.billNo))];
	for (const billNo of uniqueBillNos) {
		await db`DELETE FROM service_items WHERE bill_no = ${billNo}`;
	}

	for (const item of items) {
		await db`
      INSERT INTO service_items (bill_no, order_date, service_group_name, service_code, service_name, service_qty, service_unit_price, service_amount)
      VALUES (${item.billNo}, ${item.orderDate}, ${item.serviceGroupName}, ${item.serviceCode}, ${item.serviceName}, ${item.serviceQty}, ${item.serviceUnitPrice}, ${item.serviceAmount})
    `;
	}

	const billNoSet = new Set(summaries.map((s) => s.billNo));
	const orphanItems = items.filter((i) => !billNoSet.has(i.billNo)).length;
	if (orphanItems > 0)
		console.log(`[import] ${orphanItems} items have no matching bill summary`);

	return { bills: summaries.length, items: items.length, skipped: orphanItems };
}
