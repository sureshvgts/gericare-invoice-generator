import type { BillListResponse, ImportResponse } from "./types";

const API_BASE = "http://localhost:8000/api";

export const api = {
	async getBills(limit = 50, offset = 0): Promise<BillListResponse> {
		const res = await fetch(
			`${API_BASE}/invoice?limit=${limit}&offset=${offset}`,
		);
		if (!res.ok) throw new Error("Failed to fetch bills");
		return res.json();
	},

	async uploadFiles(formData: FormData): Promise<ImportResponse> {
		const res = await fetch(`${API_BASE}/invoice/import`, {
			method: "POST",
			body: formData,
		});
		if (!res.ok) {
			const err = await res.json().catch(() => ({ error: "Upload failed" }));
			throw new Error(err.error || "Upload failed");
		}
		return res.json();
	},

	async downloadPdf(billNo: string): Promise<Blob> {
		const res = await fetch(`${API_BASE}/invoice/${billNo}`);
		if (!res.ok) throw new Error("Failed to download PDF");
		return res.blob();
	},

	async downloadErpReport(billNos: string[]): Promise<Blob> {
		const res = await fetch(`${API_BASE}/report/erp`, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ billNos }),
		});
		if (!res.ok) throw new Error("Failed to generate ERP report");
		return res.blob();
	},

	async downloadErpReportSingle(billNo: string): Promise<Blob> {
		const res = await fetch(`${API_BASE}/report/erp/${billNo}`);
		if (!res.ok) throw new Error("Failed to generate ERP report");
		return res.blob();
	},
};
