'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { User } from '@/lib/supabase'
import { isAdmin } from '@/lib/auth'
import { Vehicle } from '@/lib/database.types'
import { formatCurrency, formatNumber } from '@/lib/utils'
import { motion } from 'framer-motion'
import { Edit, DollarSign, CheckCircle, Car, Trash2, Search, Printer } from 'lucide-react'
import jsPDF from 'jspdf'
import EditLocalCostsModal from './EditLocalCostsModal'
import AddAdvanceModal from './AddAdvanceModal'
import MarkSoldModal from './MarkSoldModal'

interface AvailableVehiclesListProps {
  user: User
}

export default function AvailableVehiclesList({ user }: AvailableVehiclesListProps) {
  const [vehicles, setVehicles] = useState<Vehicle[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedVehicle, setSelectedVehicle] = useState<Vehicle | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [showEditCosts, setShowEditCosts] = useState(false)
  const [showAddAdvance, setShowAddAdvance] = useState(false)
  const [showMarkSold, setShowMarkSold] = useState(false)
  const router = useRouter()

  useEffect(() => {
    loadVehicles()
  }, [])

  // Refresh when page becomes visible (user navigates back to this page)
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        loadVehicles()
      }
    }
    document.addEventListener('visibilitychange', handleVisibilityChange)
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange)
  }, [])

  async function loadVehicles() {
    const { data, error } = await supabase
      .from('vehicles')
      .select('*')
      .eq('status', 'available')
      .order('created_at', { ascending: false })

    if (error) {
      console.error('Error loading vehicles:', error)
      return
    }

    setVehicles(data || [])
    setLoading(false)
  }

  function calculateLocalTotal(vehicle: Vehicle): number {
    const tax = vehicle.tax_lkr || 0
    const clearance = vehicle.clearance_lkr || 0
    const transport = vehicle.transport_lkr || 0
    const extra1 = vehicle.local_extra1_lkr || 0
    const extra2 = vehicle.local_extra2_lkr || 0
    const extra3 = vehicle.local_extra3_lkr || 0
    return tax + clearance + transport + extra1 + extra2 + extra3
  }

  function hasLocalCostsEntered(vehicle: Vehicle): boolean {
    // Check if any local costs are entered, excluding LC Commission (which is auto-filled)
    const tax = vehicle.tax_lkr || 0
    const clearance = vehicle.clearance_lkr || 0
    const transport = vehicle.transport_lkr || 0
    
    // Check extra1 only if it's NOT LC Commission
    const extra1Label = vehicle.local_extra1_label || ''
    const extra1 = (extra1Label === 'LC Commission' || extra1Label === '') ? 0 : (vehicle.local_extra1_lkr || 0)
    
    const extra2 = vehicle.local_extra2_lkr || 0
    const extra3 = vehicle.local_extra3_lkr || 0
    
    return tax > 0 || clearance > 0 || transport > 0 || extra1 > 0 || extra2 > 0 || extra3 > 0
  }

  function calculateCombinedTotal(vehicle: Vehicle): number {
    const japanTotal = vehicle.japan_total_lkr || 0
    const localTotal = calculateLocalTotal(vehicle)
    return japanTotal + localTotal
  }

  async function generateCostBreakdownPDF(vehicle: Vehicle) {
    try {
      const pdf = new jsPDF({
        orientation: 'portrait',
        unit: 'mm',
        format: 'a4'
      })

      // Set font
      pdf.setFont('helvetica', 'bold')
      pdf.setFontSize(20)
      pdf.text('Cost Breakdown Report', 105, 20, { align: 'center' })

      // Vehicle Information
      pdf.setFontSize(14)
      pdf.setFont('helvetica', 'bold')
      pdf.text('Vehicle Information', 20, 35)
      pdf.setFont('helvetica', 'normal')
      pdf.setFontSize(11)
      let yPos = 42
      pdf.text(`Maker: ${vehicle.maker}`, 20, yPos)
      yPos += 7
      pdf.text(`Model: ${vehicle.model}`, 20, yPos)
      yPos += 7
      pdf.text(`Chassis Number: ${vehicle.chassis_no}`, 20, yPos)
      yPos += 7
      pdf.text(`Year: ${vehicle.manufacturer_year}`, 20, yPos)
      yPos += 7
      pdf.text(`Mileage: ${formatNumber(vehicle.mileage)} km`, 20, yPos)
      yPos += 10

      // Japan Costs (JPY)
      pdf.setFont('helvetica', 'bold')
      pdf.setFontSize(14)
      pdf.text('Japan Costs (JPY)', 20, yPos)
      yPos += 7
      pdf.setFont('helvetica', 'normal')
      pdf.setFontSize(11)
      
      const bidJpy = vehicle.bid_jpy || 0
      const shippingJpy = vehicle.inland_transport_jpy || 0
      const commissionJpy = vehicle.commission_jpy || 0
      const insuranceJpy = vehicle.insurance_jpy || 0
      const otherJpy = vehicle.other_jpy || 0
      const otherLabel = vehicle.other_label || 'Other Cost'
      const cifTotal = bidJpy + shippingJpy + commissionJpy + insuranceJpy + otherJpy

      pdf.text(`Bidding Price: ${formatNumber(bidJpy)} JPY`, 20, yPos)
      yPos += 7
      pdf.text(`Shipping: ${formatNumber(shippingJpy)} JPY`, 20, yPos)
      yPos += 7
      pdf.text(`Commission: ${formatNumber(commissionJpy)} JPY`, 20, yPos)
      yPos += 7
      pdf.text(`Insurance: ${formatNumber(insuranceJpy)} JPY`, 20, yPos)
      yPos += 7
      if (otherJpy > 0) {
        pdf.text(`${otherLabel}: ${formatNumber(otherJpy)} JPY`, 20, yPos)
        yPos += 7
      }
      pdf.setFont('helvetica', 'bold')
      pdf.text(`Total CIF: ${formatNumber(cifTotal)} JPY`, 20, yPos)
      yPos += 10

      // CIF Split
      pdf.setFont('helvetica', 'bold')
      pdf.setFontSize(14)
      pdf.text('CIF Split', 20, yPos)
      yPos += 7
      pdf.setFont('helvetica', 'normal')
      pdf.setFontSize(11)
      
      const invoiceJpy = vehicle.invoice_amount_jpy || 0
      const undialJpy = vehicle.undial_amount_jpy || 0
      const invoiceRate = vehicle.invoice_jpy_to_lkr_rate || 0
      const undialRate = vehicle.undial_jpy_to_lkr_rate || 0

      pdf.text(`Invoice Amount: ${formatNumber(invoiceJpy)} JPY`, 20, yPos)
      yPos += 7
      pdf.text(`Invoice Rate: ${invoiceRate.toFixed(4)}`, 20, yPos)
      yPos += 7
      pdf.text(`Invoice Amount (LKR): ${formatCurrency(invoiceJpy * invoiceRate)}`, 20, yPos)
      yPos += 7
      if (undialJpy > 0) {
        pdf.text(`Undial Amount: ${formatNumber(undialJpy)} JPY`, 20, yPos)
        yPos += 7
        pdf.text(`Undial Rate: ${undialRate.toFixed(4)}`, 20, yPos)
        yPos += 7
        pdf.text(`Undial Amount (LKR): ${formatCurrency(undialJpy * undialRate)}`, 20, yPos)
        yPos += 7
      }
      pdf.setFont('helvetica', 'bold')
      const japanTotalLkr = (invoiceJpy * invoiceRate) + (undialJpy * undialRate)
      pdf.text(`Total Japan Cost (LKR): ${formatCurrency(japanTotalLkr)}`, 20, yPos)
      yPos += 10

      // Local Costs (LKR)
      pdf.setFont('helvetica', 'bold')
      pdf.setFontSize(14)
      pdf.text('Local Costs (LKR)', 20, yPos)
      yPos += 7
      pdf.setFont('helvetica', 'normal')
      pdf.setFontSize(11)
      
      const tax = vehicle.tax_lkr || 0
      const clearance = vehicle.clearance_lkr || 0
      const transport = vehicle.transport_lkr || 0
      const extra1 = vehicle.local_extra1_lkr || 0
      const extra1Label = vehicle.local_extra1_label || 'Extra Cost 1'
      const extra2 = vehicle.local_extra2_lkr || 0
      const extra2Label = vehicle.local_extra2_label || 'Extra Cost 2'
      const extra3 = vehicle.local_extra3_lkr || 0
      const extra3Label = vehicle.local_extra3_label || 'Extra Cost 3'

      if (tax > 0) {
        pdf.text(`Tax: ${formatCurrency(tax)}`, 20, yPos)
        yPos += 7
      }
      if (clearance > 0) {
        pdf.text(`Clearance: ${formatCurrency(clearance)}`, 20, yPos)
        yPos += 7
      }
      if (transport > 0) {
        pdf.text(`Transport: ${formatCurrency(transport)}`, 20, yPos)
        yPos += 7
      }
      if (extra1 > 0) {
        pdf.text(`${extra1Label}: ${formatCurrency(extra1)}`, 20, yPos)
        yPos += 7
      }
      if (extra2 > 0) {
        pdf.text(`${extra2Label}: ${formatCurrency(extra2)}`, 20, yPos)
        yPos += 7
      }
      if (extra3 > 0) {
        pdf.text(`${extra3Label}: ${formatCurrency(extra3)}`, 20, yPos)
        yPos += 7
      }
      
      const localTotal = calculateLocalTotal(vehicle)
      pdf.setFont('helvetica', 'bold')
      pdf.text(`Total Local Costs (LKR): ${formatCurrency(localTotal)}`, 20, yPos)
      yPos += 10

      // Final Total
      pdf.setFont('helvetica', 'bold')
      pdf.setFontSize(16)
      const finalTotal = japanTotalLkr + localTotal
      pdf.text(`Final Combined Total (LKR): ${formatCurrency(finalTotal)}`, 20, yPos)

      // Save PDF
      pdf.save(`Cost-Breakdown-${vehicle.chassis_no}-${Date.now()}.pdf`)
    } catch (error: any) {
      console.error('Error generating cost breakdown:', error)
      alert(`Error generating cost breakdown: ${error.message}`)
    }
  }

  async function handleDeleteVehicle(vehicle: Vehicle) {
    if (!confirm(`Are you sure you want to delete this vehicle?\n\nVehicle: ${vehicle.maker} ${vehicle.model}\nChassis: ${vehicle.chassis_no}\n\nThis will permanently delete:\n- Vehicle record\n- All advance payments\n- All advance records\n- All related data\n\nThis action cannot be undone!`)) {
      return
    }

    try {
      // Delete vehicle - this will cascade delete related records (advances, advance_payments, etc.)
      // due to ON DELETE CASCADE in the database
      const { error } = await supabase
        .from('vehicles')
        .delete()
        .eq('chassis_no', vehicle.chassis_no)

      if (error) throw error

      alert('Vehicle deleted successfully.')
      loadVehicles() // Reload the list
    } catch (error: any) {
      console.error('Error deleting vehicle:', error)
      alert(`Error deleting vehicle: ${error.message}`)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    )
  }

  return (
    <>
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="space-y-6"
      >
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-semibold text-slate-900 mb-1">Available Vehicles</h1>
            <p className="text-slate-600 text-sm">Manage vehicles currently in stock</p>
          </div>
        </div>

        {/* Search by Chassis */}
        {vehicles.length > 0 && (
          <div className="card p-4">
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
            {searchQuery && (
              <div className="mt-3 text-sm text-stone-600 flex items-center gap-2">
                <span>
                  Found {vehicles.filter(v => v.chassis_no.toString().toLowerCase().includes(searchQuery.toLowerCase())).length} vehicle(s) matching "{searchQuery}"
                </span>
                <button
                  onClick={() => setSearchQuery('')}
                  className="ml-2 px-2 py-1 text-amber-700 hover:text-amber-800 underline text-xs"
                >
                  Clear
                </button>
              </div>
            )}
          </div>
        )}

        {vehicles.length === 0 ? (
          <div className="card p-12 text-center">
            <Car className="w-16 h-16 mx-auto text-slate-400 mb-4" />
            <h3 className="text-xl font-semibold text-slate-700 mb-2">No Available Vehicles</h3>
            <p className="text-slate-600">Start by adding a new vehicle</p>
          </div>
        ) : vehicles.filter(v => v.chassis_no.toString().toLowerCase().includes(searchQuery.toLowerCase())).length === 0 ? (
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
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {vehicles
              .filter(v => v.chassis_no.toString().toLowerCase().includes(searchQuery.toLowerCase()))
              .map((vehicle, index) => (
              <motion.div
                key={vehicle.chassis_no}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.1 }}
                className="card p-6 hover:shadow-xl transition-all duration-300"
              >
                <div className="space-y-4 relative">
                  <div className="flex items-start justify-between">
                    <div>
                      <h3 className="text-xl font-bold text-slate-800">
                        {vehicle.maker} {vehicle.model}
                      </h3>
                      <p className="text-sm text-slate-600">
                        Chassis: {vehicle.chassis_no}
                      </p>
                      <p className="text-sm text-slate-600">
                        Year: {vehicle.manufacturer_year} | Mileage: {formatNumber(vehicle.mileage)} km
                      </p>
                      {/* Check if invoice has been generated (has engine_no and other invoice fields) */}
                      {/* Note: Database uses 'colour' but TypeScript interface uses 'color' */}
                      {(() => {
                        const vehicleColor = (vehicle as any).colour || vehicle.color
                        // Convert to strings and check if they're non-empty
                        const engineNo = String(vehicle.engine_no || '').trim()
                        const engineCapacity = String(vehicle.engine_capacity || '').trim()
                        const color = String(vehicleColor || '').trim()
                        const fuelType = String(vehicle.fuel_type || '').trim()
                        const seatingCapacity = String(vehicle.seating_capacity || '').trim()
                        
                        return engineNo !== '' &&
                               engineCapacity !== '' &&
                               color !== '' &&
                               fuelType !== '' &&
                               seatingCapacity !== ''
                      })() && (
                        <div className="mt-2">
                          <span className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-green-100 text-green-700 rounded-full text-xs font-semibold border border-green-300">
                            <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                              <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                            </svg>
                            Invoice Generated
                          </span>
                        </div>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      {/* Japan Flag indicator when no local costs (excluding LC Commission) */}
                      {!hasLocalCostsEntered(vehicle) && (
                        <div className="w-12 h-8 flex items-center justify-center border-2 border-black" title="No local costs entered (excluding LC Commission)">
                          <svg width="32" height="20" viewBox="0 0 32 20" xmlns="http://www.w3.org/2000/svg">
                            <rect width="32" height="20" fill="#ffffff"/>
                            <circle cx="16" cy="10" r="5" fill="#bc002d"/>
                          </svg>
                        </div>
                      )}
                      {isAdmin(user) && (
                        <button
                          onClick={() => handleDeleteVehicle(vehicle)}
                          className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors border border-red-200 hover:border-red-300"
                          title="Delete Vehicle"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </div>

                  {isAdmin(user) && (
                    <div className="space-y-2 pt-4 border-t border-slate-200">
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-slate-600">Japan Total (LKR):</span>
                        <span className="font-semibold text-slate-800">
                          {formatCurrency(vehicle.japan_total_lkr || 0)}
                        </span>
                      </div>
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-slate-600">Local Total (LKR):</span>
                        <span className="font-semibold text-slate-800">
                          {formatCurrency(calculateLocalTotal(vehicle))}
                        </span>
                      </div>
                      <div className="flex items-center justify-between pt-2 border-t border-slate-200">
                        <span className="font-semibold text-slate-700">Combined Total (LKR):</span>
                        <span className="text-lg font-bold text-blue-700">
                          {formatCurrency(calculateCombinedTotal(vehicle))}
                        </span>
                      </div>
                    </div>
                  )}

                  <div className="flex flex-wrap gap-2 pt-4">
                    <button
                      onClick={() => {
                        setSelectedVehicle(vehicle)
                        setShowEditCosts(true)
                      }}
                      className="flex-1 px-4 py-2 bg-blue-50 text-blue-700 rounded-lg hover:bg-blue-100 transition-colors flex items-center justify-center gap-2 text-sm font-medium"
                    >
                      <Edit className="w-4 h-4" />
                      Edit Costs
                    </button>
                    <button
                      onClick={() => {
                        setSelectedVehicle(vehicle)
                        setShowAddAdvance(true)
                      }}
                      className="flex-1 px-4 py-2 bg-green-50 text-green-700 rounded-lg hover:bg-green-100 transition-colors flex items-center justify-center gap-2 text-sm font-medium"
                    >
                      <DollarSign className="w-4 h-4" />
                      Add Advance
                    </button>
                    <button
                      onClick={() => {
                        setSelectedVehicle(vehicle)
                        setShowMarkSold(true)
                      }}
                      className="flex-1 px-4 py-2 bg-purple-50 text-purple-700 rounded-lg hover:bg-purple-100 transition-colors flex items-center justify-center gap-2 text-sm font-medium"
                    >
                      <CheckCircle className="w-4 h-4" />
                      Mark Sold
                    </button>
                    {isAdmin(user) && (
                      <button
                        onClick={() => generateCostBreakdownPDF(vehicle)}
                        className="flex-1 px-4 py-2 bg-orange-50 text-orange-700 rounded-lg hover:bg-orange-100 transition-colors flex items-center justify-center gap-2 text-sm font-medium"
                      >
                        <Printer className="w-4 h-4" />
                        Print Costs
                      </button>
                    )}
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        )}
      </motion.div>

      {selectedVehicle && (
        <>
          <EditLocalCostsModal
            vehicle={selectedVehicle}
            open={showEditCosts}
            onClose={() => {
              setShowEditCosts(false)
              setSelectedVehicle(null)
            }}
            onSave={loadVehicles}
            isAdmin={isAdmin(user)}
          />
          <AddAdvanceModal
            vehicle={selectedVehicle}
            open={showAddAdvance}
            onClose={() => {
              setShowAddAdvance(false)
              setSelectedVehicle(null)
            }}
            onSave={loadVehicles}
          />
          <MarkSoldModal
            vehicle={selectedVehicle}
            user={user}
            open={showMarkSold}
            onClose={() => {
              setShowMarkSold(false)
              setSelectedVehicle(null)
            }}
            onSave={() => {
              router.push('/sold')
            }}
          />
        </>
      )}

    </>
  )
}

