import * as XLSX from "xlsx";
import { db } from "../db";

// Sales Invoice CSV column headers (ERPNext format)
const HEADERS = [
	"ID",
	"Series",
	"Company",
	"Date",
	"Cost Center",
	"Currency",
	"Exchange Rate",
	"Price List",
	"Price List Currency",
	"Price List Exchange Rate",
	"Net Total (Company Currency)",
	"Grand Total (Company Currency)",
	"Grand Total",
	"Debit To",
	"ID (Items)",
	"Amount (Items)",
	"Amount (Company Currency) (Items)",
	"Cost Center (Items)",
	"Income Account (Items)",
	"Item Name (Items)",
	"Rate (Items)",
	"Rate (Company Currency) (Items)",
	"UOM (Items)",
	"UOM Conversion Factor (Items)",
];

// Default values for fields we always know
const COMPANY = "Geri Care Health Services Pvt. Ltd";
const SERIES = "SINV-.YY.-";
const CURRENCY = "INR";
const PRICE_LIST = "Standard Selling";
const DEBIT_TO = "Debtors - GCH";
const INCOME_ACCOUNT = "Sales - GCH";

export async function generateErpReport(
	billNos: string[],
): Promise<Uint8Array> {
	if (billNos.length === 0) throw new Error("No bill numbers provided");

	// Fetch all bills and their items in parallel
	const [billRows, itemRows] = await Promise.all([
		db`
      SELECT bill_no, uhid, encounter_no, patient_name, consultant_name,
             department, pay_type, total_net_amount::float, date, doa, dod, ward
      FROM bill_summary
      WHERE bill_no IN ${db(billNos)}
    `,
		db`
      SELECT bill_no, order_date, service_group_name, service_code, service_name,
             service_qty::float, service_unit_price::float, service_amount::float
      FROM service_items
      WHERE bill_no IN ${db(billNos)}
      ORDER BY bill_no, id
    `,
	]);

	// Index bills by bill_no
	const billMap = new Map<string, (typeof billRows)[0]>();
	for (const row of billRows) {
		billMap.set(row.bill_no, row);
	}

	// Group items by bill_no
	const itemMap = new Map<string, (typeof itemRows)>();
	for (const row of itemRows) {
		if (!itemMap.has(row.bill_no)) itemMap.set(row.bill_no, []);
		itemMap.get(row.bill_no)!.push(row);
	}

	// Build rows
	const outputRows: Record<string, string | number>[] = [];

	for (const billNo of billNos) {
		const bill = billMap.get(billNo);
		const items = itemMap.get(billNo) ?? [];

		if (!bill) {
			// Bill not found in DB — single row with empty item fields
			outputRows.push({
				ID: billNo,
				Series: SERIES,
				Company: COMPANY,
				Date: "",
				"Cost Center": "",
				Currency: CURRENCY,
				"Exchange Rate": 1.0,
				"Price List": PRICE_LIST,
				"Price List Currency": CURRENCY,
				"Price List Exchange Rate": 1.0,
				"Net Total (Company Currency)": "",
				"Grand Total (Company Currency)": "",
				"Grand Total": "",
				"Debit To": DEBIT_TO,
				"ID (Items)": "",
				"Amount (Items)": "",
				"Amount (Company Currency) (Items)": "",
				"Cost Center (Items)": "",
				"Income Account (Items)": "",
				"Item Name (Items)": "",
				"Rate (Items)": "",
				"Rate (Company Currency) (Items)": "",
				"UOM (Items)": "",
				"UOM Conversion Factor (Items)": "",
			});
			continue;
		}

		if (items.length === 0) {
			// Bill exists but no items — single row with bill-level data, empty items
			outputRows.push(buildRow(bill, null));
			continue;
		}

		// One row per service item, bill-level fields repeated
		for (const item of items) {
			outputRows.push(buildRow(bill, item));
		}
	}

	// Build workbook
	const ws = XLSX.utils.json_to_sheet(outputRows, { header: HEADERS });
	const wb = XLSX.utils.book_new();
	XLSX.utils.book_append_sheet(wb, ws, "Sales Invoice");

	// Set column widths for readability
	ws["!cols"] = HEADERS.map((h) => ({
		wch: Math.max(h.length + 2, 15),
	}));

	const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
	return new Uint8Array(buf);
}

function buildRow(
	bill: {
		bill_no: string;
		total_net_amount: number;
		date: string;
		department: string;
	},
	item: {
		service_name: string;
		service_unit_price: number;
		service_amount: number;
		service_qty: number;
		service_group_name: string;
		service_code: string;
	} | null,
): Record<string, string | number> {
	const netTotal = bill.total_net_amount ?? 0;
	const gst = netTotal * 0.18;
	const grandTotal = netTotal + gst;

	return {
		ID: bill.bill_no,
		Series: SERIES,
		Company: COMPANY,
		Date: bill.date ?? "",
		"Cost Center": bill.department ? `${bill.department} - GCH` : "",
		Currency: CURRENCY,
		"Exchange Rate": 1.0,
		"Price List": PRICE_LIST,
		"Price List Currency": CURRENCY,
		"Price List Exchange Rate": 1.0,
		"Net Total (Company Currency)": netTotal,
		"Grand Total (Company Currency)": grandTotal,
		"Grand Total": grandTotal,
		"Debit To": DEBIT_TO,
		"ID (Items)": item ? "" : "",
		"Amount (Items)": item ? item.service_amount : "",
		"Amount (Company Currency) (Items)": item ? item.service_amount : "",
		"Cost Center (Items)": bill.department
			? `${bill.department} - GCH`
			: "",
		"Income Account (Items)": item ? INCOME_ACCOUNT : "",
		"Item Name (Items)": item ? item.service_name : "",
		"Rate (Items)": item ? item.service_unit_price : "",
		"Rate (Company Currency) (Items)": item ? item.service_unit_price : "",
		"UOM (Items)": item ? "Nos" : "",
		"UOM Conversion Factor (Items)": item ? 1.0 : "",
	};
}
