import path from "node:path";
import PDFDocument from "pdfkit";

import type {
	BillSummary,
	ServiceCategory,
	ServiceItem,
} from "../types/invoice";
import { getServiceCategory } from "../types/invoice";

// ─── Font Paths (Noto Sans supports ₹ symbol) ──────────────────────────────
const FONT_DIR = path.join(import.meta.dir, "..", "fonts");
const FONT_REGULAR = path.join(FONT_DIR, "NotoSans-Regular.ttf");
const FONT_BOLD = path.join(FONT_DIR, "NotoSans-Bold.ttf");

// ─── Layout Constants ────────────────────────────────────────────────────────
const PAGE_W = 595;
const PAGE_H = 842;
const MARGIN = 40;
const CONTENT_W = PAGE_W - MARGIN * 2;
const BOTTOM_MARGIN = 60;
const ROW_H = 18;

// Column layout (total = CONTENT_W = 515)
const COLS = { date: 75, service: 175, hsn: 75, unit: 65, qty: 40, amount: 85 };
const COL_X = {
	date: MARGIN,
	service: MARGIN + COLS.date,
	hsn: MARGIN + COLS.date + COLS.service,
	unit: MARGIN + COLS.date + COLS.service + COLS.hsn,
	qty: MARGIN + COLS.date + COLS.service + COLS.hsn + COLS.unit,
	amount: MARGIN + COLS.date + COLS.service + COLS.hsn + COLS.unit + COLS.qty,
};

// Colors
const C_PRIMARY: [number, number, number] = [126, 27, 72]; // lab(28.521% 44.9839 -1.84727) → maroon/burgundy
const C_GRAY: [number, number, number] = [115, 115, 115];
const C_DGRAY: [number, number, number] = [64, 64, 64];
const C_HDR_BG: [number, number, number] = [224, 224, 224];
const C_CAT_BG: [number, number, number] = [250, 235, 242]; // light maroon tint to match primary
const C_SUB_BG: [number, number, number] = [240, 240, 240];

function fmt(n: number): string {
	return `₹ ${new Intl.NumberFormat("en-IN", { minimumFractionDigits: 1, maximumFractionDigits: 2 }).format(n)}`;
}

// ─── Category grouping ───────────────────────────────────────────────────────
const CATEGORY_ORDER: ServiceCategory[] = [
	"Consultation",
	"Pharmacy",
	"Investigation",
	"Others",
];

function groupByCategory(
	items: ServiceItem[],
): Map<ServiceCategory, ServiceItem[]> {
	const groups = new Map<ServiceCategory, ServiceItem[]>();
	for (const cat of CATEGORY_ORDER) groups.set(cat, []);
	for (const item of items) {
		const cat = getServiceCategory(item.serviceGroupName);
		groups.get(cat)?.push(item);
	}
	for (const [cat, catItems] of groups) {
		if (catItems.length === 0) groups.delete(cat);
	}
	return groups;
}

// ─── Drawing helpers ─────────────────────────────────────────────────────────
function drawTableHeader(
	doc: InstanceType<typeof PDFDocument>,
	y: number,
): number {
	doc.rect(MARGIN, y, CONTENT_W, ROW_H).fill(rgbStr(C_HDR_BG));
	const ty = y + 5;
	doc.fontSize(7.5).font("Noto-Bold").fillColor("black");
	doc.text("Date", COL_X.date + 4, ty, { width: COLS.date - 8 });
	doc.text("Particulars", COL_X.service + 4, ty, { width: COLS.service - 8 });
	doc.text("HSN/SAC", COL_X.hsn + 4, ty, {
		width: COLS.hsn - 8,
		align: "center",
	});
	doc.text("Unit Price", COL_X.unit + 4, ty, {
		width: COLS.unit - 8,
		align: "right",
	});
	doc.text("Qty", COL_X.qty + 4, ty, { width: COLS.qty - 8, align: "center" });
	doc.text("Amount", COL_X.amount + 4, ty, {
		width: COLS.amount - 8,
		align: "right",
	});
	doc
		.moveTo(MARGIN, y + ROW_H)
		.lineTo(PAGE_W - MARGIN, y + ROW_H)
		.lineWidth(0.5)
		.strokeColor("#999")
		.stroke();
	return y + ROW_H;
}

function measureRowHeight(
	doc: InstanceType<typeof PDFDocument>,
	serviceName: string,
): number {
	const textH = doc
		.font("Noto")
		.fontSize(7.5)
		.heightOfString(serviceName, { width: COLS.service - 10 });
	return Math.max(ROW_H, textH + 8);
}

function drawDataRow(
	doc: InstanceType<typeof PDFDocument>,
	y: number,
	item: ServiceItem,
): number {
	const dynH = measureRowHeight(doc, item.serviceName);
	const ty = y + 4;

	doc.fontSize(7.5).font("Noto").fillColor("black");
	doc.text(item.orderDate, COL_X.date + 4, ty, { width: COLS.date - 8 });
	doc.text(item.serviceName, COL_X.service + 4, ty, {
		width: COLS.service - 10,
	});
	doc.text(item.serviceCode, COL_X.hsn + 4, ty, {
		width: COLS.hsn - 8,
		align: "center",
	});
	doc.text(fmt(item.serviceUnitPrice), COL_X.unit + 4, ty, {
		width: COLS.unit - 8,
		align: "right",
	});
	const qtyStr =
		item.serviceQty % 1 === 0
			? String(Math.round(item.serviceQty))
			: String(item.serviceQty);
	doc.text(qtyStr, COL_X.qty + 4, ty, { width: COLS.qty - 8, align: "center" });
	doc.text(fmt(item.serviceAmount), COL_X.amount + 4, ty, {
		width: COLS.amount - 8,
		align: "right",
	});

	// light separator line
	doc
		.moveTo(MARGIN, y + dynH)
		.lineTo(PAGE_W - MARGIN, y + dynH)
		.lineWidth(0.2)
		.strokeColor("#ccc")
		.stroke();

	return dynH;
}

function rgbStr(c: [number, number, number]): string {
	return `#${c.map((v) => v.toString(16).padStart(2, "0")).join("")}`;
}

// ─── Main Generator ──────────────────────────────────────────────────────────
export async function generateInvoicePdf(
	bill: BillSummary,
	items: ServiceItem[],
): Promise<Uint8Array> {
	const t0 = Date.now();

	return new Promise((resolve, reject) => {
		const doc = new PDFDocument({
			size: "A4",
			margin: MARGIN,
			bufferPages: true,
		});

		// Register Noto Sans fonts (supports ₹ symbol)
		doc.registerFont("Noto", FONT_REGULAR);
		doc.registerFont("Noto-Bold", FONT_BOLD);
		const chunks: Buffer[] = [];
		doc.on("data", (chunk: Buffer) => chunks.push(chunk));
		doc.on("end", () => {
			const buf = Buffer.concat(chunks);
			console.log(
				`[pdf] saved in ${Date.now() - t0}ms, ${buf.byteLength} bytes`,
			);
			resolve(new Uint8Array(buf));
		});
		doc.on("error", reject);

		let y = MARGIN;

		function ensureSpace(needed: number) {
			if (y + needed > PAGE_H - BOTTOM_MARGIN) {
				doc.addPage();
				y = MARGIN;
				// Continuation header
				doc
					.fontSize(11)
					.font("Noto-Bold")
					.fillColor(rgbStr(C_PRIMARY))
					.text("GC GERI CARE", MARGIN, y);
				doc
					.fontSize(8)
					.font("Noto")
					.fillColor(rgbStr(C_DGRAY))
					.text(`Invoice # ${bill.billNo} (continued)`, MARGIN, y, {
						width: CONTENT_W,
						align: "right",
					});
				y += 20;
			}
		}

		// ── HEADER ──────────────────────────────────────────────────────────
		doc
			.fontSize(18)
			.font("Noto-Bold")
			.fillColor(rgbStr(C_PRIMARY))
			.text("GERI CARE", MARGIN, y);
		// Invoice # right-aligned
		doc
			.fontSize(9)
			.font("Noto")
			.fillColor(rgbStr(C_DGRAY))
			.text("Invoice #", MARGIN, y, { width: CONTENT_W, align: "right" });
		y += 20;
		doc
			.fontSize(7)
			.font("Noto")
			.fillColor(rgbStr(C_GRAY))
			.text("ELDERCARE BY GERIATRICIANS", MARGIN, y);
		doc
			.fontSize(14)
			.font("Noto-Bold")
			.fillColor(rgbStr(C_PRIMARY))
			.text(bill.billNo, MARGIN, y - 2, { width: CONTENT_W, align: "right" });
		y += 12;
		doc
			.fontSize(8)
			.font("Noto")
			.fillColor(rgbStr(C_DGRAY))
			.text("Guindy Chennai, Velachery", MARGIN, y);
		doc
			.fontSize(7)
			.font("Noto")
			.fillColor(rgbStr(C_GRAY))
			.text("Bill in supply", MARGIN, y, { width: CONTENT_W, align: "right" });
		y += 11;
		doc.text("City name, TEST - 123414", MARGIN, y);
		y += 11;
		doc.text("Ph: 9876543210", MARGIN, y);
		y += 14;

		// Divider
		doc
			.moveTo(MARGIN, y)
			.lineTo(PAGE_W - MARGIN, y)
			.lineWidth(0.5)
			.strokeColor("#999")
			.stroke();
		y += 8;

		// ── UHID / ENCOUNTER ────────────────────────────────────────────────
		doc.fontSize(9).font("Noto-Bold").fillColor("black");
		doc.text(`UHID: ${bill.uhid}`, MARGIN, y, { continued: false });
		doc.text(`Encounter No: ${bill.encounterNo}`, MARGIN + 180, y);
		y += 14;
		doc
			.moveTo(MARGIN, y)
			.lineTo(PAGE_W - MARGIN, y)
			.lineWidth(0.5)
			.strokeColor("#999")
			.stroke();
		y += 10;

		// ── BILL TO + PATIENT DETAILS ────────────────────────────────────────
		const leftW = CONTENT_W * 0.42;
		const rightX = MARGIN + leftW + 10;
		const infoY = y;

		doc.fontSize(10).font("Noto-Bold").text("Bill To", MARGIN, y);
		y += 14;
		doc.fontSize(9).font("Noto").text(bill.patientName, MARGIN, y);
		y += 12;
		doc
			.fontSize(8)
			.fillColor(rgbStr(C_GRAY))
			.text(bill.payType ? `, - ${bill.payType}` : ", - None", MARGIN, y);

		// Right side details
		const details: [string, string][] = [
			["Department:", bill.department || "None"],
			["Consultant:", bill.consultantName || ""],
			["Patient Type:", bill.payType || "Self Pay"],
			["Room:", bill.ward || ""],
			["Admission:", bill.doa || ""],
			["Discharge:", bill.dod || ""],
		];
		let detailY = infoY;
		for (const [label, value] of details) {
			doc
				.fontSize(8)
				.font("Noto-Bold")
				.fillColor("black")
				.text(label, rightX, detailY, { width: 85 });
			doc.font("Noto").text(value, rightX + 85, detailY, { width: 150 });
			detailY += 13;
		}

		y = Math.max(y + 14, detailY + 4);
		doc
			.moveTo(MARGIN, y)
			.lineTo(PAGE_W - MARGIN, y)
			.lineWidth(0.5)
			.strokeColor("#999")
			.stroke();
		y += 14;

		// ── CATEGORY-WISE TABLES ─────────────────────────────────────────────
		const categoryGroups = groupByCategory(items);
		console.log(
			`[pdf] categories: ${[...categoryGroups.entries()].map(([c, i]) => `${c}=${i.length}`).join(", ")}`,
		);

		for (const [category, catItems] of categoryGroups) {
			ensureSpace(ROW_H * 3 + 30);

			// Category title bar
			const catH = 20;
			doc.rect(MARGIN, y, CONTENT_W, catH).fill(rgbStr(C_CAT_BG));
			doc
				.rect(MARGIN, y, CONTENT_W, catH)
				.lineWidth(0.5)
				.strokeColor("#bbb")
				.stroke();
			doc
				.fontSize(9)
				.font("Noto-Bold")
				.fillColor(rgbStr(C_PRIMARY))
				.text(category.toUpperCase(), MARGIN + 8, y + 5);
			doc
				.fontSize(7)
				.font("Noto")
				.fillColor(rgbStr(C_GRAY))
				.text(`${catItems.length} items`, MARGIN, y + 6, {
					width: CONTENT_W - 8,
					align: "right",
				});
			y += catH + 2;

			// Table header
			y = drawTableHeader(doc, y);

			// Data rows
			console.log(`[pdf] rendering ${category}: ${catItems.length} items`);
			for (let i = 0; i < catItems.length; i++) {
				const item = catItems[i];
				const rowH = measureRowHeight(doc, item.serviceName);

				if (y + rowH > PAGE_H - BOTTOM_MARGIN) {
					doc.addPage();
					y = MARGIN;
					doc
						.fontSize(9)
						.font("Noto-Bold")
						.fillColor(rgbStr(C_PRIMARY))
						.text(`${category.toUpperCase()} (continued)`, MARGIN, y);
					y += 14;
					y = drawTableHeader(doc, y);
				}

				const h = drawDataRow(doc, y, item);
				y += h;
			}

			// Category subtotal
			if (y + ROW_H > PAGE_H - BOTTOM_MARGIN) {
				doc.addPage();
				y = MARGIN;
			}
			const catTotal = catItems.reduce(
				(sum, item) => sum + item.serviceAmount,
				0,
			);
			doc.rect(MARGIN, y, CONTENT_W, ROW_H).fill(rgbStr(C_SUB_BG));
			doc
				.rect(MARGIN, y, CONTENT_W, ROW_H)
				.lineWidth(0.5)
				.strokeColor("#bbb")
				.stroke();
			doc
				.fontSize(8.5)
				.font("Noto-Bold")
				.fillColor("black")
				.text(`${category} Total`, MARGIN + 8, y + 4);
			doc.text(fmt(catTotal), COL_X.amount + 4, y + 4, {
				width: COLS.amount - 8,
				align: "right",
			});
			y += ROW_H + 10;
		}

		// ── GRAND TOTAL ──────────────────────────────────────────────────────
		ensureSpace(100);

		doc.rect(MARGIN, y, CONTENT_W, 24).fill(rgbStr(C_PRIMARY));
		doc
			.fontSize(11)
			.font("Noto-Bold")
			.fillColor("white")
			.text(
				`Grand Total: Rs. ${new Intl.NumberFormat("en-IN", { minimumFractionDigits: 1 }).format(bill.totalNetAmount)}`,
				MARGIN + 8,
				y + 6,
			);
		y += 38;

		// Amount in words
		doc
			.fontSize(9)
			.font("Noto-Bold")
			.fillColor("black")
			.text(
				`Amount in Words: ${new Intl.NumberFormat("en-IN", { minimumFractionDigits: 2 }).format(bill.totalNetAmount)} rupees only.`,
				MARGIN,
				y,
				{ width: CONTENT_W },
			);
		y += 20;

		// Amount Due box
		doc
			.rect(MARGIN, y, CONTENT_W, 22)
			.lineWidth(0.8)
			.strokeColor("#999")
			.stroke();
		doc
			.moveTo(MARGIN + CONTENT_W / 2, y)
			.lineTo(MARGIN + CONTENT_W / 2, y + 22)
			.stroke();
		doc
			.fontSize(10)
			.font("Noto-Bold")
			.fillColor("black")
			.text("Amount Due", MARGIN + 8, y + 6);
		doc.text(
			`Rs. ${new Intl.NumberFormat("en-IN", { minimumFractionDigits: 1 }).format(bill.totalNetAmount)}`,
			MARGIN,
			y + 6,
			{ width: CONTENT_W - 8, align: "right" },
		);
		y += 40;

		// ── THANK YOU ─────────────────────────────────────────────────────────
		ensureSpace(70);
		doc
			.fontSize(11)
			.font("Noto-Bold")
			.fillColor("black")
			.text("Thank You", MARGIN, y, { width: CONTENT_W, align: "center" });
		y += 16;
		doc
			.fontSize(12)
			.fillColor(rgbStr(C_PRIMARY))
			.text("GC GERI CARE", MARGIN, y, { width: CONTENT_W, align: "center" });
		y += 14;
		doc
			.fontSize(7)
			.font("Noto")
			.fillColor(rgbStr(C_GRAY))
			.text("ELDERCARE BY GERIATRICIANS", MARGIN, y, {
				width: CONTENT_W,
				align: "center",
			});
		y += 10;
		doc
			.fontSize(8)
			.fillColor(rgbStr(C_DGRAY))
			.text("Guindy Chennai, Velachery", MARGIN, y, {
				width: CONTENT_W,
				align: "center",
			});
		y += 10;
		doc.text("City name, TEST - 123414", MARGIN, y, {
			width: CONTENT_W,
			align: "center",
		});
		y += 10;
		doc.text("Ph: 9876543210", MARGIN, y, {
			width: CONTENT_W,
			align: "center",
		});

		// ── PAGE NUMBERS ─────────────────────────────────────────────────────
		const range = doc.bufferedPageRange();
		// Write page numbers on each page without triggering auto-pagination
		for (let i = 0; i < range.count; i++) {
			doc.switchToPage(range.start + i);
			// Save graphics state, position cursor, write text manually
			doc.save();
			doc.fontSize(7).font("Noto").fillColor(rgbStr(C_GRAY));
			const label = `Page ${i + 1} of ${range.count}`;
			const labelW = doc.widthOfString(label);
			doc.text(label, MARGIN + (CONTENT_W - labelW) / 2, PAGE_H - 30, {
				lineBreak: false,
				height: 10,
			});
			doc.restore();
		}

		doc.end();
	});
}
