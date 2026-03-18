export interface BillSummary {
  bill_no: string
  uhid: string
  encounter_no: string
  patient_name: string
  consultant_name: string
  department: string
  pay_type: string
  total_net_amount: number
  date: string
  doa: string
  dod: string
  ward: string
}

export interface BillListResponse {
  bills: BillSummary[]
  total: number
  limit: number
  offset: number
}

export interface ImportResponse {
  message: string
  bills: number
  items: number
  skipped: number
}
