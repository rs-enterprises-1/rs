'use client'

import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { User } from '@/lib/supabase'
import { isAdmin } from '@/lib/auth'
import { Vehicle, Sale } from '@/lib/database.types'
import { formatCurrency } from '@/lib/utils'
import { motion, AnimatePresence } from 'framer-motion'
import { Printer, TrendingUp, ChevronDown, ChevronUp, FileText, Receipt, X, Search, Calendar, Trash2 } from 'lucide-react'
import jsPDF from 'jspdf'

interface SoldVehiclesListProps {
  user: User
}

interface VehicleWithSale extends Vehicle {
  sale: Sale
}

type DocumentType = 'invoice' | 'transaction' | null

export default function SoldVehiclesList({ user }: SoldVehiclesListProps) {
  const [vehicles, setVehicles] = useState<VehicleWithSale[]>([])
  const [loading, setLoading] = useState(true)
  const [expandedItems, setExpandedItems] = useState<Set<string>>(new Set())
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedMonth, setSelectedMonth] = useState<string>('')
  const [showDocumentModal, setShowDocumentModal] = useState(false)
  const [selectedVehicle, setSelectedVehicle] = useState<VehicleWithSale | null>(null)
  const [transactionDetails, setTransactionDetails] = useState<any>(null)
  const [showTransactionForm, setShowTransactionForm] = useState(false)
  
  // Transaction form fields
  const [hasLeasing, setHasLeasing] = useState(false)
  const [leaseCompany, setLeaseCompany] = useState('')
  const [leaseAmount, setLeaseAmount] = useState('')
  const [paymentMethod, setPaymentMethod] = useState<'cash' | 'cheque' | 'both' | null>(null)
  const [cheque1No, setCheque1No] = useState('')
  const [cheque1Amount, setCheque1Amount] = useState('')
  const [cheque2No, setCheque2No] = useState('')
  const [cheque2Amount, setCheque2Amount] = useState('')
  const [cash5000, setCash5000] = useState('')
  const [cash2000, setCash2000] = useState('')
  const [cash1000, setCash1000] = useState('')
  const [cash500, setCash500] = useState('')
  const [cash100, setCash100] = useState('')
  const [registration, setRegistration] = useState('')
  const [valuation, setValuation] = useState('')
  const [rLicence, setRLicence] = useState('')
  const [customerSignature, setCustomerSignature] = useState('')
  const [authorizedSignature, setAuthorizedSignature] = useState('')

  useEffect(() => {
    loadVehicles()
  }, [])

  async function loadVehicles() {
    const { data: vehiclesData } = await supabase
      .from('vehicles')
      .select('*')
      .eq('status', 'sold')
      .order('created_at', { ascending: false })

    if (!vehiclesData) return

    const { data: salesData } = await supabase
      .from('sales')
      .select('*')

    const salesMap = new Map(salesData?.map(s => [s.chassis_no, s]) || [])

    const vehiclesWithSales = vehiclesData.map(v => ({
      ...v,
      sale: salesMap.get(v.chassis_no),
    })).filter(v => v.sale) as VehicleWithSale[]

    setVehicles(vehiclesWithSales)
    setLoading(false)
  }

  async function handleReprintClick(vehicle: VehicleWithSale) {
    setSelectedVehicle(vehicle)
    // Try to load transaction details if available
    const { data: details } = await supabase
      .from('transaction_details')
      .select('*')
      .eq('chassis_no', vehicle.chassis_no)
      .maybeSingle()
    
    setTransactionDetails(details)
    // Reset form fields
    setHasLeasing(details?.lease_amount ? details.lease_amount > 0 : false)
    setLeaseCompany(details?.lease_company || '')
    setLeaseAmount(details?.lease_amount ? details.lease_amount.toString() : '')
    setPaymentMethod(details?.payment_method as 'cash' | 'cheque' | 'both' | null || null)
    setCheque1No('')
    setCheque1Amount('')
    setCheque2No('')
    setCheque2Amount('')
    setCash5000('')
    setCash2000('')
    setCash1000('')
    setCash500('')
    setCash100('')
    setRegistration('')
    setValuation('')
    setRLicence('')
    setCustomerSignature('')
    setAuthorizedSignature('')
    setShowDocumentModal(true)
    setShowTransactionForm(false)
  }

  async function handleDeleteSale(vehicle: VehicleWithSale) {
    if (!isAdmin(user)) {
      alert('Only admin can delete sold records')
      return
    }

    const confirmDelete = confirm(
      `Are you sure you want to delete the sale record for ${vehicle.chassis_no} and mark it as available again?`
    )
    if (!confirmDelete) return

    try {
      // Delete transaction details
      await supabase
        .from('transaction_details')
        .delete()
        .eq('chassis_no', vehicle.chassis_no)

      // Delete lease collections
      await supabase
        .from('lease_collections')
        .delete()
        .eq('chassis_no', vehicle.chassis_no)

      // Delete sale record
      await supabase
        .from('sales')
        .delete()
        .eq('chassis_no', vehicle.chassis_no)

      // Mark vehicle as available again
      await supabase
        .from('vehicles')
        .update({ status: 'available' })
        .eq('chassis_no', vehicle.chassis_no)

      // Refresh list
      await loadVehicles()

      alert('Sale record deleted and vehicle marked as available.')
    } catch (err: any) {
      console.error('Error deleting sale:', err)
      alert(`Failed to delete sale: ${err.message || err}`)
    }
  }

  async function handleDeleteVehicle(vehicle: VehicleWithSale) {
    if (!isAdmin(user)) {
      alert('Only admin can delete vehicles')
      return
    }

    const confirmDelete = confirm(
      `Are you sure you want to PERMANENTLY DELETE this vehicle?\n\nVehicle: ${vehicle.maker} ${vehicle.model}\nChassis: ${vehicle.chassis_no}\n\nThis will permanently delete:\n- Vehicle record\n- Sale record\n- Transaction details\n- Lease collections\n- Advance payments\n- All related data\n\nThis action CANNOT be undone!`
    )
    if (!confirmDelete) return

    try {
      // Delete transaction details
      await supabase
        .from('transaction_details')
        .delete()
        .eq('chassis_no', vehicle.chassis_no)

      // Delete lease collections
      await supabase
        .from('lease_collections')
        .delete()
        .eq('chassis_no', vehicle.chassis_no)

      // Delete advance payments
      await supabase
        .from('advance_payments')
        .delete()
        .eq('chassis_no', vehicle.chassis_no)

      // Delete advances
      await supabase
        .from('advances')
        .delete()
        .eq('chassis_no', vehicle.chassis_no)

      // Delete sale record
      await supabase
        .from('sales')
        .delete()
        .eq('chassis_no', vehicle.chassis_no)

      // Delete vehicle record (this should cascade delete related records)
      const { error } = await supabase
        .from('vehicles')
        .delete()
        .eq('chassis_no', vehicle.chassis_no)

      if (error) throw error

      // Refresh list
      await loadVehicles()

      alert('Vehicle and all related records deleted permanently.')
    } catch (err: any) {
      console.error('Error deleting vehicle:', err)
      alert(`Failed to delete vehicle: ${err.message || err}`)
    }
  }

  async function generateDocument(documentType: DocumentType) {
    if (!selectedVehicle || !documentType) return

    if (documentType === 'invoice') {
      setShowDocumentModal(false)
      await generateInvoicePDF(selectedVehicle)
    } else {
      // Check if transaction details exist
      if (!transactionDetails || transactionDetails.document_type !== 'transaction') {
        // Show form to fill transaction details
        setShowDocumentModal(false)
        setShowTransactionForm(true)
        return
      }
      setShowDocumentModal(false)
      await generateTransactionSummaryPDF(selectedVehicle)
    }
  }
  
  async function handleTransactionFormSubmit() {
    if (!selectedVehicle) return
    
    // Validate required fields
    if (hasLeasing && (!leaseCompany || !leaseAmount)) {
      alert('Please fill in all required fields (Lease Company, Lease Amount)')
      return
    }
    if (!paymentMethod) {
      alert('Please select payment method')
      return
    }
    
    if (paymentMethod === 'cheque' || paymentMethod === 'both') {
      if (!cheque1No || !cheque1Amount) {
        alert('Please enter at least one cheque number and amount')
        return
      }
    }
    
    if (paymentMethod === 'cash' || paymentMethod === 'both') {
      const cashTotal = (parseInt(cash5000) || 0) * 5000 + 
                       (parseInt(cash2000) || 0) * 2000 + 
                       (parseInt(cash1000) || 0) * 1000 + 
                       (parseInt(cash500) || 0) * 500 + 
                       (parseInt(cash100) || 0) * 100
      if (cashTotal === 0) {
        alert('Please enter cash denominations')
        return
      }
    }
    
    // Save transaction details
    const { data: saleData } = await supabase
      .from('sales')
      .select('*')
      .eq('chassis_no', selectedVehicle.chassis_no)
      .single()
    
    if (saleData) {
      const { error: detailError } = await supabase
        .from('transaction_details')
        .insert({
          chassis_no: selectedVehicle.chassis_no,
          document_type: 'transaction',
          customer_name: saleData.customer_name,
          customer_phone: saleData.customer_phone || null,
          customer_address: saleData.customer_address || null,
          lease_company: hasLeasing ? leaseCompany : null,
          lease_amount: hasLeasing ? (parseFloat(leaseAmount) || null) : null,
          payment_method: paymentMethod,
          cheque1_no: cheque1No || null,
          cheque1_amount: parseFloat(cheque1Amount) || null,
          cheque2_no: cheque2No || null,
          cheque2_amount: parseFloat(cheque2Amount) || null,
          cash_5000: parseInt(cash5000) || 0,
          cash_2000: parseInt(cash2000) || 0,
          cash_1000: parseInt(cash1000) || 0,
          cash_500: parseInt(cash500) || 0,
          cash_100: parseInt(cash100) || 0,
          registration: parseFloat(registration) || 0,
          valuation: parseFloat(valuation) || 0,
          r_licence: parseFloat(rLicence) || 0,
          customer_signature: customerSignature || null,
          authorized_signature: authorizedSignature || null,
        })
      
      if (detailError) {
        console.error('Error saving transaction details:', detailError)
        alert('Error saving transaction details. Please try again.')
        return
      }
      
      // Reload transaction details
      const { data: details } = await supabase
        .from('transaction_details')
        .select('*')
        .eq('chassis_no', selectedVehicle.chassis_no)
        .maybeSingle()
      
      setTransactionDetails(details)
    }
    
    // Generate PDF
    setShowTransactionForm(false)
    await generateTransactionSummaryPDF(selectedVehicle)
  }

  // Convert number to words (for invoice balance amount) - using millions format
  function numberToWords(num: number): string {
    const ones = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten',
      'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen']
    const tens = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety']
    
    if (num === 0) return 'Zero'
    
    const convertHundreds = (n: number): string => {
      if (n === 0) return ''
      if (n < 20) return ones[n]
      if (n < 100) {
        const ten = Math.floor(n / 10)
        const one = n % 10
        return tens[ten] + (one > 0 ? ' ' + ones[one] : '')
      }
      const hundred = Math.floor(n / 100)
      const remainder = n % 100
      return ones[hundred] + ' Hundred' + (remainder > 0 ? ' ' + convertHundreds(remainder) : '')
    }
    
    const convert = (n: number): string => {
      if (n === 0) return 'Zero'
      
      let result = ''
      
      // Millions (1,000,000)
      const millions = Math.floor(n / 1000000)
      if (millions > 0) {
        result += convertHundreds(millions) + ' Million '
        n = n % 1000000
      }
      
      // Thousands (1,000)
      const thousands = Math.floor(n / 1000)
      if (thousands > 0) {
        result += convertHundreds(thousands) + ' Thousand '
        n = n % 1000
      }
      
      // Hundreds and below
      if (n > 0) {
        result += convertHundreds(n)
      }
      
      return result.trim()
    }
    
    // Handle decimal part (cents)
    const wholePart = Math.floor(num)
    const decimalPart = Math.round((num - wholePart) * 100)
    
    let words = convert(wholePart)
    if (decimalPart > 0) {
      words += ' and ' + convertHundreds(decimalPart) + ' Cents'
    }
    
    return words
  }

  async function generateInvoicePDF(vehicle: VehicleWithSale) {
    try {
      const sale = vehicle.sale
      
      // Check if transaction_details exist to determine if it's a "Mark Sold" or "Sell Now" invoice
      // If no transaction_details, it's a "Sell Now" invoice (simplified format)
      // If transaction_details exist, it's a "Mark Sold" invoice (full format with bank details)
      const { data: transDetails } = await supabase
        .from('transaction_details')
        .select('*')
        .eq('chassis_no', vehicle.chassis_no)
        .maybeSingle()
      
      const isSellNowInvoice = !transDetails
      
      const { data: payments } = await supabase
        .from('advance_payments')
        .select('*')
        .eq('chassis_no', vehicle.chassis_no)
        .order('paid_date', { ascending: true })

      const totalAdvance = payments?.reduce((sum, p) => sum + p.amount_lkr, 0) || 0
      const soldPriceNum = sale.sold_currency === 'JPY' 
        ? sale.sold_price * (sale.rate_jpy_to_lkr || 1)
        : sale.sold_price
      const soldPriceJpy = sale.sold_currency === 'JPY' ? sale.sold_price : (sale.sold_price / (sale.rate_jpy_to_lkr || 1))
      const balancePaid = soldPriceNum - totalAdvance
      // Generate shorter invoice number (e.g., 0001, 0002, etc.)
      const invoiceNumber = String(Date.now()).slice(-4).padStart(4, '0')
      const invoiceDate = new Date(sale.sold_date).toLocaleDateString()

      // Get vehicle color (handle both 'color' and 'colour' column names)
      const vehicleColor = (vehicle as any).colour || vehicle.color || 'N/A'
      const engineNo = vehicle.engine_no || 'N/A'
      const engineCapacity = vehicle.engine_capacity || 'N/A'
      const fuelType = vehicle.fuel_type || 'N/A'
      const seatingCapacity = vehicle.seating_capacity || 'N/A'

      // Create PDF
      const pdf = new jsPDF({
        orientation: 'portrait',
        unit: 'mm',
        format: 'a4'
      })

      // Company Header
      pdf.setFont('helvetica', 'bold')
      pdf.setFontSize(24)
      pdf.text('R.S.Enterprises', 105, 20, { align: 'center' })

      // Company Details (middle, small font)
      pdf.setFont('helvetica', 'bold')
      pdf.setFontSize(10)
      pdf.text('No.164/B,Nittambuwa Road,Paththalagedara,Veyangoda', 105, 28, { align: 'center' })
      pdf.text('Tel: 0773073156,0332245886', 105, 34, { align: 'center' })
      pdf.text('Email : rsenterprises59@gmail.com', 105, 40, { align: 'center' })

      // Line separator
      pdf.setDrawColor(0, 0, 0)
      pdf.line(20, 45, 190, 45)

      // INVOICE title (middle)
      pdf.setFont('helvetica', 'bold')
      pdf.setFontSize(18)
      pdf.text('INVOICE', 105, 55, { align: 'center' })

      // Invoice No (right corner, left-aligned) and Date (left, with label)
      const invoiceNoX = 160 // Right corner but left-aligned
      pdf.setFont('helvetica', 'bold')
      pdf.setFontSize(11)
      pdf.text(`Invoice No: ${invoiceNumber}`, invoiceNoX, 65)
      pdf.setFont('helvetica', 'bold')
      pdf.setFontSize(11)
      pdf.text(`Date: ${invoiceDate}`, 20, 65)

      let currentY = 75
      
      if (isSellNowInvoice) {
        // "Sell Now" Invoice: Only "To:" with customer details (no "Deliver To:", no phone)
        pdf.setFont('helvetica', 'bold')
        pdf.setFontSize(11)
        pdf.text('To:', 20, currentY)
        currentY += 7
        pdf.setFont('helvetica', 'bold')
        pdf.setFontSize(10)
        pdf.text(sale.customer_name || 'N/A', 20, currentY)
        currentY += 6
        const customerAddressLines = sale.customer_address ? sale.customer_address.split(',').map(l => l.trim()).filter(l => l) : []
        customerAddressLines.forEach(line => {
          pdf.text(line, 20, currentY)
          currentY += 6
        })
        currentY += 3
      } else {
        // Mark Sold Invoice: Left side "To:" Bank Details (if available), Right side "Deliver To:" Customer Details
        pdf.setFont('helvetica', 'bold')
        pdf.setFontSize(11)
        pdf.text('To:', 20, currentY)
        pdf.setFont('helvetica', 'bold')
        pdf.setFontSize(10)
        if (sale.bank_name) {
          pdf.text(sale.bank_name, 20, currentY + 7)
          const bankAddressLines = sale.bank_address ? sale.bank_address.split(',').map(l => l.trim()).filter(l => l) : []
          let bankY = currentY + 14
          bankAddressLines.forEach(line => {
            pdf.text(line, 20, bankY)
            bankY += 6
          })
          currentY = bankY
        } else {
          // No bank details - just show "N/A" or leave empty
          pdf.text('N/A', 20, currentY + 7)
          currentY = currentY + 14
        }

        // Right side: Deliver To: Customer Details
        pdf.setFont('helvetica', 'bold')
        pdf.setFontSize(11)
        pdf.text('Deliver To:', invoiceNoX, currentY - (sale.bank_name ? 14 : 7))
        pdf.setFont('helvetica', 'bold')
        pdf.setFontSize(10)
        pdf.text(sale.customer_name || 'N/A', invoiceNoX, currentY - (sale.bank_name ? 7 : 0))
        let customerStartY = currentY - (sale.bank_name ? 7 : 0)
        if (sale.customer_phone) {
          pdf.text(`Phone: ${sale.customer_phone}`, invoiceNoX, customerStartY + 7)
          customerStartY += 7
        }
        const customerAddressLines = sale.customer_address ? sale.customer_address.split(',').map(l => l.trim()).filter(l => l) : []
        customerAddressLines.forEach(line => {
          pdf.text(line, invoiceNoX, customerStartY + 7)
          customerStartY += 6
        })
        currentY = Math.max(currentY, customerStartY + 3)
      }

      // Line separator
      pdf.line(20, currentY, 190, currentY)
      currentY += 10

      // Description heading (centered)
      pdf.setFont('helvetica', 'bold')
      pdf.setFontSize(12)
      pdf.text('Description', 105, currentY, { align: 'center' })
      currentY += 10

      // Aligned positions for labels, colons, and values (left side)
      const labelStartX = 20 // Left side
      const colonX = 80 // Colon position (1 tab after label)
      const valueStartX = 90 // Value starts 1 tab after colon

      // Vehicle Details in "Label: Value" format (aligned, left side)
      pdf.setFont('helvetica', 'bold')
      pdf.setFontSize(10)
      pdf.text('Maker', labelStartX, currentY)
      pdf.text(':', colonX, currentY)
      pdf.text(vehicle.maker, valueStartX, currentY)
      currentY += 6
      
      pdf.text('Model', labelStartX, currentY)
      pdf.text(':', colonX, currentY)
      pdf.text(vehicle.model, valueStartX, currentY)
      currentY += 6
      
      pdf.text('Chassis Number', labelStartX, currentY)
      pdf.text(':', colonX, currentY)
      pdf.text(vehicle.chassis_no, valueStartX, currentY)
      currentY += 6
      
      pdf.text('Year', labelStartX, currentY)
      pdf.text(':', colonX, currentY)
      pdf.text(vehicle.manufacturer_year.toString(), valueStartX, currentY)
      currentY += 6
      
      pdf.text('Mileage', labelStartX, currentY)
      pdf.text(':', colonX, currentY)
      pdf.text(`${vehicle.mileage.toLocaleString()} km`, valueStartX, currentY)
      currentY += 6

      if (!isSellNowInvoice) {
        // Regular invoice: Include all vehicle description fields
        pdf.text('Engine No', labelStartX, currentY)
        pdf.text(':', colonX, currentY)
        pdf.text(String(engineNo || 'N/A'), valueStartX, currentY)
        currentY += 6
        
        pdf.text('Engine Capacity', labelStartX, currentY)
        pdf.text(':', colonX, currentY)
        pdf.text(`${String(engineCapacity || 'N/A')} cc`, valueStartX, currentY)
        currentY += 6
        
        pdf.text('Colour', labelStartX, currentY)
        pdf.text(':', colonX, currentY)
        pdf.text(String(vehicleColor || 'N/A'), valueStartX, currentY)
        currentY += 6
        
        pdf.text('Fuel Type', labelStartX, currentY)
        pdf.text(':', colonX, currentY)
        pdf.text(String(fuelType || 'N/A'), valueStartX, currentY)
        currentY += 6
        
        pdf.text('Seating Capacity', labelStartX, currentY)
        pdf.text(':', colonX, currentY)
        pdf.text(String(seatingCapacity || 'N/A'), valueStartX, currentY)
        currentY += 8
      } else {
        // Sell Now invoice: Basic details only
        currentY += 8
      }

      // Unit Price
      pdf.setFont('helvetica', 'bold')
      pdf.setFontSize(11)
      pdf.text('Unit Price', labelStartX, currentY)
      pdf.text(':', colonX, currentY)
      if (isSellNowInvoice && sale.sold_currency === 'JPY') {
        // For sell now invoice, show in JPY
        pdf.text(`${soldPriceJpy.toLocaleString()} JPY`, valueStartX, currentY)
      } else {
        pdf.text(formatCurrency(soldPriceNum), valueStartX, currentY)
      }
      currentY += 8

      // Line separator
      pdf.line(20, currentY, 190, currentY)
      currentY += 8

      if (!isSellNowInvoice) {
        // Regular invoice: Advance Payments Table
        const advanceTableStartY = currentY
        if (totalAdvance > 0 && payments && payments.length > 0) {
          const dateX = labelStartX + 10
          const amountX = dateX + 35
          
          pdf.setFont('helvetica', 'bold')
          pdf.setFontSize(10)
          payments.forEach(payment => {
            pdf.text(new Date(payment.paid_date).toLocaleDateString(), dateX, currentY)
            pdf.text(formatCurrency(payment.amount_lkr), amountX, currentY)
            currentY += 6
          })
          
          pdf.setFont('helvetica', 'bold')
          pdf.setFontSize(11)
          pdf.text('Total Advance', labelStartX, currentY)
          pdf.text(':', colonX, currentY)
          pdf.text(formatCurrency(totalAdvance), valueStartX, currentY)
          currentY += 8
        }

        pdf.line(20, currentY, 190, currentY)
        currentY += 8

        pdf.setFont('helvetica', 'bold')
        pdf.setFontSize(11)
        pdf.text('Balance Settlement', labelStartX, currentY)
        pdf.text(':', colonX, currentY)
        pdf.text(formatCurrency(balancePaid), valueStartX, currentY)
        currentY += 8
      } else {
        // Sell Now invoice: Total (no advance, no balance settlement)
        pdf.setFont('helvetica', 'bold')
        pdf.setFontSize(11)
        pdf.text('Total', labelStartX, currentY)
        pdf.text(':', colonX, currentY)
        pdf.text(`${soldPriceJpy.toLocaleString()} JPY`, valueStartX, currentY)
        currentY += 8
      }
      
      // Ensure minimum spacing before footer
      const pageHeight = pdf.internal.pageSize.getHeight()
      if (currentY < pageHeight - 60) {
        currentY = pageHeight - 60
      }

      // Footer text (moved up)
      currentY = pageHeight - 40
      pdf.setFont('helvetica', 'bold')
      pdf.setFontSize(11)
      pdf.text('Please draw the payment in favour of R.S.Enterprises', 105, currentY, { align: 'center' })
      currentY += 15

      // Left corner: Signature section (with extra dots)
      pdf.setFont('helvetica', 'normal')
      pdf.setFontSize(10)
      pdf.text('..............................', 20, currentY) // Extra dots for signature
      currentY += 8
      
      pdf.setFont('helvetica', 'bold')
      pdf.setFontSize(10)
      pdf.text('Authorized Signature', 20, currentY)

      // Save PDF
      pdf.save(`Invoice-${vehicle.chassis_no}-${Date.now()}.pdf`)
    } catch (error: any) {
      console.error('Error generating invoice:', error)
      alert(`Error generating invoice: ${error.message}`)
    }
  }

  async function generateTransactionSummaryPDF(vehicle: VehicleWithSale) {
    try {
      const sale = vehicle.sale
      const { data: payments } = await supabase
        .from('advance_payments')
        .select('*')
        .eq('chassis_no', vehicle.chassis_no)
        .order('paid_date', { ascending: true })

      const totalAdvance = payments?.reduce((sum, p) => sum + p.amount_lkr, 0) || 0
      const soldPriceLkr = sale.sold_currency === 'JPY' 
        ? sale.sold_price * (sale.rate_jpy_to_lkr || 1)
        : sale.sold_price

      // Load transaction details if available
      const details = transactionDetails
      const leaseAmount = details?.lease_amount || 0
      const otherCharges = (details?.registration || 0) + (details?.valuation || 0) + (details?.r_licence || 0)
      
      // Amount to be Paid = Unit Price - Total Advance
      const amountToBePaid = soldPriceLkr - totalAdvance
      
      // Balance Settlement = Amount to be Paid - Lease Amount
      const balanceSettlement = leaseAmount > 0 ? amountToBePaid - leaseAmount : amountToBePaid
      
      // Payment amount (cash/cheque breakdown shown separately)
      const paymentAmount = (details?.cheque1_amount || 0) + (details?.cheque2_amount || 0) +
        ((details?.cash_5000 || 0) * 5000) + ((details?.cash_2000 || 0) * 2000) +
        ((details?.cash_1000 || 0) * 1000) + ((details?.cash_500 || 0) * 500) + ((details?.cash_100 || 0) * 100)

      const summaryNumber = String(Date.now()).slice(-4).padStart(4, '0')
      const summaryDate = new Date(sale.sold_date).toLocaleDateString()

      // Create PDF
      const pdf = new jsPDF({
        orientation: 'portrait',
        unit: 'mm',
        format: 'a4'
      })

      // Company Header (same as invoice)
      pdf.setFont('helvetica', 'bold')
      pdf.setFontSize(24)
      pdf.text('R.S.Enterprises', 105, 20, { align: 'center' })

      pdf.setFont('helvetica', 'bold')
      pdf.setFontSize(10)
      pdf.text('No.164/B,Nittambuwa Road,Paththalagedara,Veyangoda', 105, 28, { align: 'center' })
      pdf.text('Tel: 0773073156,0332245886', 105, 34, { align: 'center' })
      pdf.text('Email : rsenterprises59@gmail.com', 105, 40, { align: 'center' })

      // Line separator
      pdf.setDrawColor(0, 0, 0)
      pdf.line(20, 45, 190, 45)

      // TRANSACTION SUMMARY title (middle)
      pdf.setFont('helvetica', 'bold')
      pdf.setFontSize(18)
      pdf.text('TRANSACTION SUMMARY', 105, 55, { align: 'center' })

      // Summary No (right corner, left-aligned) and Date (left, with label)
      const summaryNoX = 160
      pdf.setFont('helvetica', 'bold')
      pdf.setFontSize(11)
      pdf.text(`Summary No: ${summaryNumber}`, summaryNoX, 65)
      pdf.setFont('helvetica', 'bold')
      pdf.setFontSize(11)
      pdf.text(`Date: ${summaryDate}`, 20, 65)

      let currentY = 75

      // To: Customer Details (no "Deliver To:")
      pdf.setFont('helvetica', 'bold')
      pdf.setFontSize(11)
      pdf.text('To:', 20, currentY)
      // Name on same line after "To:" with just 4 spaces (approximately 32mm from start, 4 spaces after "To:")
      const nameStartX = 32
      pdf.setFont('helvetica', 'bold')
      pdf.setFontSize(10)
      pdf.text(sale.customer_name || 'N/A', nameStartX, currentY)
      currentY += 8
      // Address below at same X position as start of name - print as one line
      if (sale.customer_address) {
        pdf.text(sale.customer_address, nameStartX, currentY)
        currentY += 6
      }
      
      // Load customer ID - check transaction_details first, then sale record, then advances table
      let customerIdToPrint = ''
      
      // First check transaction_details (most reliable source)
      if (details?.customer_id) {
        customerIdToPrint = details.customer_id
      }
      // Then check sale record
      else if ((sale as any).customer_id) {
        customerIdToPrint = (sale as any).customer_id
      }
      // Finally check advances table as fallback
      else {
        try {
          const { data: advanceData } = await supabase
            .from('advances')
            .select('customer_id')
            .eq('chassis_no', vehicle.chassis_no)
            .maybeSingle()
          if (advanceData && (advanceData as any).customer_id) {
            customerIdToPrint = (advanceData as any).customer_id
          }
        } catch (err) {
          // Ignore errors loading customer ID
        }
      }
      
      // Print customer ID if available
      if (customerIdToPrint) {
        pdf.text(`ID: ${customerIdToPrint}`, nameStartX, currentY)
        currentY += 6
      }
      
      currentY += 3

      // Line separator
      pdf.line(20, currentY, 190, currentY)
      currentY += 10

      // Aligned positions for labels, colons, and values (left side)
      const labelStartX = 20
      const colonX = 80
      const valueStartX = 90

      // Vehicle Details in "Label: Value" format
      pdf.setFont('helvetica', 'bold')
      pdf.setFontSize(10)
      pdf.text('Maker', labelStartX, currentY)
      pdf.text(':', colonX, currentY)
      pdf.text(vehicle.maker, valueStartX, currentY)
      currentY += 6
      
      pdf.text('Model', labelStartX, currentY)
      pdf.text(':', colonX, currentY)
      pdf.text(vehicle.model, valueStartX, currentY)
      currentY += 6
      
      pdf.text('Chassis Number', labelStartX, currentY)
      pdf.text(':', colonX, currentY)
      pdf.text(vehicle.chassis_no, valueStartX, currentY)
      currentY += 6
      
      pdf.text('Year', labelStartX, currentY)
      pdf.text(':', colonX, currentY)
      pdf.text(vehicle.manufacturer_year.toString(), valueStartX, currentY)
      currentY += 6
      
      pdf.text('Mileage', labelStartX, currentY)
      pdf.text(':', colonX, currentY)
      pdf.text(`${vehicle.mileage.toLocaleString()} km`, valueStartX, currentY)
      currentY += 8

      // Unit Price
      pdf.setFont('helvetica', 'bold')
      pdf.setFontSize(11)
      pdf.text('Unit Price', labelStartX, currentY)
      pdf.text(':', colonX, currentY)
      pdf.text(formatCurrency(soldPriceLkr), valueStartX, currentY)
      currentY += 8

      // Line separator
      pdf.line(20, currentY, 190, currentY)
      currentY += 8

      // Advance Payments Table
      if (totalAdvance > 0 && payments && payments.length > 0) {
        const dateX = labelStartX + 10
        const amountX = dateX + 35
        
        pdf.setFont('helvetica', 'bold')
        pdf.setFontSize(10)
        payments.forEach(payment => {
          pdf.text(new Date(payment.paid_date).toLocaleDateString(), dateX, currentY)
          pdf.text(formatCurrency(payment.amount_lkr), amountX, currentY)
          currentY += 6
        })
        currentY += 6

        // Total Advance
        pdf.setFont('helvetica', 'bold')
        pdf.setFontSize(11)
        pdf.text('Total Advance', labelStartX, currentY)
        pdf.text(':', colonX, currentY)
        pdf.text(formatCurrency(totalAdvance), valueStartX, currentY)
        currentY += 8
      }

      // Amount to be Paid
      pdf.setFont('helvetica', 'bold')
      pdf.setFontSize(11)
      pdf.text('Amount to be Paid', labelStartX, currentY)
      pdf.text(':', colonX, currentY)
      pdf.text(formatCurrency(amountToBePaid), valueStartX, currentY)
      currentY += 8

      // Leasing Details (if applicable)
      if (details && leaseAmount > 0) {
        pdf.setFont('helvetica', 'bold')
        pdf.setFontSize(11)
        pdf.text('Leasing Details', labelStartX, currentY)
        currentY += 6
        
        pdf.text('Lease Company', labelStartX + 5, currentY)
        pdf.text(':', colonX + 5, currentY)
        pdf.text(details.lease_company || 'N/A', valueStartX + 5, currentY)
        currentY += 6
        
        pdf.text('Lease Amount', labelStartX + 5, currentY)
        pdf.text(':', colonX + 5, currentY)
        pdf.text(formatCurrency(leaseAmount), valueStartX + 5, currentY)
        currentY += 8
      }

      // Balance Settlement
      pdf.setFont('helvetica', 'bold')
      pdf.setFontSize(11)
      pdf.text('Balance Settlement', labelStartX, currentY)
      pdf.text(':', colonX, currentY)
      pdf.text(formatCurrency(balanceSettlement), valueStartX, currentY)
      currentY += 8

      // Line separator
      pdf.line(20, currentY, 190, currentY)
      currentY += 8

      // Two-column layout: Cheque on Left, Cash on Right
      const leftX = 20
      const rightX = 110
      let leftY = currentY
      let rightY = currentY
      let maxY = currentY

      // Left column: Cheque Details (with labels)
      const hasCheque1 = details?.cheque1_no && details?.cheque1_amount && details.cheque1_amount > 0
      const hasCheque2 = details?.cheque2_no && details?.cheque2_amount && details.cheque2_amount > 0
      
      if (details && (details.payment_method === 'cheque' || details.payment_method === 'both') && (hasCheque1 || hasCheque2)) {
        pdf.setFont('helvetica', 'bold')
        pdf.setFontSize(10)
        pdf.text('Cheque Details:', leftX, leftY)
        leftY += 8
        
        // Add labels for Cheque No and Amount
        pdf.setFont('helvetica', 'bold')
        pdf.setFontSize(9)
        pdf.text('Cheque No:', leftX, leftY)
        pdf.text('Amount:', leftX + 50, leftY)
        leftY += 6
        
        pdf.setFont('helvetica', 'normal')
        pdf.setFontSize(9)
        if (hasCheque1) {
          pdf.text(`${details.cheque1_no}`, leftX, leftY)
          pdf.text(`${formatCurrency(details.cheque1_amount)}`, leftX + 50, leftY)
          leftY += 6
        }
        if (hasCheque2) {
          pdf.text(`${details.cheque2_no}`, leftX, leftY)
          pdf.text(`${formatCurrency(details.cheque2_amount)}`, leftX + 50, leftY)
          leftY += 6
        }
        leftY += 2
        if (leftY > maxY) maxY = leftY
      }

      // Right column: Cash Details
      const cashDenominations = [
        { label: '5000', value: details?.cash_5000 || 0 },
        { label: '2000', value: details?.cash_2000 || 0 },
        { label: '1000', value: details?.cash_1000 || 0 },
        { label: '500', value: details?.cash_500 || 0 },
        { label: '100', value: details?.cash_100 || 0 },
      ]
      
      const hasCash = cashDenominations.some(denom => denom.value > 0)
      
      if (details && (details.payment_method === 'cash' || details.payment_method === 'both') && hasCash) {
        pdf.setFont('helvetica', 'bold')
        pdf.setFontSize(10)
        pdf.text('Cash Details:', rightX, rightY)
        rightY += 6
        pdf.setFont('helvetica', 'normal')
        pdf.setFontSize(9)
        
        cashDenominations.forEach(denom => {
          if (denom.value > 0) {
            const qty = denom.value
            const amount = qty * parseFloat(denom.label)
            pdf.text(`${denom.label} x ${qty} = ${formatCurrency(amount)}`, rightX, rightY)
            rightY += 6
          }
        })
        if (rightY > maxY) maxY = rightY
      }

      currentY = maxY + 8

      // Other Charges
      if (otherCharges > 0) {
        pdf.setFont('helvetica', 'bold')
        pdf.setFontSize(10)
        pdf.text('Other Charges:', labelStartX, currentY)
        currentY += 6
        pdf.setFont('helvetica', 'normal')
        pdf.setFontSize(9)
        if (details?.registration > 0) {
          pdf.text(`Registration: ${formatCurrency(details.registration)}`, labelStartX, currentY)
          currentY += 6
        }
        if (details?.valuation > 0) {
          pdf.text(`Valuation: ${formatCurrency(details.valuation)}`, labelStartX, currentY)
          currentY += 6
        }
        if (details?.r_licence > 0) {
          pdf.text(`R/Licence: ${formatCurrency(details.r_licence)}`, labelStartX, currentY)
          currentY += 6
        }
        currentY += 3

        // Other Charges Total
        pdf.setFont('helvetica', 'bold')
        pdf.setFontSize(10)
        pdf.text('Other Charges Total', labelStartX, currentY)
        pdf.text(':', colonX, currentY)
        pdf.text(formatCurrency(otherCharges), valueStartX, currentY)
        currentY += 15
      }

      // Signatures at the very end (after other charges)
      const pageHeight = pdf.internal.pageSize.getHeight()
      currentY = Math.max(currentY, pageHeight - 40) // Ensure minimum space from bottom

      // Left: Authorized Signature
      pdf.setFont('helvetica', 'normal')
      pdf.setFontSize(10)
      pdf.text('..............................', 20, currentY)
      currentY += 8
      pdf.setFont('helvetica', 'bold')
      pdf.setFontSize(10)
      pdf.text('Authorized Signature', 20, currentY)

      // Right: Customer Signature
      pdf.setFont('helvetica', 'normal')
      pdf.setFontSize(10)
      pdf.text('..............................', 110, currentY - 8)
      pdf.setFont('helvetica', 'bold')
      pdf.setFontSize(10)
      pdf.text('Customer Signature', 110, currentY)

      // Save PDF
      pdf.save(`Transaction-Summary-${vehicle.chassis_no}-${Date.now()}.pdf`)
    } catch (error: any) {
      console.error('Error generating transaction summary:', error)
      alert(`Error generating transaction summary: ${error.message}`)
    }
  }

  async function generateTransactionSummaryPDFOld(vehicle: VehicleWithSale) {
    // For now, open in new window - you can implement PDF generation similar to invoice
    const summaryWindow = window.open('', '_blank')
    if (!summaryWindow) return

    const sale = vehicle.sale
    const { data: payments } = await supabase
      .from('advance_payments')
      .select('*')
      .eq('chassis_no', vehicle.chassis_no)
      .order('paid_date', { ascending: true })

    const totalAdvance = payments?.reduce((sum, p) => sum + p.amount_lkr, 0) || 0
    const balanceAfterAdvance = sale.sold_price - totalAdvance

    // Load transaction details if available
    const details = transactionDetails
    const leaseAmount = details?.lease_amount || 0
    const balanceAfterLease = balanceAfterAdvance - leaseAmount
    const otherCharges = (details?.registration || 0) + (details?.valuation || 0) + (details?.r_licence || 0)
    const finalBalance = balanceAfterLease - otherCharges

    const addressParts = sale.customer_address ? sale.customer_address.split(',').map(p => p.trim()).filter(p => p) : []

    summaryWindow.document.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>Transaction Summary - ${vehicle.chassis_no}</title>
          <style>
            body { font-family: Arial, sans-serif; padding: 40px; max-width: 800px; margin: 0 auto; }
            .header { text-align: center; margin-bottom: 30px; border-bottom: 3px solid #92400E; padding-bottom: 20px; }
            .header h1 { margin: 0; color: #92400E; font-size: 32px; }
            .section { margin: 25px 0; }
            .section h3 { color: #92400E; border-bottom: 2px solid #e5e7eb; padding-bottom: 5px; margin-bottom: 15px; }
            .details table { width: 100%; border-collapse: collapse; margin-top: 10px; }
            .details td { padding: 10px; border-bottom: 1px solid #e5e7eb; }
            .details td:first-child { font-weight: bold; width: 35%; color: #475569; }
            .table { width: 100%; border-collapse: collapse; margin: 15px 0; }
            .table th, .table td { padding: 10px; text-align: left; border: 1px solid #e5e7eb; }
            .table th { background: #fef3c7; font-weight: bold; }
            .table td:last-child { text-align: right; }
            .total-section { margin-top: 30px; padding: 20px; background: linear-gradient(135deg, #fef3c7 0%, #fde68a 100%); border-radius: 10px; border: 2px solid #92400E; }
            .total-row { display: flex; justify-content: space-between; margin: 8px 0; font-size: 16px; }
            .total-row.final { font-size: 24px; font-weight: bold; margin-top: 15px; padding-top: 15px; border-top: 2px solid #92400E; }
            .signature-section { margin-top: 40px; display: flex; justify-content: space-between; }
            .signature-box { width: 45%; text-align: center; }
            .signature-line { border-top: 2px solid #000; margin-top: 60px; padding-top: 5px; }
          </style>
        </head>
        <body>
          <div class="header">
            <h1>TRANSACTION SUMMARY</h1>
            <div style="margin-top: 10px; color: #64748b;">Date: ${new Date(sale.sold_date).toLocaleDateString()}</div>
          </div>
          
          <div class="section">
            <h3>Customer Details</h3>
            <table class="details">
              <tr><td>Name:</td><td>${sale.customer_name}</td></tr>
              <tr><td>Phone:</td><td>${sale.customer_phone || 'N/A'}</td></tr>
              <tr><td>Address:</td><td>${addressParts.length > 0 ? addressParts.join(', ') : (sale.customer_address || 'N/A')}</td></tr>
            </table>
          </div>

          <div class="section">
            <h3>Vehicle Details</h3>
            <table class="details">
              <tr><td>Maker & Model:</td><td>${vehicle.maker} ${vehicle.model}</td></tr>
              <tr><td>Chassis Number:</td><td>${vehicle.chassis_no}</td></tr>
              <tr><td>Year:</td><td>${vehicle.manufacturer_year}</td></tr>
              <tr><td>Mileage:</td><td>${vehicle.mileage.toLocaleString()} km</td></tr>
            </table>
          </div>

          <div class="section">
            <h3>Sale Price</h3>
            <div class="total-section">
              <div class="total-row">
                <span>Sale Price:</span>
                <span>${sale.sold_currency === 'JPY' ? `${sale.sold_price.toLocaleString()} JPY` : formatCurrency(sale.sold_price)}</span>
              </div>
            </div>
          </div>

          ${totalAdvance > 0 ? `
            <div class="section">
              <h3>Advance Payments</h3>
              <table class="table">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Amount (LKR)</th>
                  </tr>
                </thead>
                <tbody>
                  ${payments?.map(p => `
                    <tr>
                      <td>${new Date(p.paid_date).toLocaleDateString()}</td>
                      <td>${formatCurrency(p.amount_lkr)}</td>
                    </tr>
                  `).join('')}
                  <tr style="background: #fef3c7; font-weight: bold;">
                    <td>Total Advance:</td>
                    <td>${formatCurrency(totalAdvance)}</td>
                  </tr>
                </tbody>
              </table>
              <div class="total-section" style="margin-top: 15px;">
                <div class="total-row">
                  <span>Balance After Advance:</span>
                  <span>${formatCurrency(balanceAfterAdvance)}</span>
                </div>
              </div>
            </div>
          ` : ''}

          ${leaseAmount > 0 ? `
            <div class="section">
              <h3>Leasing Details</h3>
              <table class="details">
                <tr><td>Lease Company:</td><td>${details?.lease_company || 'N/A'}</td></tr>
                <tr><td>Lease Amount:</td><td>${formatCurrency(leaseAmount)}</td></tr>
              </table>
              <div class="total-section" style="margin-top: 15px;">
                <div class="total-row">
                  <span>Balance After Lease:</span>
                  <span>${formatCurrency(balanceAfterLease)}</span>
                </div>
              </div>
            </div>
          ` : ''}

          ${otherCharges > 0 ? `
            <div class="section">
              <h3>Other Charges</h3>
              <table class="table">
                <tbody>
                  ${details?.registration > 0 ? `<tr><td>Registration</td><td>${formatCurrency(details.registration)}</td></tr>` : ''}
                  ${details?.valuation > 0 ? `<tr><td>Valuation</td><td>${formatCurrency(details.valuation)}</td></tr>` : ''}
                  ${details?.r_licence > 0 ? `<tr><td>R/Licence</td><td>${formatCurrency(details.r_licence)}</td></tr>` : ''}
                  <tr style="background: #fef3c7; font-weight: bold;">
                    <td>Total Other Charges:</td>
                    <td>${formatCurrency(otherCharges)}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          ` : ''}

          <div class="section">
            <div class="total-section">
              <div class="total-row final">
                <span>Final Balance:</span>
                <span>${formatCurrency(finalBalance)}</span>
              </div>
            </div>
          </div>

          <div class="signature-section">
            <div class="signature-box">
              <div class="signature-line">
                <strong>Customer Signature</strong>
              </div>
            </div>
            <div class="signature-box">
              <div class="signature-line">
                <strong>Authorized Signature</strong>
              </div>
            </div>
          </div>

          <div style="margin-top: 40px; text-align: center; color: #64748b; font-size: 14px;">
            <p>This is a computer-generated transaction summary.</p>
          </div>
        </body>
      </html>
    `)
    summaryWindow.document.close()
  }


  function toggleExpand(chassisNo: string) {
    setExpandedItems(prev => {
      const newSet = new Set(prev)
      if (newSet.has(chassisNo)) {
        newSet.delete(chassisNo)
      } else {
        newSet.add(chassisNo)
      }
      return newSet
    })
  }

  // Get unique months from vehicles
  const getAvailableMonths = () => {
    const months = new Set<string>()
    vehicles.forEach(vehicle => {
      const date = new Date(vehicle.sale.sold_date)
      const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
      months.add(monthKey)
    })
    return Array.from(months).sort().reverse() // Newest first
  }

  // Filter vehicles by search and month
  const filteredAndSortedVehicles = vehicles
    .filter(vehicle => {
      // Filter by search query
      if (searchQuery) {
        const query = searchQuery.toLowerCase()
        if (!vehicle.chassis_no.toString().toLowerCase().includes(query)) {
          return false
        }
      }
      
      // Filter by selected month
      if (selectedMonth) {
        const date = new Date(vehicle.sale.sold_date)
        const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
        if (monthKey !== selectedMonth) {
          return false
        }
      }
      
      return true
    })
    .sort((a, b) => {
      // Sort by date descending (newest first)
      const dateA = new Date(a.sale.sold_date)
      const dateB = new Date(b.sale.sold_date)
      return dateB.getTime() - dateA.getTime()
    })

  // Format month for display
  const formatMonth = (monthKey: string) => {
    const [year, month] = monthKey.split('-')
    const date = new Date(parseInt(year), parseInt(month) - 1)
    return date.toLocaleDateString('en-US', { year: 'numeric', month: 'long' })
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    )
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-6"
    >
      <div>
        <h1 className="text-4xl font-bold text-stone-900 mb-2">Sold Vehicles</h1>
        <p className="text-stone-700">View all vehicles that have been sold</p>
      </div>

      {/* Search and Month Filter Controls */}
      {vehicles.length > 0 && (
        <div className="card p-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Search by Chassis */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-stone-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search by chassis number..."
                className="input-field pl-10"
              />
            </div>

            {/* Select Month */}
            <div className="relative">
              <Calendar className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-stone-400" />
              <select
                value={selectedMonth}
                onChange={(e) => setSelectedMonth(e.target.value)}
                className="select-field pl-10"
              >
                <option value="">All Months</option>
                {getAvailableMonths().map(monthKey => (
                  <option key={monthKey} value={monthKey}>
                    {formatMonth(monthKey)}
                  </option>
                ))}
              </select>
            </div>
          </div>
          
          {(searchQuery || selectedMonth) && (
            <div className="mt-3 text-sm text-stone-600 flex items-center gap-2">
              <span>
                Found {filteredAndSortedVehicles.length} vehicle(s)
                {searchQuery && ` matching "${searchQuery}"`}
                {selectedMonth && ` in ${formatMonth(selectedMonth)}`}
              </span>
              {(searchQuery || selectedMonth) && (
                <button
                  onClick={() => {
                    setSearchQuery('')
                    setSelectedMonth('')
                  }}
                  className="ml-2 px-2 py-1 text-amber-700 hover:text-amber-800 underline text-xs"
                >
                  Clear Filters
                </button>
              )}
            </div>
          )}
        </div>
      )}

      {vehicles.length === 0 ? (
        <div className="card p-12 text-center">
          <TrendingUp className="w-16 h-16 mx-auto text-slate-400 mb-4" />
          <h3 className="text-xl font-semibold text-slate-700 mb-2">No Sold Vehicles</h3>
          <p className="text-slate-600">Sold vehicles will appear here</p>
        </div>
      ) : filteredAndSortedVehicles.length === 0 ? (
        <div className="card p-12 text-center">
          <Search className="w-16 h-16 mx-auto text-stone-400 mb-4" />
          <h3 className="text-xl font-semibold text-stone-700 mb-2">No Vehicles Found</h3>
          <p className="text-stone-600">No vehicles match your search criteria</p>
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="mt-4 px-4 py-2 bg-amber-100 text-amber-800 rounded-lg hover:bg-amber-200 transition-colors"
            >
              Clear Search
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {filteredAndSortedVehicles.map((vehicle, index) => {
            const isExpanded = expandedItems.has(vehicle.chassis_no)
            return (
              <motion.div
                key={vehicle.chassis_no}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.05 }}
                className="card overflow-hidden"
              >
                {/* Collapsed Header - Always Visible */}
                <button
                  onClick={() => toggleExpand(vehicle.chassis_no)}
                  className="w-full p-4 flex items-center justify-between hover:bg-stone-50 transition-colors text-left"
                >
                  <div className="flex-1">
                    <div className="flex items-center gap-3">
                      <h3 className="text-lg font-bold text-stone-800">
                        {vehicle.maker} {vehicle.model}
                      </h3>
                      <span className="text-xs px-2 py-1 bg-amber-100 text-amber-800 rounded-full">
                        {new Date(vehicle.sale.sold_date).toLocaleDateString()}
                      </span>
                    </div>
                    <div className="flex items-center gap-4 mt-1 text-sm text-stone-600">
                      <span>Chassis: {vehicle.chassis_no}</span>
                      <span>•</span>
                      <span className="font-semibold text-stone-800">
                        {isAdmin(user) ? (
                          vehicle.sale.sold_currency === 'JPY' 
                            ? `${vehicle.sale.sold_price.toLocaleString()} JPY`
                            : formatCurrency(vehicle.sale.sold_price)
                        ) : (
                          // Staff: Convert JPY to LKR or show LKR directly
                          vehicle.sale.sold_currency === 'JPY' && vehicle.sale.rate_jpy_to_lkr
                            ? formatCurrency(vehicle.sale.sold_price * vehicle.sale.rate_jpy_to_lkr)
                            : formatCurrency(vehicle.sale.sold_price)
                        )}
                      </span>
                      {isAdmin(user) && (
                        <>
                          <span>•</span>
                          <span className="font-semibold text-green-700">
                            Profit: {formatCurrency(vehicle.sale.profit || 0)}
                          </span>
                        </>
                      )}
                    </div>
                  </div>
                  <motion.div
                    animate={{ rotate: isExpanded ? 180 : 0 }}
                    transition={{ duration: 0.2 }}
                    className="ml-4 flex-shrink-0"
                  >
                    <ChevronDown className="w-5 h-5 text-stone-600" />
                  </motion.div>
                </button>

                {/* Expanded Content - Animated */}
                <AnimatePresence>
                  {isExpanded && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.3 }}
                      className="overflow-hidden"
                    >
                      <div className="px-4 pb-4 pt-2 border-t border-stone-200 space-y-4">
                        {/* Vehicle Details */}
                        <div className="grid grid-cols-2 gap-4 text-sm">
                          <div>
                            <span className="text-stone-600">Year:</span>
                            <span className="ml-2 font-semibold text-stone-800">{vehicle.manufacturer_year}</span>
                          </div>
                          <div>
                            <span className="text-stone-600">Mileage:</span>
                            <span className="ml-2 font-semibold text-stone-800">{vehicle.mileage.toLocaleString()} km</span>
                          </div>
                        </div>

                        {/* Sale Details */}
                        <div className="space-y-2 pt-2 border-t border-stone-200">
                          <div className="flex items-center justify-between text-sm">
                            <span className="text-stone-600">Sold Date:</span>
                            <span className="font-semibold text-stone-800">
                              {new Date(vehicle.sale.sold_date).toLocaleDateString()}
                            </span>
                          </div>
                          <div className="flex items-center justify-between text-sm">
                            <span className="text-stone-600">Sold Price:</span>
                            <span className="font-semibold text-stone-800">
                              {isAdmin(user) ? (
                                vehicle.sale.sold_currency === 'JPY' 
                                  ? `${vehicle.sale.sold_price.toLocaleString()} JPY`
                                  : formatCurrency(vehicle.sale.sold_price)
                              ) : (
                                // Staff: Convert JPY to LKR or show LKR directly
                                vehicle.sale.sold_currency === 'JPY' && vehicle.sale.rate_jpy_to_lkr
                                  ? formatCurrency(vehicle.sale.sold_price * vehicle.sale.rate_jpy_to_lkr)
                                  : formatCurrency(vehicle.sale.sold_price)
                              )}
                            </span>
                          </div>
                          {isAdmin(user) && (
                            <div className="flex items-center justify-between text-sm pt-2 border-t border-stone-200">
                              <span className="text-stone-600">Profit (LKR):</span>
                              <span className="font-bold text-green-700">
                                {formatCurrency(vehicle.sale.profit || 0)}
                              </span>
                            </div>
                          )}
                        </div>

                        {/* Customer Details */}
                        <div className="space-y-2 pt-2 border-t border-stone-200">
                          <h4 className="font-semibold text-stone-800 text-sm mb-2">Customer Information</h4>
                          <div className="flex items-center justify-between text-sm">
                            <span className="text-stone-600">Name:</span>
                            <span className="font-semibold text-stone-800">
                              {vehicle.sale.customer_name}
                            </span>
                          </div>
                          {vehicle.sale.customer_phone && (
                            <div className="flex items-center justify-between text-sm">
                              <span className="text-stone-600">Phone:</span>
                              <span className="text-stone-800">
                                {vehicle.sale.customer_phone}
                              </span>
                            </div>
                          )}
                          {vehicle.sale.customer_address && (
                            <div className="flex items-start justify-between text-sm">
                              <span className="text-stone-600">Address:</span>
                              <span className="text-stone-800 text-right max-w-xs">
                                {vehicle.sale.customer_address}
                              </span>
                            </div>
                          )}
                        </div>

                        {/* Action Buttons */}
                        <div className="pt-2 border-t border-stone-200 flex flex-col gap-2">
                          <button
                            onClick={(e) => {
                              e.stopPropagation()
                              handleReprintClick(vehicle)
                            }}
                            className="w-full px-4 py-2 bg-amber-50 text-amber-800 rounded-lg hover:bg-amber-100 transition-colors flex items-center justify-center gap-2 text-sm font-medium border border-amber-200"
                          >
                            <Printer className="w-4 h-4" />
                            Re-print Invoice
                          </button>
                          {isAdmin(user) && (
                            <>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation()
                                  handleDeleteSale(vehicle)
                                }}
                                className="w-full px-4 py-2 bg-red-50 text-red-800 rounded-lg hover:bg-red-100 transition-colors flex items-center justify-center gap-2 text-sm font-medium border border-red-200"
                              >
                                <X className="w-4 h-4" />
                                Delete Sale
                              </button>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation()
                                  handleDeleteVehicle(vehicle)
                                }}
                                className="w-full px-4 py-2 bg-red-100 text-red-900 rounded-lg hover:bg-red-200 transition-colors flex items-center justify-center gap-2 text-sm font-medium border-2 border-red-300"
                              >
                                <Trash2 className="w-4 h-4" />
                                Delete Vehicle
                              </button>
                            </>
                          )}
                        </div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.div>
            )
          })}
        </div>
      )}

      {/* Document Type Selection Modal */}
      <AnimatePresence>
        {showDocumentModal && selectedVehicle && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowDocumentModal(false)}
              className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"
            >
              <motion.div
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.9 }}
                onClick={(e) => e.stopPropagation()}
                className="bg-white rounded-xl shadow-2xl max-w-md w-full"
              >
                <div className="p-6 border-b border-stone-200 flex items-center justify-between">
                  <h2 className="text-2xl font-bold text-stone-800">Select Document Type</h2>
                  <button
                    onClick={() => setShowDocumentModal(false)}
                    className="p-2 hover:bg-stone-100 rounded-lg transition-colors"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>

                <div className="p-6">
                  {/* Check if it's a "sell now" invoice (no transaction_details) - only show invoice option */}
                  {/* If transaction_details exist, it means it was sold via "Mark Sold" - show both options */}
                  {!transactionDetails ? (
                    <div className="text-center">
                      <button
                        onClick={() => generateDocument('invoice')}
                        className="card p-6 hover:shadow-lg transition-all border-2 border-amber-200 hover:border-amber-400 text-center w-full"
                      >
                        <FileText className="w-12 h-12 mx-auto mb-3 text-amber-700" />
                        <h4 className="font-bold text-stone-800 mb-2">Invoice</h4>
                        <p className="text-sm text-stone-600">Sell Now Invoice</p>
                      </button>
                    </div>
                  ) : (
                    <div className="grid grid-cols-2 gap-4">
                      <button
                        onClick={() => generateDocument('invoice')}
                        className="card p-6 hover:shadow-lg transition-all border-2 border-amber-200 hover:border-amber-400 text-center"
                      >
                        <FileText className="w-12 h-12 mx-auto mb-3 text-amber-700" />
                        <h4 className="font-bold text-stone-800 mb-2">Invoice</h4>
                        <p className="text-sm text-stone-600">Invoice with vehicle info and payment details</p>
                      </button>
                      <button
                        onClick={() => generateDocument('transaction')}
                        className="card p-6 hover:shadow-lg transition-all border-2 border-amber-200 hover:border-amber-400 text-center"
                      >
                        <Receipt className="w-12 h-12 mx-auto mb-3 text-amber-700" />
                        <h4 className="font-bold text-stone-800 mb-2">Transaction Summary</h4>
                        <p className="text-sm text-stone-600">Detailed summary with all transaction details</p>
                      </button>
                    </div>
                  )}
                </div>
              </motion.div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Transaction Form Modal */}
      <AnimatePresence>
        {showTransactionForm && selectedVehicle && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowTransactionForm(false)}
              className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"
            >
              <motion.div
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.9 }}
                onClick={(e) => e.stopPropagation()}
                className="bg-white rounded-xl shadow-2xl max-w-4xl w-full max-h-[90vh] overflow-y-auto"
              >
                <div className="p-6 border-b border-stone-200 flex items-center justify-between">
                  <h2 className="text-2xl font-bold text-stone-800">Fill Transaction Summary Details</h2>
                  <button
                    onClick={() => setShowTransactionForm(false)}
                    className="p-2 hover:bg-stone-100 rounded-lg transition-colors"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>

                <div className="p-6 space-y-6">
                  <div className="p-4 bg-amber-50 rounded-lg border border-amber-200">
                    <p className="text-sm text-amber-700">
                      <strong>Note:</strong> Transaction summary details were not saved when this vehicle was sold. Please fill in the required information to generate the transaction summary.
                    </p>
                  </div>

                  <div className="border-t border-stone-200 pt-4">
                    <h3 className="font-semibold text-stone-800 mb-4">Leasing Details</h3>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="label">Lease Company *</label>
                        <input
                          type="text"
                          value={leaseCompany}
                          onChange={(e) => setLeaseCompany(e.target.value)}
                          className="input-field"
                          required
                        />
                      </div>
                      <div>
                        <label className="label">Lease Amount (LKR) *</label>
                        <input
                          type="number"
                          step="0.01"
                          value={leaseAmount}
                          onChange={(e) => setLeaseAmount(e.target.value)}
                          className="input-field"
                          required
                        />
                      </div>
                    </div>
                  </div>

                  <div className="border-t border-stone-200 pt-4">
                    <h3 className="font-semibold text-stone-800 mb-4">Balance Settlement</h3>
                    <div className="mb-4">
                      <label className="label">Payment Method *</label>
                      <div className="grid grid-cols-3 gap-3 mt-2">
                        <button
                          type="button"
                          onClick={() => setPaymentMethod('cash')}
                          className={`px-4 py-2 rounded-lg border-2 transition-colors ${
                            paymentMethod === 'cash'
                              ? 'bg-amber-100 border-amber-500 text-amber-900'
                              : 'bg-white border-stone-300 text-stone-700 hover:border-amber-300'
                          }`}
                        >
                          Cash
                        </button>
                        <button
                          type="button"
                          onClick={() => setPaymentMethod('cheque')}
                          className={`px-4 py-2 rounded-lg border-2 transition-colors ${
                            paymentMethod === 'cheque'
                              ? 'bg-amber-100 border-amber-500 text-amber-900'
                              : 'bg-white border-stone-300 text-stone-700 hover:border-amber-300'
                          }`}
                        >
                          Cheque
                        </button>
                        <button
                          type="button"
                          onClick={() => setPaymentMethod('both')}
                          className={`px-4 py-2 rounded-lg border-2 transition-colors ${
                            paymentMethod === 'both'
                              ? 'bg-amber-100 border-amber-500 text-amber-900'
                              : 'bg-white border-stone-300 text-stone-700 hover:border-amber-300'
                          }`}
                        >
                          Both
                        </button>
                      </div>
                    </div>

                    {(paymentMethod === 'cheque' || paymentMethod === 'both') && (
                      <div className="mb-4 p-4 bg-stone-50 rounded-lg">
                        <h4 className="font-semibold mb-3">Cheque Details</h4>
                        <div className="grid grid-cols-2 gap-4">
                          <div>
                            <label className="label text-sm">Cheque 1 No *</label>
                            <input
                              type="text"
                              value={cheque1No}
                              onChange={(e) => setCheque1No(e.target.value)}
                              className="input-field"
                            />
                          </div>
                          <div>
                            <label className="label text-sm">Cheque 1 Amount *</label>
                            <input
                              type="number"
                              step="0.01"
                              value={cheque1Amount}
                              onChange={(e) => setCheque1Amount(e.target.value)}
                              className="input-field"
                            />
                          </div>
                          <div>
                            <label className="label text-sm">Cheque 2 No (Optional)</label>
                            <input
                              type="text"
                              value={cheque2No}
                              onChange={(e) => setCheque2No(e.target.value)}
                              className="input-field"
                            />
                          </div>
                          <div>
                            <label className="label text-sm">Cheque 2 Amount</label>
                            <input
                              type="number"
                              step="0.01"
                              value={cheque2Amount}
                              onChange={(e) => setCheque2Amount(e.target.value)}
                              className="input-field"
                            />
                          </div>
                        </div>
                      </div>
                    )}

                    {(paymentMethod === 'cash' || paymentMethod === 'both') && (
                      <div className="mb-4 p-4 bg-stone-50 rounded-lg">
                        <h4 className="font-semibold mb-3">Cash Denominations</h4>
                        <div className="grid grid-cols-5 gap-3">
                          <div>
                            <label className="label text-sm">5000 x</label>
                            <input
                              type="number"
                              value={cash5000}
                              onChange={(e) => setCash5000(e.target.value)}
                              className="input-field"
                            />
                          </div>
                          <div>
                            <label className="label text-sm">2000 x</label>
                            <input
                              type="number"
                              value={cash2000}
                              onChange={(e) => setCash2000(e.target.value)}
                              className="input-field"
                            />
                          </div>
                          <div>
                            <label className="label text-sm">1000 x</label>
                            <input
                              type="number"
                              value={cash1000}
                              onChange={(e) => setCash1000(e.target.value)}
                              className="input-field"
                            />
                          </div>
                          <div>
                            <label className="label text-sm">500 x</label>
                            <input
                              type="number"
                              value={cash500}
                              onChange={(e) => setCash500(e.target.value)}
                              className="input-field"
                            />
                          </div>
                          <div>
                            <label className="label text-sm">100 x</label>
                            <input
                              type="number"
                              value={cash100}
                              onChange={(e) => setCash100(e.target.value)}
                              className="input-field"
                            />
                          </div>
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="border-t border-stone-200 pt-4">
                    <h3 className="font-semibold text-stone-800 mb-4">Other Charges</h3>
                    <div className="grid grid-cols-3 gap-4">
                      <div>
                        <label className="label">Registration</label>
                        <input
                          type="number"
                          step="0.01"
                          value={registration}
                          onChange={(e) => setRegistration(e.target.value)}
                          className="input-field"
                        />
                      </div>
                      <div>
                        <label className="label">Valuation</label>
                        <input
                          type="number"
                          step="0.01"
                          value={valuation}
                          onChange={(e) => setValuation(e.target.value)}
                          className="input-field"
                        />
                      </div>
                      <div>
                        <label className="label">R/Licence</label>
                        <input
                          type="number"
                          step="0.01"
                          value={rLicence}
                          onChange={(e) => setRLicence(e.target.value)}
                          className="input-field"
                        />
                      </div>
                    </div>
                  </div>

                  <div className="border-t border-stone-200 pt-4">
                    <h3 className="font-semibold text-stone-800 mb-4">Signatures</h3>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="label">Customer Signature</label>
                        <input
                          type="text"
                          value={customerSignature}
                          onChange={(e) => setCustomerSignature(e.target.value)}
                          className="input-field"
                        />
                      </div>
                      <div>
                        <label className="label">Authorized Signature</label>
                        <input
                          type="text"
                          value={authorizedSignature}
                          onChange={(e) => setAuthorizedSignature(e.target.value)}
                          className="input-field"
                        />
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center justify-end gap-4 pt-4 border-t border-stone-200">
                    <button
                      onClick={() => setShowTransactionForm(false)}
                      className="btn-secondary"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleTransactionFormSubmit}
                      className="btn-primary"
                    >
                      Save & Generate PDF
                    </button>
                  </div>
                </div>
              </motion.div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </motion.div>
  )
}

