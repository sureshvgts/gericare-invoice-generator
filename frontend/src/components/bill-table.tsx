import { FileDown, FileSpreadsheet, Loader2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import { Checkbox } from "~/components/ui/checkbox";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "~/components/ui/table";
import { api } from "~/lib/api";
import type { BillSummary } from "~/lib/types";

const formatCurrency = (n: number) =>
	new Intl.NumberFormat("en-IN", {
		style: "currency",
		currency: "INR",
		minimumFractionDigits: 0,
	}).format(n);

function payTypeBadgeClass(payType: string) {
	const lower = payType.toLowerCase();
	if (lower.includes("cash"))
		return "bg-emerald-500/15 text-emerald-400 border-emerald-500/30";
	if (lower.includes("credit"))
		return "bg-amber-500/15 text-amber-400 border-amber-500/30";
	if (lower.includes("insurance"))
		return "bg-sky-500/15 text-sky-400 border-sky-500/30";
	return "bg-zinc-500/15 text-zinc-400 border-zinc-500/30";
}

function DownloadButton({ billNo }: { billNo: string }) {
	const [loading, setLoading] = useState(false);

	async function handleDownload() {
		setLoading(true);
		try {
			const blob = await api.downloadPdf(billNo);
			const url = URL.createObjectURL(blob);
			const a = document.createElement("a");
			a.href = url;
			a.download = `invoice-${billNo}.pdf`;
			a.click();
			URL.revokeObjectURL(url);
			toast.success(`Downloaded invoice ${billNo}`);
		} catch {
			toast.error("Failed to download PDF");
		} finally {
			setLoading(false);
		}
	}

	return (
		<Button
			variant="ghost"
			size="icon"
			onClick={handleDownload}
			disabled={loading}
			className="h-8 w-8 text-muted-foreground hover:text-foreground"
		>
			{loading ? (
				<Loader2 className="h-4 w-4 animate-spin" />
			) : (
				<FileDown className="h-4 w-4" />
			)}
		</Button>
	);
}

function ErpDownloadButton({ billNo }: { billNo: string }) {
	const [loading, setLoading] = useState(false);

	async function handleDownload() {
		setLoading(true);
		try {
			const blob = await api.downloadErpReportSingle(billNo);
			const url = URL.createObjectURL(blob);
			const a = document.createElement("a");
			a.href = url;
			a.download = `erp-report-${billNo}.xlsx`;
			a.click();
			URL.revokeObjectURL(url);
			toast.success(`ERP report downloaded for ${billNo}`);
		} catch {
			toast.error("Failed to generate ERP report");
		} finally {
			setLoading(false);
		}
	}

	return (
		<Button
			variant="ghost"
			size="icon"
			onClick={handleDownload}
			disabled={loading}
			title="Download ERP Report"
			className="h-8 w-8 text-muted-foreground hover:text-foreground"
		>
			{loading ? (
				<Loader2 className="h-4 w-4 animate-spin" />
			) : (
				<FileSpreadsheet className="h-4 w-4" />
			)}
		</Button>
	);
}

export function BillTable({ bills }: { bills: BillSummary[] }) {
	const [selected, setSelected] = useState<Set<string>>(new Set());
	const [erpLoading, setErpLoading] = useState(false);

	const allSelected =
		bills.length > 0 && selected.size === bills.length;
	const someSelected = selected.size > 0 && !allSelected;

	function toggleAll() {
		if (allSelected) {
			setSelected(new Set());
		} else {
			setSelected(new Set(bills.map((b) => b.bill_no)));
		}
	}

	function toggleOne(billNo: string) {
		setSelected((prev) => {
			const next = new Set(prev);
			if (next.has(billNo)) next.delete(billNo);
			else next.add(billNo);
			return next;
		});
	}

	async function handleErpReport() {
		if (selected.size === 0) {
			toast.error("Select at least one bill");
			return;
		}
		setErpLoading(true);
		try {
			const blob = await api.downloadErpReport([...selected]);
			const url = URL.createObjectURL(blob);
			const a = document.createElement("a");
			a.href = url;
			a.download = `erp-sales-invoice-${new Date().toISOString().slice(0, 10)}.xlsx`;
			a.click();
			URL.revokeObjectURL(url);
			toast.success(`ERP report downloaded (${selected.size} bills)`);
		} catch {
			toast.error("Failed to generate ERP report");
		} finally {
			setErpLoading(false);
		}
	}

	if (bills.length === 0) {
		return (
			<div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
				<p className="text-lg">No bills found</p>
				<p className="text-sm">Upload files to get started</p>
			</div>
		);
	}

	return (
		<div>
			{/* Action bar — visible when rows are selected */}
			{selected.size > 0 && (
				<div className="mb-3 flex items-center gap-3 rounded-lg border border-white/10 bg-white/5 px-4 py-2 backdrop-blur-sm">
					<span className="text-sm text-muted-foreground">
						{selected.size} bill{selected.size > 1 ? "s" : ""} selected
					</span>
					<Button
						size="sm"
						onClick={handleErpReport}
						disabled={erpLoading}
						className="ml-auto gap-2"
					>
						{erpLoading ? (
							<Loader2 className="h-4 w-4 animate-spin" />
						) : (
							<FileSpreadsheet className="h-4 w-4" />
						)}
						Generate ERP Report
					</Button>
				</div>
			)}

			<Table>
				<TableHeader>
					<TableRow className="border-white/10 hover:bg-transparent">
						<TableHead className="w-[40px]">
							<Checkbox
								checked={allSelected ? true : someSelected ? "indeterminate" : false}
								onCheckedChange={toggleAll}
							/>
						</TableHead>
						<TableHead className="text-zinc-400">Bill No</TableHead>
						<TableHead className="text-zinc-400">Patient Name</TableHead>
						<TableHead className="text-zinc-400">UHID</TableHead>
						<TableHead className="text-zinc-400">Date</TableHead>
						<TableHead className="text-right text-zinc-400">Amount</TableHead>
						<TableHead className="text-zinc-400">Pay Type</TableHead>
						<TableHead className="w-[50px]" />
					</TableRow>
				</TableHeader>
				<TableBody>
					{bills.map((bill) => (
						<TableRow
							key={bill.bill_no}
							className={`border-white/5 hover:bg-white/5 ${selected.has(bill.bill_no) ? "bg-white/5" : ""}`}
						>
							<TableCell>
								<Checkbox
									checked={selected.has(bill.bill_no)}
									onCheckedChange={() => toggleOne(bill.bill_no)}
								/>
							</TableCell>
							<TableCell className="font-mono text-sm">
								{bill.bill_no}
							</TableCell>
							<TableCell>
								<span className="font-medium">{bill.patient_name}</span>
							</TableCell>
							<TableCell>
								<span className="font-medium">{bill.uhid}</span>
							</TableCell>
							<TableCell className="text-sm text-muted-foreground">
								{bill.date}
							</TableCell>
							<TableCell className="text-right font-mono text-sm">
								{formatCurrency(bill.total_net_amount)}
							</TableCell>
							<TableCell>
								<Badge
									variant="outline"
									className={payTypeBadgeClass(bill.pay_type)}
								>
									{bill.pay_type || "N/A"}
								</Badge>
							</TableCell>
							<TableCell className="flex gap-1">
								<DownloadButton billNo={bill.bill_no} />
								<ErpDownloadButton billNo={bill.bill_no} />
							</TableCell>
						</TableRow>
					))}
				</TableBody>
			</Table>
		</div>
	);
}
