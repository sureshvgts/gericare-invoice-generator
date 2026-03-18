import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { z } from "zod";

import { generateErpReport } from "../services/erp-report.service";

const report = new Hono();

// POST /api/report/erp
// Body: { billNos: ["912540000833", "912540000835", ...] }
// Returns: .xlsx file download
report.post(
	"/erp",
	zValidator(
		"json",
		z.object({
			billNos: z
				.array(z.string().min(1))
				.min(1, "At least one bill number required"),
		}),
	),
	async (c) => {
		const { billNos } = c.req.valid("json");

		console.log(`[erp-report] generating for ${billNos.length} bills`);

		let xlsxBytes: Uint8Array;
		try {
			xlsxBytes = await generateErpReport(billNos);
		} catch (err) {
			console.error("[erp-report] generation failed:", err);
			return c.json(
				{ error: "Report generation failed", detail: String(err) },
				500,
			);
		}

		console.log(`[erp-report] done, ${xlsxBytes.byteLength} bytes`);

		const filename = `erp-sales-invoice-${new Date().toISOString().slice(0, 10)}.xlsx`;

		return new Response(xlsxBytes, {
			headers: {
				"Content-Type":
					"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
				"Content-Disposition": `attachment; filename="${filename}"`,
				"Content-Length": xlsxBytes.byteLength.toString(),
			},
		});
	},
);

// GET /api/report/erp/:billNo — single bill ERP report download
report.get(
	"/erp/:billNo",
	zValidator("param", z.object({ billNo: z.string().min(1) })),
	async (c) => {
		const { billNo } = c.req.valid("param");

		console.log(`[erp-report] generating for bill ${billNo}`);

		let xlsxBytes: Uint8Array;
		try {
			xlsxBytes = await generateErpReport([billNo]);
		} catch (err) {
			console.error("[erp-report] generation failed:", err);
			return c.json(
				{ error: "Report generation failed", detail: String(err) },
				500,
			);
		}

		console.log(`[erp-report] done, ${xlsxBytes.byteLength} bytes`);

		const filename = `erp-report-${billNo}.xlsx`;

		return new Response(xlsxBytes, {
			headers: {
				"Content-Type":
					"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
				"Content-Disposition": `attachment; filename="${filename}"`,
				"Content-Length": xlsxBytes.byteLength.toString(),
			},
		});
	},
);

export default report;
