import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { z } from "zod";

import { db } from "../db";
import { generateInvoicePdf } from "../services/pdf.service";
import { importXlsxToDb } from "../services/xlsx.service";
import type { BillSummary, ServiceItem } from "../types/invoice";

const invoice = new Hono();

// GET /api/invoice — list all bills with pagination
invoice.get("/", async (c) => {
	const limit = Math.min(Number(c.req.query("limit") ?? 50), 200);
	const offset = Number(c.req.query("offset") ?? 0);

	const [rows, countResult] = await Promise.all([
		db`
			SELECT bill_no, uhid, encounter_no, patient_name, consultant_name,
			       department, pay_type, total_net_amount::float, date, doa, dod, ward
			FROM bill_summary
			ORDER BY date DESC
			LIMIT ${limit} OFFSET ${offset}
		`,
		db`SELECT count(*)::int AS total FROM bill_summary`,
	]);

	return c.json({ bills: rows, total: countResult[0].total, limit, offset });
});

// POST /api/invoice/import
// Body: multipart/form-data
//   billSummary: File  (IP Bill Breakup Revenue Details.xlsx)
//   itemReport:  File  (Item Wise Service Report.xlsx)
invoice.post("/import", async (c) => {
	const body = await c.req.parseBody();

	const billFile = body.billSummary;
	const itemFile = body.itemReport;

	if (!(billFile instanceof File) || !(itemFile instanceof File)) {
		return c.json(
			{ error: "Both billSummary and itemReport files are required" },
			400,
		);
	}

	const [billBuffer, itemBuffer] = await Promise.all([
		billFile.arrayBuffer(),
		itemFile.arrayBuffer(),
	]);

	const result = await importXlsxToDb(
		billBuffer,
		itemBuffer,
		billFile.name,
		itemFile.name,
	);
	return c.json({ message: "Import successful", ...result });
});

// POST /api/invoice/debug — returns raw parsed rows to diagnose structure issues
invoice.post("/debug", async (c) => {
	const body = await c.req.parseBody();

	const file = body.file;

	if (!(file instanceof File))
		return c.json({ error: 'Send a file field named "file"' }, 400);

	const { debugParseSheet } = await import("../services/xlsx.service");
	const buf = await file.arrayBuffer();
	const { headers, rows } = debugParseSheet(buf);

	return c.json({
		totalRows: rows.length,
		headers,
		firstRow: rows[0] ?? null,
		secondRow: rows[1] ?? null,
	});
});

// GET /api/invoice/:billNo — reads from DB and returns PDF
invoice.get(
	"/:billNo",
	zValidator("param", z.object({ billNo: z.string().min(1) })),
	async (c) => {
		const { billNo } = c.req.valid("param");

		const [summaryRows, itemRows] = await Promise.all([
			db`
        SELECT bill_no, uhid, encounter_no, patient_name, consultant_name,
               department, pay_type, total_net_amount::float, date, doa, dod, ward
        FROM bill_summary
        WHERE bill_no = ${billNo}
      `,
			db`
        SELECT bill_no, order_date, service_group_name, service_code, service_name,
               service_qty::float, service_unit_price::float, service_amount::float
        FROM service_items
        WHERE bill_no = ${billNo}
        ORDER BY id
      `,
		]);

		if (summaryRows.length === 0) {
			return c.json({ error: "Bill not found", billNo }, 404);
		}

		const row = summaryRows[0];
		const bill: BillSummary = {
			billNo: row.bill_no,
			uhid: row.uhid,
			encounterNo: row.encounter_no,
			patientName: row.patient_name,
			consultantName: row.consultant_name,
			department: row.department,
			payType: row.pay_type,
			totalNetAmount: row.total_net_amount,
			date: row.date,
			doa: row.doa,
			dod: row.dod,
			ward: row.ward,
		};

		const items: ServiceItem[] = itemRows.map((r) => ({
			billNo: r.bill_no,
			orderDate: r.order_date,
			serviceGroupName: r.service_group_name,
			serviceCode: r.service_code,
			serviceName: r.service_name,
			serviceQty: r.service_qty,
			serviceUnitPrice: r.service_unit_price,
			serviceAmount: r.service_amount,
		}));

		console.log(`[pdf] generating for bill ${billNo}, ${items.length} items`);

		let pdfBytes: Uint8Array;
		try {
			pdfBytes = await generateInvoicePdf(bill, items);
		} catch (err) {
			console.error(`[pdf] generation failed for bill ${billNo}:`, err);
			return c.json({ error: "PDF generation failed", detail: String(err) }, 500);
		}

		console.log(`[pdf] done, ${pdfBytes.byteLength} bytes`);

		return new Response(pdfBytes, {
			headers: {
				"Content-Type": "application/pdf",
				"Content-Disposition": `attachment; filename="invoice-${billNo}.pdf"`,
				"Content-Length": pdfBytes.byteLength.toString(),
			},
		});
	},
);

export default invoice;
