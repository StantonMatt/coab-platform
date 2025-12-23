import React from 'react';
import { Document, Page, View, Text, Image } from '@react-pdf/renderer';
import { styles, colors } from './styles.js';
import { BoletaPDFProps, COMPANY_INFO } from './types.js';
import { formatearPesos, formatearFecha, formatearRUT, FORMATOS_FECHA } from '@coab/utils';

/**
 * Modern PDF Boleta Template for COAB
 */
export const BoletaTemplate: React.FC<BoletaPDFProps> = ({
  boleta,
  cliente,
  qrCodeDataUrl,
}) => {
  // Format period as "Junio 2024"
  const periodoLabel = formatearFecha(boleta.periodoDesde, FORMATOS_FECHA.MES_ANIO);

  return (
    <Document>
      <Page size="LETTER" style={styles.page}>
        {/* Header */}
        <View style={styles.header}>
          <View style={styles.logoContainer}>
            <Text style={{ fontSize: 20, fontWeight: 'bold', color: colors.primary }}>
              COAB
            </Text>
            <Text style={{ fontSize: 7, color: colors.textLight }}>
              Cooperativa Aguas Blancas
            </Text>
          </View>
          <View style={styles.headerRight}>
            <Text style={styles.boletaNumber}>
              BOLETA ELECTRÓNICA N° {boleta.numeroFolio}
            </Text>
            <Text style={styles.rutText}>RUT: {COMPANY_INFO.rut}</Text>
            <Text style={styles.rutText}>S.I.I. - TEMUCO CENTRO</Text>
          </View>
        </View>

        {/* Customer Info */}
        <View style={styles.customerInfo}>
          <View style={styles.customerLeft}>
            <Text style={styles.customerName}>{cliente.nombreCompleto}</Text>
            <Text style={styles.customerAddress}>{cliente.direccion}</Text>
            <Text style={styles.customerAddress}>{cliente.comuna}</Text>
            {cliente.rut && (
              <Text style={styles.customerAddress}>RUT: {formatearRUT(cliente.rut)}</Text>
            )}
          </View>
          <View style={styles.customerRight}>
            <Text style={styles.clientNumberLabel}>NÚMERO CLIENTE</Text>
            <Text style={styles.clientNumber}>{cliente.numeroCliente}</Text>
          </View>
        </View>

        {/* Due Date */}
        <View style={styles.dueDate}>
          <Text style={styles.dueDateLabel}>VENCIMIENTO:</Text>
          <Text style={styles.dueDateValue}>
            {formatearFecha(boleta.fechaVencimiento, FORMATOS_FECHA.CORTO)}
          </Text>
          <Text style={styles.dueDateLabel}>TOTAL A PAGAR:</Text>
          <Text style={styles.dueDateValue}>{formatearPesos(boleta.montoTotal)}</Text>
        </View>

        {/* Meter Readings */}
        <View style={styles.meterReadings}>
          <View style={styles.meterItem}>
            <Text style={styles.meterLabel}>LEC. ANTERIOR</Text>
            <Text style={styles.meterValue}>{boleta.lecturaAnterior}</Text>
          </View>
          <View style={styles.meterItem}>
            <Text style={styles.meterLabel}>LEC. ACTUAL</Text>
            <Text style={styles.meterValue}>{boleta.lecturaActual}</Text>
          </View>
          <View style={styles.meterItem}>
            <Text style={styles.meterLabel}>CONSUMO m³</Text>
            <Text style={styles.meterValue}>{boleta.consumoM3}</Text>
          </View>
        </View>

        {/* Two Column Layout */}
        <View style={styles.twoColumns}>
          {/* Left Column - Consumption Details */}
          <View style={styles.column}>
            <View style={styles.card}>
              <Text style={styles.cardTitle}>DETALLE DE CONSUMO - {periodoLabel}</Text>
              <View style={styles.table}>
                <View style={styles.tableRow}>
                  <Text style={styles.tableCell}>Cargo Fijo</Text>
                  <Text style={styles.tableCellRight}>
                    {formatearPesos(boleta.costoCargoFijo)}
                  </Text>
                </View>
                <View style={styles.tableRow}>
                  <Text style={styles.tableCell}>Agua</Text>
                  <Text style={styles.tableCellRight}>
                    {formatearPesos(boleta.costoAgua)}
                  </Text>
                </View>
                <View style={styles.tableRow}>
                  <Text style={styles.tableCell}>Alcantarillado</Text>
                  <Text style={styles.tableCellRight}>
                    {formatearPesos(boleta.costoAlcantarillado)}
                  </Text>
                </View>
                <View style={styles.tableRow}>
                  <Text style={styles.tableCell}>Tratamiento</Text>
                  <Text style={styles.tableCellRight}>
                    {formatearPesos(boleta.costoTratamiento)}
                  </Text>
                </View>
                <View style={styles.tableRowTotal}>
                  <Text style={[styles.tableCell, styles.tableCellWhite]}>TOTAL MES</Text>
                  <Text style={[styles.tableCellRight, styles.tableCellWhite]}>
                    {formatearPesos(boleta.montoTotalMes)}
                  </Text>
                </View>
              </View>
            </View>

            {/* Payment Methods */}
            <View style={styles.card}>
              <Text style={styles.cardTitle}>MEDIOS DE PAGO</Text>
              <View style={styles.paymentMethodsList}>
                <View style={styles.paymentMethod}>
                  <Text style={styles.paymentNumber}>1.</Text>
                  <Text style={styles.paymentText}>Pago en Línea: Banco Estado</Text>
                </View>
                <View style={styles.paymentMethod}>
                  <Text style={styles.paymentNumber}>2.</Text>
                  <Text style={styles.paymentText}>
                    Convenio Caja Vecina: {COMPANY_INFO.convenioRecaudacion}
                  </Text>
                </View>
                <View style={styles.paymentMethod}>
                  <Text style={styles.paymentNumber}>3.</Text>
                  <Text style={styles.paymentText}>
                    Tarjeta de crédito: {COMPANY_INFO.webPago}
                  </Text>
                </View>
                <View style={styles.paymentMethod}>
                  <Text style={styles.paymentNumber}>4.</Text>
                  <Text style={styles.paymentText}>Transferencia de Fondos:</Text>
                </View>
                <Text style={[styles.paymentText, { marginLeft: 15, marginTop: 2 }]}>
                  Nombre: {COMPANY_INFO.nombre}
                </Text>
                <Text style={[styles.paymentText, { marginLeft: 15 }]}>
                  R.U.T.: {COMPANY_INFO.rut}
                </Text>
                <Text style={[styles.paymentText, { marginLeft: 15 }]}>
                  {COMPANY_INFO.banco}
                </Text>
                <Text style={[styles.paymentText, { marginLeft: 15 }]}>
                  Cuenta Corriente: {COMPANY_INFO.cuentaCorriente}
                </Text>
                <Text style={[styles.paymentText, { marginLeft: 15, marginTop: 3 }]}>
                  Indique su Número Cliente al correo: {COMPANY_INFO.email}
                </Text>
              </View>
            </View>
          </View>

          {/* Right Column - Balance Summary */}
          <View style={styles.column}>
            <View style={styles.card}>
              <Text style={styles.cardTitle}>RESUMEN DE CUENTA</Text>
              <View style={styles.balanceSummary}>
                <View style={styles.balanceRow}>
                  <Text>Total del Mes</Text>
                  <Text>{formatearPesos(boleta.montoTotalMes)}</Text>
                </View>
                <View style={styles.balanceRow}>
                  <Text>Saldo Anterior</Text>
                  <Text>{formatearPesos(boleta.montoSaldoAnterior)}</Text>
                </View>
                {boleta.montoRepactacion > 0 && (
                  <View style={styles.balanceRowHighlight}>
                    <Text>Repactación</Text>
                    <Text>{formatearPesos(boleta.montoRepactacion)}</Text>
                  </View>
                )}
                {boleta.montoSubsidio > 0 && (
                  <View style={styles.subsidyRow}>
                    <Text style={styles.subsidyText}>Subsidio</Text>
                    <Text style={styles.subsidyText}>
                      -{formatearPesos(boleta.montoSubsidio)}
                    </Text>
                  </View>
                )}
                <View style={styles.totalRow}>
                  <Text style={styles.totalLabel}>TOTAL A PAGAR</Text>
                  <Text style={styles.totalAmount}>{formatearPesos(boleta.montoTotal)}</Text>
                </View>
              </View>
            </View>

            {/* QR Code */}
            {qrCodeDataUrl && (
              <View style={styles.qrContainer}>
                <Image src={qrCodeDataUrl} style={styles.qrCode} />
                <Text style={styles.qrLabel}>Escanea para pagar</Text>
              </View>
            )}
          </View>
        </View>

        {/* Warning */}
        <View style={styles.warning}>
          <Text style={styles.warningTitle}>¡Atención!</Text>
          <Text style={styles.warningText}>
            Al no pagar las cuotas de su convenio su cuenta vuelve a entrar en morosidad
            crítica. Sin el pago total antes de la fecha de vencimiento, procederemos a
            suspender el suministro de agua. Este es un aviso final. Para evitar esta
            medida y discutir posibles soluciones, contáctenos por WhatsApp (solo
            mensajes) al: {COMPANY_INFO.telefono}
          </Text>
        </View>

        {/* Footer */}
        <View style={styles.footer}>
          <Text style={styles.footerText}>
            COOPERATIVA DE SERVICIO DE ABASTECIMIENTO Y DISTRIBUCIÓN DE AGUA POTABLE
            ALCANTARILLADO Y SANEAMIENTO AMBIENTAL AGUAS BLANCAS LIMITADA
          </Text>
          <Text style={styles.footerText}>
            GIRO: Servicio de Abastecimiento y Distribución de Agua Potable,
            Alcantarillado y Saneamiento Ambiental.
          </Text>
          <Text style={styles.footerText}>
            DIRECCIÓN: {COMPANY_INFO.direccion}. CORREO ELECTRÓNICO: {COMPANY_INFO.email}. OFICINA: {COMPANY_INFO.oficina}
          </Text>
          <Text style={[styles.footerText, styles.footerBold]}>
            EMERGENCIAS (Solo WhatsApp): {COMPANY_INFO.emergencias} - CONSULTAS COMERCIALES
            (Solo WhatsApp): {COMPANY_INFO.consultas}
          </Text>
        </View>
      </Page>
    </Document>
  );
};

export default BoletaTemplate;

