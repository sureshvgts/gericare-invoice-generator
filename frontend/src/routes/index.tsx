import { createFileRoute } from "@tanstack/react-router";
import { Loader2, Upload } from "lucide-react";
import { useState } from "react";
import { BillTable } from "~/components/bill-table";
import { BulkUploadModal } from "~/components/bulk-upload-modal";
import { GlassCard } from "~/components/glass-card";
import { Button } from "~/components/ui/button";
import { useBills } from "~/lib/queries";

export const Route = createFileRoute("/")({
	component: BillListPage,
});

function BillListPage() {
	const [uploadOpen, setUploadOpen] = useState(false);
	const { data, isLoading, error } = useBills();

	return (
		<main className="mx-auto min-h-screen max-w-7xl px-6 py-8">
			{/* Header */}
			<div className="mb-8 flex items-center justify-between">
				<div>
					<h1 className="text-2xl font-bold tracking-tight">
						GeriCare Billing
					</h1>
					<p className="mt-1 text-sm text-muted-foreground">
						Manage invoices and generate PDFs
					</p>
				</div>
				<Button onClick={() => setUploadOpen(true)}>
					<Upload className="mr-2 h-4 w-4" />
					Bulk Upload
				</Button>
			</div>

			{/* Bills Table */}
			<GlassCard>
				{isLoading ? (
					<div className="flex items-center justify-center py-20">
						<Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
					</div>
				) : error ? (
					<div className="flex flex-col items-center justify-center py-20 text-destructive">
						<p>Failed to load bills</p>
						<p className="text-sm text-muted-foreground">{error.message}</p>
					</div>
				) : (
					<>
						<BillTable bills={data?.bills ?? []} />
						{data && data.total > 0 && (
							<div className="mt-4 border-t border-white/5 pt-3 text-right text-xs text-muted-foreground">
								Showing {data.bills.length} of {data.total} bills
							</div>
						)}
					</>
				)}
			</GlassCard>

			{/* Upload Modal */}
			<BulkUploadModal open={uploadOpen} onOpenChange={setUploadOpen} />
		</main>
	);
}
