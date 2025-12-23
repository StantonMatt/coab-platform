import { StyleSheet } from '@react-pdf/renderer';

// COAB Brand Colors
export const colors = {
  primary: '#0066CC',
  primaryDark: '#004999',
  accent: '#00AA44',
  danger: '#DC2626',
  warning: '#F59E0B',
  text: '#1F2937',
  textLight: '#6B7280',
  border: '#E5E7EB',
  background: '#F9FAFB',
  white: '#FFFFFF',
};

export const styles = StyleSheet.create({
  // Page
  page: {
    padding: 25,
    fontFamily: 'Helvetica',
    fontSize: 9,
    color: colors.text,
    backgroundColor: colors.white,
  },

  // Header
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 15,
    paddingBottom: 10,
    borderBottomWidth: 2,
    borderBottomColor: colors.primary,
  },
  logoContainer: {
    width: 120,
  },
  logo: {
    width: 100,
    height: 40,
  },
  headerRight: {
    textAlign: 'right',
    alignItems: 'flex-end',
  },
  boletaNumber: {
    fontSize: 14,
    fontWeight: 'bold',
    color: colors.primary,
    marginBottom: 3,
  },
  rutText: {
    fontSize: 8,
    color: colors.textLight,
  },

  // Cards/Sections
  card: {
    marginBottom: 10,
    padding: 10,
    backgroundColor: colors.background,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: colors.border,
  },
  cardTitle: {
    fontSize: 10,
    fontWeight: 'bold',
    color: colors.primary,
    marginBottom: 8,
    paddingBottom: 4,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },

  // Customer Info
  customerInfo: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  customerLeft: {
    flex: 2,
  },
  customerRight: {
    flex: 1,
    textAlign: 'right',
    alignItems: 'flex-end',
  },
  customerName: {
    fontSize: 11,
    fontWeight: 'bold',
    marginBottom: 2,
  },
  customerAddress: {
    fontSize: 9,
    color: colors.textLight,
    marginBottom: 1,
  },
  clientNumber: {
    fontSize: 12,
    fontWeight: 'bold',
    color: colors.primary,
  },
  clientNumberLabel: {
    fontSize: 8,
    color: colors.textLight,
  },

  // Two columns layout
  twoColumns: {
    flexDirection: 'row',
    gap: 10,
  },
  column: {
    flex: 1,
  },

  // Tables
  table: {
    marginTop: 5,
  },
  tableRow: {
    flexDirection: 'row',
    paddingVertical: 3,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  tableRowTotal: {
    flexDirection: 'row',
    paddingVertical: 5,
    backgroundColor: colors.primary,
    borderRadius: 3,
    marginTop: 5,
  },
  tableCell: {
    flex: 1,
  },
  tableCellRight: {
    flex: 1,
    textAlign: 'right',
  },
  tableCellBold: {
    fontWeight: 'bold',
  },
  tableCellWhite: {
    color: colors.white,
    fontWeight: 'bold',
  },

  // Meter Readings
  meterReadings: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    backgroundColor: colors.primary,
    padding: 8,
    borderRadius: 4,
    marginBottom: 10,
  },
  meterItem: {
    flex: 1,
    textAlign: 'center',
  },
  meterLabel: {
    fontSize: 7,
    color: colors.white,
    opacity: 0.8,
  },
  meterValue: {
    fontSize: 12,
    fontWeight: 'bold',
    color: colors.white,
  },

  // Balance Summary
  balanceSummary: {
    marginTop: 5,
  },
  balanceRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 3,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  balanceRowHighlight: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 3,
    paddingHorizontal: 5,
    backgroundColor: '#FEF3C7',
    borderRadius: 2,
    marginTop: 3,
  },
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    padding: 8,
    backgroundColor: colors.primary,
    borderRadius: 4,
    marginTop: 8,
  },
  totalLabel: {
    fontSize: 11,
    fontWeight: 'bold',
    color: colors.white,
  },
  totalAmount: {
    fontSize: 14,
    fontWeight: 'bold',
    color: colors.white,
  },

  // Payment Methods
  paymentMethodsList: {
    marginTop: 5,
  },
  paymentMethod: {
    flexDirection: 'row',
    marginBottom: 4,
  },
  paymentNumber: {
    width: 15,
    fontSize: 8,
    color: colors.primary,
    fontWeight: 'bold',
  },
  paymentText: {
    fontSize: 8,
    flex: 1,
  },

  // Warning
  warning: {
    marginTop: 10,
    padding: 10,
    backgroundColor: '#FEE2E2',
    borderRadius: 4,
    borderLeftWidth: 3,
    borderLeftColor: colors.danger,
  },
  warningTitle: {
    fontSize: 9,
    fontWeight: 'bold',
    color: colors.danger,
    marginBottom: 3,
  },
  warningText: {
    fontSize: 8,
    color: colors.text,
    lineHeight: 1.4,
  },

  // Footer
  footer: {
    marginTop: 'auto',
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  footerText: {
    fontSize: 7,
    color: colors.textLight,
    textAlign: 'center',
    lineHeight: 1.4,
  },
  footerBold: {
    fontWeight: 'bold',
  },

  // QR Code
  qrContainer: {
    alignItems: 'center',
    marginTop: 5,
  },
  qrCode: {
    width: 60,
    height: 60,
  },
  qrLabel: {
    fontSize: 7,
    color: colors.textLight,
    marginTop: 3,
    textAlign: 'center',
  },

  // Due Date highlight
  dueDate: {
    backgroundColor: '#DBEAFE',
    padding: 8,
    borderRadius: 4,
    marginBottom: 10,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  dueDateLabel: {
    fontSize: 9,
    color: colors.text,
  },
  dueDateValue: {
    fontSize: 12,
    fontWeight: 'bold',
    color: colors.primary,
  },

  // Subsidy highlight (green)
  subsidyRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 3,
    paddingHorizontal: 5,
    backgroundColor: '#D1FAE5',
    borderRadius: 2,
    marginTop: 3,
  },
  subsidyText: {
    color: colors.accent,
  },
});

