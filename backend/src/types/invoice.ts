export interface BillSummary {
  billNo: string
  uhid: string
  encounterNo: string
  patientName: string
  consultantName: string
  department: string
  payType: string
  totalNetAmount: number
  date: string
  doa: string
  dod: string
  ward: string
}

export interface ServiceItem {
  billNo: string
  orderDate: string
  serviceGroupName: string
  serviceCode: string
  serviceName: string
  serviceQty: number
  serviceUnitPrice: number
  serviceAmount: number
}

export type ServiceCategory = 'Pharmacy' | 'Investigation' | 'Consultation' | 'Others'

export const SERVICE_CATEGORY_MAP: Record<string, ServiceCategory> = {
  'PHARMACY': 'Pharmacy',
  'INVESTIGATIONS': 'Investigation',
  'OPERATION THEATRE': 'Investigation',
  'CARDIOLOGY': 'Investigation',
  'LABORATORY': 'Investigation',
  'BLOOD PRODUCTS': 'Investigation',
  'RADIOLOGY': 'Investigation',
  'CONSULTATION': 'Consultation',
  'PHYSIOTHERAPY': 'Consultation',
  'HEALTH CHECK': 'Consultation',
  'ROOM RENT': 'Others',
  'ADMINISTRATIVE SERVICES': 'Others',
  'EQUIPMENT': 'Investigation',
  'PROCEDURE': 'Investigation',
  'DIET': 'Others',
  'AMBULANCE SERVICES': 'Others',
  'PROFESSIONAL FEES': 'Others',
  'SURGEON FEE': 'Others',
  'PROFILE': 'Others',
}

export function getServiceCategory(groupName: string): ServiceCategory {
  const upper = groupName.trim().toUpperCase()
  return SERVICE_CATEGORY_MAP[upper] ?? 'Others'
}
