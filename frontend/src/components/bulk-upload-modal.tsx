import { zodResolver } from "@hookform/resolvers/zod";
import { CheckCircle2, Loader2, Upload, X } from "lucide-react";
import {
	createContext,
	useCallback,
	useContext,
	useRef,
	useState,
} from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { Alert, AlertDescription, AlertTitle } from "~/components/ui/alert";
import { Button } from "~/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from "~/components/ui/dialog";
import { Progress } from "~/components/ui/progress";
import { useUploadMutation } from "~/lib/queries";
import type { ImportResponse } from "~/lib/types";

// ─── Schema ──────────────────────────────────────────────────────────────────

const uploadSchema = z.object({
	billSummary: z
		.instanceof(FileList)
		.refine((f) => f.length >= 1, "Bill summary file is required"),
	itemReport: z
		.instanceof(FileList)
		.refine((f) => f.length >= 1, "Item report file is required"),
});

type UploadFormData = z.infer<typeof uploadSchema>;

// ─── Context (Compound Component state) ──────────────────────────────────────

type ModalState = "idle" | "uploading" | "success" | "error";

interface UploadContextValue {
	state: ModalState;
	result: ImportResponse | null;
	error: string | null;
	progress: number;
}

const UploadContext = createContext<UploadContextValue>({
	state: "idle",
	result: null,
	error: null,
	progress: 0,
});

// ─── Sub-components ──────────────────────────────────────────────────────────

function FileInput({
	name,
	label,
	register,
	error,
}: {
	name: "billSummary" | "itemReport";
	label: string;
	register: ReturnType<typeof useForm<UploadFormData>>["register"];
	error?: string;
}) {
	const inputRef = useRef<HTMLInputElement | null>(null);
	const [fileName, setFileName] = useState<string | null>(null);
	const { ref, ...rest } = register(name, {
		onChange: (e: React.ChangeEvent<HTMLInputElement>) => {
			const files = e.target.files;
			if (!files || files.length === 0) {
				setFileName(null);
			} else if (files.length === 1) {
				setFileName(files[0].name);
			} else {
				setFileName(`${files.length} files selected`);
			}
		},
	});

	return (
		<div className="space-y-1.5">
			<label className="text-sm font-medium text-zinc-300">{label}</label>
			<div
				onClick={() => inputRef.current?.click()}
				className="flex cursor-pointer items-center gap-3 rounded-lg border border-dashed border-white/15 bg-white/5 px-4 py-3 transition-colors hover:border-white/30 hover:bg-white/10"
			>
				<Upload className="h-4 w-4 text-muted-foreground" />
				<span className="text-sm text-muted-foreground">
					{fileName ?? "Choose file(s) — .xlsx, .csv, .xls"}
				</span>
				{fileName && (
					<X
						className="ml-auto h-4 w-4 text-muted-foreground hover:text-foreground"
						onClick={(e) => {
							e.stopPropagation();
							setFileName(null);
							if (inputRef.current) inputRef.current.value = "";
						}}
					/>
				)}
			</div>
			<input
				type="file"
				// accept=".xlsx,.csv,.xls"
				multiple
				className="hidden"
				ref={(el) => {
					ref(el);
					inputRef.current = el;
				}}
				{...rest}
			/>
			{error && <p className="text-xs text-destructive">{error}</p>}
		</div>
	);
}

function UploadProgress() {
	const { state, progress } = useContext(UploadContext);
	if (state !== "uploading") return null;

	return (
		<div className="space-y-3 py-4">
			<div className="flex items-center gap-2 text-sm text-muted-foreground">
				<Loader2 className="h-4 w-4 animate-spin" />
				<span>Uploading and processing files...</span>
			</div>
			<Progress value={progress} className="h-2" />
		</div>
	);
}

function UploadResult() {
	const { state, result, error } = useContext(UploadContext);

	if (state === "error") {
		return (
			<Alert variant="destructive" className="mt-4">
				<AlertTitle>Upload Failed</AlertTitle>
				<AlertDescription>{error}</AlertDescription>
			</Alert>
		);
	}

	if (state !== "success" || !result) return null;

	return (
		<div className="space-y-4 py-4">
			<div className="flex items-center gap-2 text-emerald-400">
				<CheckCircle2 className="h-5 w-5" />
				<span className="font-medium">Import Successful</span>
			</div>
			<div className="grid grid-cols-2 gap-3">
				<div className="rounded-lg border border-white/10 bg-white/5 p-3">
					<p className="text-2xl font-bold">{result.bills}</p>
					<p className="text-xs text-muted-foreground">Bills Processed</p>
				</div>
				<div className="rounded-lg border border-white/10 bg-white/5 p-3">
					<p className="text-2xl font-bold">{result.items}</p>
					<p className="text-xs text-muted-foreground">Service Items</p>
				</div>
			</div>
			{result.skipped > 0 && (
				<Alert className="border-amber-500/30 bg-amber-500/10 text-amber-300">
					<AlertTitle>Partial Import</AlertTitle>
					<AlertDescription>
						{result.skipped} service items were skipped (no matching bill
						found).
					</AlertDescription>
				</Alert>
			)}
		</div>
	);
}

// ─── Main Modal ──────────────────────────────────────────────────────────────

export function BulkUploadModal({
	open,
	onOpenChange,
}: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
}) {
	const [state, setState] = useState<ModalState>("idle");
	const [result, setResult] = useState<ImportResponse | null>(null);
	const [error, setError] = useState<string | null>(null);
	const [progress, setProgress] = useState(0);

	const mutation = useUploadMutation();

	const {
		register,
		handleSubmit,
		reset,
		formState: { errors },
	} = useForm<UploadFormData>({
		resolver: zodResolver(uploadSchema),
	});

	const resetModal = useCallback(() => {
		setState("idle");
		setResult(null);
		setError(null);
		setProgress(0);
		reset();
	}, [reset]);

	function handleOpenChange(open: boolean) {
		if (!open) resetModal();
		onOpenChange(open);
	}

	async function onSubmit(data: UploadFormData) {
		setState("uploading");
		setProgress(30);

		const formData = new FormData();
		formData.append("billSummary", data.billSummary[0]);
		formData.append("itemReport", data.itemReport[0]);

		setProgress(60);

		mutation.mutate(formData, {
			onSuccess: (res) => {
				setProgress(100);
				setState("success");
				setResult(res);
				toast.success(`Imported ${res.bills} bills with ${res.items} items`);
			},
			onError: (err) => {
				setState("error");
				setError(err.message);
				toast.error("Upload failed");
			},
		});
	}

	const contextValue: UploadContextValue = { state, result, error, progress };

	return (
		<Dialog open={open} onOpenChange={handleOpenChange}>
			<DialogContent className="border-white/10 bg-zinc-900/90 backdrop-blur-xl sm:max-w-md">
				<DialogHeader>
					<DialogTitle>Bulk Upload</DialogTitle>
					<DialogDescription>
						Upload bill summary and item report files to import invoices.
					</DialogDescription>
				</DialogHeader>

				<UploadContext.Provider value={contextValue}>
					{state === "idle" && (
						<form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
							<FileInput
								name="billSummary"
								label="Bill Summary (Revenue Details)"
								register={register}
								error={errors.billSummary?.message}
							/>
							<FileInput
								name="itemReport"
								label="Item Wise Service Report"
								register={register}
								error={errors.itemReport?.message}
							/>
							<Button type="submit" className="w-full">
								<Upload className="mr-2 h-4 w-4" />
								Upload & Import
							</Button>
						</form>
					)}

					<UploadProgress />
					<UploadResult />

					{(state === "success" || state === "error") && (
						<div className="flex gap-2">
							<Button variant="outline" onClick={resetModal} className="flex-1">
								Upload More
							</Button>
							<Button
								onClick={() => handleOpenChange(false)}
								className="flex-1"
							>
								Done
							</Button>
						</div>
					)}
				</UploadContext.Provider>
			</DialogContent>
		</Dialog>
	);
}

// Attach sub-components for compound pattern
BulkUploadModal.FileInput = FileInput;
BulkUploadModal.Progress = UploadProgress;
BulkUploadModal.Result = UploadResult;
