const ones = [
  '', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine',
  'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen',
  'Seventeen', 'Eighteen', 'Nineteen',
]
const tens = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety']

function convertHundreds(n: number): string {
  if (n === 0) return ''
  if (n < 20) return ones[n]
  if (n < 100) return tens[Math.floor(n / 10)] + (n % 10 ? ' ' + ones[n % 10] : '')
  return ones[Math.floor(n / 100)] + ' Hundred' + (n % 100 ? ' and ' + convertHundreds(n % 100) : '')
}

export function numberToWords(amount: number): string {
  if (amount === 0) return 'Zero Rupees Only'

  const rupees = Math.floor(amount)
  const paise = Math.round((amount - rupees) * 100)

  const parts: string[] = []

  const crore = Math.floor(rupees / 10_000_000)
  const lakh = Math.floor((rupees % 10_000_000) / 100_000)
  const thousand = Math.floor((rupees % 100_000) / 1_000)
  const remainder = rupees % 1_000

  if (crore) parts.push(convertHundreds(crore) + ' Crore')
  if (lakh) parts.push(convertHundreds(lakh) + ' Lakh')
  if (thousand) parts.push(convertHundreds(thousand) + ' Thousand')
  if (remainder) parts.push(convertHundreds(remainder))

  let result = parts.join(' ') + ' Rupees'
  if (paise) result += ' and ' + convertHundreds(paise) + ' Paise'
  return result + ' Only'
}
