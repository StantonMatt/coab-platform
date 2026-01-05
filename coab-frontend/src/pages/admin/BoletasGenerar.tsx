import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import adminApiClient from '@/lib/adminApi';
import { Checkbox } from '@/components/ui/checkbox';
import {
  ArrowLeft,
  FileSpreadsheet,
  Loader2,
  CheckCircle,
  AlertTriangle,
  Eye,
  Download,
  RefreshCw,
  Users,
  DollarSign,
  Percent,
  Receipt,
  Calendar,
  Check,
  X,
} from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import { formatearPesos } from '@coab/utils';
import { Progress } from '@/components/ui/progress';

interface BoletaPreview {
  clienteId: string;
  numeroCliente: string;
  nombreCliente: string;
  rutCliente: string | null;
  consumoM3: number;
  cargoFijo: number;
  costoAgua: number;
  costoAlcantarillado: number;
  costoTratamiento: number;
  subtotal: number;
  montoDescuento: number;
  montoSubsidio: number;
  montoTotalMes: number;
  saldoAnterior: number;
  montoRepactacion: number;
  montoOtrosCargos: number;
  montoNeto: number;
  montoIva: number;
  montoTotal: number;
  numeroFolio: string;
  tieneDescuento: boolean;
  tieneSubsidio: boolean;
  tieneRepactacion: boolean;
  tieneMultas: boolean;
  observaciones: string;
}

interface PreviewSummary {
  totalBoletas: number;
  totalMonto: number;
  conDescuento: number;
  conSubsidio: number;
  conRepactacion: number;
  conMultas: number;
  montoTotalDescuentos: number;
  montoTotalSubsidios: number;
}

interface PreviewResult {
  periodo: string;
  periodoLabel: string;
  boletas: BoletaPreview[];
  summary: PreviewSummary;
  boletasExistentes: number;
  folioInicial: number;
}

interface ImportResult {
  periodo: string;
  boletasCreadas: number;
  boletasActualizadas: number;
  notasCredito: number;
  multas: number;
  descuentos: number;
  reposiciones: number;
  errores: string[];
}

interface PeriodData {
  año: number;
  mes: number;
  totalBoletas: number;
  boletasConPdf: number;
  tieneBoletasPdf: boolean;
}

// Combined results for multiple periods
interface CombinedPreviewResult {
  periodos: string[];
  periodosLabels: string[];
  previewsByPeriod: Map<string, PreviewResult>;
  combinedSummary: PreviewSummary;
  totalBoletasExistentes: number;
}

interface CombinedImportResult {
  periodos: string[];
  resultsByPeriod: Map<string, ImportResult>;
  totalBoletasCreadas: number;
  totalBoletasActualizadas: number;
  totalErrores: string[];
}

const MONTH_NAMES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
];

function formatPeriodLabel(periodo: string): string {
  const [year, month] = periodo.split('-');
  return `${MONTH_NAMES[parseInt(month, 10) - 1]} ${year}`;
}

export default function BoletasGenerarPage() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Multi-select state
  const [selectedMonths, setSelectedMonths] = useState<string[]>([]);
  const [previewData, setPreviewData] = useState<CombinedPreviewResult | null>(null);
  const [sobreescribir, setSobreescribir] = useState(false);
  const [importResult, setImportResult] = useState<CombinedImportResult | null>(null);

  // Loading states
  const [isGeneratingPreview, setIsGeneratingPreview] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [currentOperation, setCurrentOperation] = useState<string>('');
  const [operationProgress, setOperationProgress] = useState(0);

  // Check admin auth
  useEffect(() => {
    const token = localStorage.getItem('admin_access_token');
    if (!token) {
      navigate('/admin/login');
    }
  }, [navigate]);

  // Fetch available periods
  const { data: availablePeriodsData, isLoading: isLoadingPeriods } = useQuery({
    queryKey: ['available-periods'],
    queryFn: async () => {
      const res = await adminApiClient.get('/admin/lecturas/periodos-disponibles');
      return res.data as { periodos: PeriodData[] };
    },
  });

  const availablePeriods = availablePeriodsData?.periodos || [];

  // Convert period data to string format for selection
  const periodOptions = availablePeriods.map(p => ({
    value: `${p.año}-${String(p.mes).padStart(2, '0')}`,
    label: `${MONTH_NAMES[p.mes - 1]} ${p.año}`,
    hasExisting: p.totalBoletas > 0,
    existingCount: p.totalBoletas,
  }));

  // Toggle month selection
  const toggleMonth = (periodo: string) => {
    setSelectedMonths(prev => 
      prev.includes(periodo) 
        ? prev.filter(p => p !== periodo)
        : [...prev, periodo].sort()
    );
    // Reset results when selection changes
    setPreviewData(null);
    setImportResult(null);
  };

  // Select all / deselect all
  const selectAll = () => {
    setSelectedMonths(periodOptions.map(p => p.value).sort());
    setPreviewData(null);
    setImportResult(null);
  };

  const deselectAll = () => {
    setSelectedMonths([]);
    setPreviewData(null);
    setImportResult(null);
  };

  // Check if multiple months are consecutive and require sequential import
  const requiresSequentialImport = selectedMonths.length > 1;

  // Generate preview - only for single month or first month in sequence
  const handlePreview = async () => {
    if (selectedMonths.length === 0) return;

    // For multiple months, only preview the first one
    const monthsToPreview = requiresSequentialImport ? [selectedMonths[0]] : selectedMonths;

    setIsGeneratingPreview(true);
    setPreviewData(null);
    setImportResult(null);
    setOperationProgress(0);

    const previewsByPeriod = new Map<string, PreviewResult>();
    const periodosLabels: string[] = [];
    let hasError = false;

    for (let i = 0; i < monthsToPreview.length; i++) {
      const periodo = monthsToPreview[i];
      setCurrentOperation(`Calculando ${formatPeriodLabel(periodo)}...`);
      setOperationProgress(((i + 1) / monthsToPreview.length) * 100);

      try {
        const res = await adminApiClient.post('/admin/boletas/generar-preview', { periodo }, {
          timeout: 60000,
        });
        const result = res.data as PreviewResult;
        previewsByPeriod.set(periodo, result);
        periodosLabels.push(result.periodoLabel);
      } catch (error: any) {
        hasError = true;
        toast({
          variant: 'destructive',
          title: `Error en ${formatPeriodLabel(periodo)}`,
          description: error.response?.data?.error?.message || 'Error al generar vista previa',
        });
      }
    }

    if (previewsByPeriod.size > 0) {
      // Combine summaries (for single preview, this is just the one)
      const combinedSummary: PreviewSummary = {
        totalBoletas: 0,
        totalMonto: 0,
        conDescuento: 0,
        conSubsidio: 0,
        conRepactacion: 0,
        conMultas: 0,
        montoTotalDescuentos: 0,
        montoTotalSubsidios: 0,
      };
      let totalBoletasExistentes = 0;

      for (const preview of previewsByPeriod.values()) {
        combinedSummary.totalBoletas += preview.summary.totalBoletas;
        combinedSummary.totalMonto += preview.summary.totalMonto;
        combinedSummary.conDescuento += preview.summary.conDescuento;
        combinedSummary.conSubsidio += preview.summary.conSubsidio;
        combinedSummary.conRepactacion += preview.summary.conRepactacion;
        combinedSummary.conMultas += preview.summary.conMultas;
        combinedSummary.montoTotalDescuentos += preview.summary.montoTotalDescuentos;
        combinedSummary.montoTotalSubsidios += preview.summary.montoTotalSubsidios;
        totalBoletasExistentes += preview.boletasExistentes;
      }

      setPreviewData({
        periodos: selectedMonths, // Keep all selected months for the import
        periodosLabels,
        previewsByPeriod,
        combinedSummary,
        totalBoletasExistentes,
      });

      if (!hasError) {
        const msg = requiresSequentialImport 
          ? `Vista previa del primer período. Los ${selectedMonths.length} períodos se importarán secuencialmente.`
          : `${combinedSummary.totalBoletas} boletas calculadas`;
        toast({
          title: 'Vista previa generada',
          description: msg,
        });
      }
    }

    setIsGeneratingPreview(false);
    setCurrentOperation('');
  };

  // Import all selected months sequentially
  // For multiple months, we need to import each one before the next can be processed
  // because each month depends on the previous month's boletas for folio numbers
  const handleImport = async () => {
    if (!previewData || selectedMonths.length === 0) return;

    setIsImporting(true);
    setOperationProgress(0);

    const resultsByPeriod = new Map<string, ImportResult>();
    let totalBoletasCreadas = 0;
    let totalBoletasActualizadas = 0;
    const totalErrores: string[] = [];
    let stopProcessing = false;

    // Sort months chronologically to ensure proper order
    const sortedMonths = [...selectedMonths].sort();

    for (let i = 0; i < sortedMonths.length; i++) {
      if (stopProcessing) break;

      const periodo = sortedMonths[i];
      const stepNumber = i + 1;
      const totalSteps = sortedMonths.length;

      // For months after the first, we need to generate the boletas first
      // because the backend needs the previous month's boletas to exist
      if (i > 0) {
        setCurrentOperation(`[${stepNumber}/${totalSteps}] Calculando ${formatPeriodLabel(periodo)}...`);
        setOperationProgress((i / totalSteps) * 100);

        // Brief pause to let user see the status
        await new Promise(resolve => setTimeout(resolve, 500));
      }

      setCurrentOperation(`[${stepNumber}/${totalSteps}] Importando ${formatPeriodLabel(periodo)}...`);
      setOperationProgress(((i + 0.5) / totalSteps) * 100);

      try {
        const res = await adminApiClient.post('/admin/boletas/importar', { 
          periodo, 
          sobreescribir 
        }, {
          timeout: 180000,
        });
        const result = res.data as ImportResult;
        resultsByPeriod.set(periodo, result);
        totalBoletasCreadas += result.boletasCreadas;
        totalBoletasActualizadas += result.boletasActualizadas;
        if (result.errores.length > 0) {
          totalErrores.push(...result.errores.map(e => `${formatPeriodLabel(periodo)}: ${e}`));
        }

        // Update progress after successful import
        setOperationProgress(((i + 1) / totalSteps) * 100);

      } catch (error: any) {
        const errorMsg = error.response?.data?.error?.message || 'Error desconocido';
        totalErrores.push(`${formatPeriodLabel(periodo)}: ${errorMsg}`);
        toast({
          variant: 'destructive',
          title: `Error en ${formatPeriodLabel(periodo)}`,
          description: errorMsg,
        });
        
        // Stop processing if we hit an error (subsequent months depend on this one)
        stopProcessing = true;
        
        if (i < sortedMonths.length - 1) {
          toast({
            variant: 'destructive',
            title: 'Proceso detenido',
            description: `Los períodos siguientes no se pudieron procesar porque dependen del anterior.`,
          });
        }
      }
    }

    setImportResult({
      periodos: sortedMonths,
      resultsByPeriod,
      totalBoletasCreadas,
      totalBoletasActualizadas,
      totalErrores,
    });
    setPreviewData(null);
    queryClient.invalidateQueries({ queryKey: ['available-periods'] });

    if (totalBoletasCreadas > 0) {
      toast({
        title: 'Importación completada',
        description: `${totalBoletasCreadas} boletas importadas en ${resultsByPeriod.size} período(s)`,
      });
    }

    setIsImporting(false);
    setCurrentOperation('');
  };

  const handleReset = () => {
    setPreviewData(null);
    setImportResult(null);
    setSobreescribir(false);
    setSelectedMonths([]);
  };

  const isLoading = isGeneratingPreview || isImporting;

  // Get currently selected period to show details
  const [detailPeriod, setDetailPeriod] = useState<string | null>(null);
  const currentDetailPreview = detailPeriod && previewData?.previewsByPeriod.get(detailPeriod);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100">
      {/* Header */}
      <div className="bg-white border-b border-slate-200 sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-4">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => navigate('/admin/dashboard')}
                className="gap-2"
              >
                <ArrowLeft className="h-4 w-4" />
                Volver
              </Button>
              <div className="h-6 w-px bg-slate-200" />
              <div className="flex items-center gap-2">
                <FileSpreadsheet className="h-5 w-5 text-slate-600" />
                <h1 className="text-lg font-semibold text-slate-900">Generar Boletas</h1>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="space-y-6">
          {/* Period Selection Card */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="text-lg flex items-center gap-2">
                  <Calendar className="h-5 w-5" />
                  Seleccionar Períodos
                </CardTitle>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={selectAll} disabled={isLoading}>
                    Seleccionar todos
                  </Button>
                  <Button variant="outline" size="sm" onClick={deselectAll} disabled={isLoading}>
                    Limpiar
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {isLoadingPeriods ? (
                <div className="flex items-center gap-2 text-slate-500">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Cargando períodos...
                </div>
              ) : (
                <>
                  {/* Period checkboxes grid */}
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
                    {periodOptions.map((period) => (
                      <label
                        key={period.value}
                        className={`
                          flex items-center gap-2 p-3 rounded-lg border cursor-pointer transition-all
                          ${selectedMonths.includes(period.value) 
                            ? 'border-blue-500 bg-blue-50 text-blue-900' 
                            : 'border-slate-200 hover:border-slate-300 bg-white'}
                          ${isLoading ? 'opacity-50 cursor-not-allowed' : ''}
                        `}
                      >
                        <Checkbox
                          checked={selectedMonths.includes(period.value)}
                          onCheckedChange={() => !isLoading && toggleMonth(period.value)}
                          disabled={isLoading}
                        />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">{period.label}</p>
                          {period.hasExisting && (
                            <p className="text-xs text-amber-600">
                              {period.existingCount} existentes
                            </p>
                          )}
                        </div>
                      </label>
                    ))}
                  </div>

                  {/* Selection summary and action buttons */}
                  <div className="flex flex-col gap-4 pt-4 border-t">
                    {/* Info message for multi-month selection */}
                    {requiresSequentialImport && (
                      <div className="flex items-start gap-2 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                        <AlertTriangle className="h-5 w-5 text-blue-600 flex-shrink-0 mt-0.5" />
                        <div className="text-sm text-blue-800">
                          <p className="font-medium">Importación secuencial requerida</p>
                          <p className="mt-1">
                            Cada mes depende de los datos del mes anterior para calcular el número de folio y saldo anterior.
                            Los {selectedMonths.length} períodos serán importados en orden cronológico, uno por uno.
                          </p>
                        </div>
                      </div>
                    )}
                    
                    <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
                      <p className="text-sm text-slate-600">
                        {selectedMonths.length === 0 
                          ? 'Selecciona uno o más períodos para generar boletas'
                          : `${selectedMonths.length} período(s) seleccionado(s)`}
                      </p>
                      <div className="flex gap-2">
                        <Button
                          onClick={handlePreview}
                          disabled={selectedMonths.length === 0 || isLoading}
                          className="gap-2"
                        >
                          {isGeneratingPreview ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <Eye className="h-4 w-4" />
                          )}
                          {requiresSequentialImport ? 'Vista Previa (1er mes)' : 'Generar Vista Previa'}
                        </Button>

                        {(previewData || importResult) && (
                          <Button
                            variant="outline"
                            onClick={handleReset}
                            className="gap-2"
                            disabled={isLoading}
                          >
                            <RefreshCw className="h-4 w-4" />
                            Nueva Consulta
                          </Button>
                        )}
                      </div>
                    </div>
                  </div>
                </>
              )}
            </CardContent>
          </Card>

          {/* Progress indicator during operations */}
          {isLoading && (
            <Card>
              <CardContent className="py-8">
                <div className="space-y-4">
                  <div className="flex items-center gap-3 justify-center">
                    <Loader2 className="h-6 w-6 animate-spin text-blue-500" />
                    <p className="text-lg font-medium text-slate-700">{currentOperation}</p>
                  </div>
                  <Progress value={operationProgress} className="h-2" />
                  <p className="text-center text-sm text-slate-500">
                    {Math.round(operationProgress)}% completado
                  </p>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Preview Results */}
          {previewData && !isLoading && (
            <>
              {/* Warning for existing boletas */}
              {previewData.totalBoletasExistentes > 0 && (
                <Card className="border-amber-200 bg-amber-50">
                  <CardContent className="pt-6">
                    <div className="flex items-start gap-3">
                      <AlertTriangle className="h-5 w-5 text-amber-600 flex-shrink-0 mt-0.5" />
                      <div>
                        <p className="font-medium text-amber-800">
                          Ya existen {previewData.totalBoletasExistentes} boletas en los períodos seleccionados
                        </p>
                        <p className="text-sm text-amber-700 mt-1">
                          Para reemplazarlas, activa la opción "Sobreescribir boletas existentes" antes de importar.
                        </p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Combined Summary Cards */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <Card>
                  <CardContent className="pt-6">
                    <div className="flex items-center gap-3">
                      <div className="p-2 bg-blue-100 rounded-lg">
                        <Users className="h-5 w-5 text-blue-600" />
                      </div>
                      <div>
                        <p className="text-2xl font-bold text-slate-900">
                          {previewData.combinedSummary.totalBoletas}
                        </p>
                        <p className="text-sm text-slate-500">Boletas a generar</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardContent className="pt-6">
                    <div className="flex items-center gap-3">
                      <div className="p-2 bg-emerald-100 rounded-lg">
                        <DollarSign className="h-5 w-5 text-emerald-600" />
                      </div>
                      <div>
                        <p className="text-2xl font-bold text-slate-900">
                          {formatearPesos(previewData.combinedSummary.totalMonto)}
                        </p>
                        <p className="text-sm text-slate-500">Monto total</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardContent className="pt-6">
                    <div className="flex items-center gap-3">
                      <div className="p-2 bg-amber-100 rounded-lg">
                        <Percent className="h-5 w-5 text-amber-600" />
                      </div>
                      <div>
                        <p className="text-2xl font-bold text-slate-900">
                          {previewData.combinedSummary.conSubsidio}
                        </p>
                        <p className="text-sm text-slate-500">Con subsidio</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardContent className="pt-6">
                    <div className="flex items-center gap-3">
                      <div className="p-2 bg-purple-100 rounded-lg">
                        <Receipt className="h-5 w-5 text-purple-600" />
                      </div>
                      <div>
                        <p className="text-2xl font-bold text-slate-900">
                          {previewData.combinedSummary.conDescuento}
                        </p>
                        <p className="text-sm text-slate-500">Con descuento</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>

              {/* Per-period breakdown */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Resumen por Período</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-slate-200">
                          <th className="text-left py-3 px-2 font-medium text-slate-600">Período</th>
                          <th className="text-right py-3 px-2 font-medium text-slate-600">Boletas</th>
                          <th className="text-right py-3 px-2 font-medium text-slate-600">Monto Total</th>
                          <th className="text-right py-3 px-2 font-medium text-slate-600">Subsidios</th>
                          <th className="text-right py-3 px-2 font-medium text-slate-600">Descuentos</th>
                          <th className="text-right py-3 px-2 font-medium text-slate-600">Existentes</th>
                          <th className="text-center py-3 px-2 font-medium text-slate-600">Detalle</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {Array.from(previewData.previewsByPeriod.entries()).map(([periodo, preview]) => (
                          <tr key={periodo} className="hover:bg-slate-50">
                            <td className="py-2 px-2 font-medium text-slate-700">
                              {preview.periodoLabel}
                            </td>
                            <td className="py-2 px-2 text-right text-slate-700">
                              {preview.summary.totalBoletas}
                            </td>
                            <td className="py-2 px-2 text-right text-slate-700">
                              {formatearPesos(preview.summary.totalMonto)}
                            </td>
                            <td className="py-2 px-2 text-right text-amber-600">
                              {preview.summary.conSubsidio > 0 ? preview.summary.conSubsidio : '-'}
                            </td>
                            <td className="py-2 px-2 text-right text-emerald-600">
                              {preview.summary.conDescuento > 0 ? preview.summary.conDescuento : '-'}
                            </td>
                            <td className="py-2 px-2 text-right">
                              {preview.boletasExistentes > 0 ? (
                                <span className="text-amber-600 font-medium">{preview.boletasExistentes}</span>
                              ) : (
                                <span className="text-slate-400">0</span>
                              )}
                            </td>
                            <td className="py-2 px-2 text-center">
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => setDetailPeriod(detailPeriod === periodo ? null : periodo)}
                              >
                                <Eye className="h-4 w-4" />
                              </Button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot>
                        <tr className="border-t-2 border-slate-300 bg-slate-50 font-medium">
                          <td className="py-3 px-2 text-slate-900">Total</td>
                          <td className="py-3 px-2 text-right text-slate-900">
                            {previewData.combinedSummary.totalBoletas}
                          </td>
                          <td className="py-3 px-2 text-right text-slate-900">
                            {formatearPesos(previewData.combinedSummary.totalMonto)}
                          </td>
                          <td className="py-3 px-2 text-right text-amber-600">
                            {previewData.combinedSummary.conSubsidio}
                          </td>
                          <td className="py-3 px-2 text-right text-emerald-600">
                            {previewData.combinedSummary.conDescuento}
                          </td>
                          <td className="py-3 px-2 text-right text-amber-600">
                            {previewData.totalBoletasExistentes}
                          </td>
                          <td></td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                </CardContent>
              </Card>

              {/* Detail view for selected period */}
              {currentDetailPreview && (
                <Card>
                  <CardHeader className="flex flex-row items-center justify-between">
                    <CardTitle className="text-lg">
                      Detalle de Boletas - {currentDetailPreview.periodoLabel}
                    </CardTitle>
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-slate-500">
                        {currentDetailPreview.boletas.length} registros
                      </span>
                      <Button variant="ghost" size="sm" onClick={() => setDetailPeriod(null)}>
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="overflow-x-auto max-h-96">
                      <table className="w-full text-sm">
                        <thead className="sticky top-0 bg-white">
                          <tr className="border-b border-slate-200">
                            <th className="text-left py-3 px-2 font-medium text-slate-600">Folio</th>
                            <th className="text-left py-3 px-2 font-medium text-slate-600">Cliente</th>
                            <th className="text-left py-3 px-2 font-medium text-slate-600">Nombre</th>
                            <th className="text-right py-3 px-2 font-medium text-slate-600">Consumo</th>
                            <th className="text-right py-3 px-2 font-medium text-slate-600">Subtotal</th>
                            <th className="text-right py-3 px-2 font-medium text-slate-600">Descuento</th>
                            <th className="text-right py-3 px-2 font-medium text-slate-600">Subsidio</th>
                            <th className="text-right py-3 px-2 font-medium text-slate-600">Total</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {currentDetailPreview.boletas.slice(0, 100).map((boleta) => (
                            <tr key={`${detailPeriod}-${boleta.clienteId}`} className="hover:bg-slate-50">
                              <td className="py-2 px-2 font-mono text-slate-600">
                                {boleta.numeroFolio}
                              </td>
                              <td className="py-2 px-2 font-mono text-slate-700">
                                {boleta.numeroCliente}
                              </td>
                              <td className="py-2 px-2 text-slate-700 max-w-[200px] truncate">
                                {boleta.nombreCliente}
                              </td>
                              <td className="py-2 px-2 text-right text-slate-700">
                                {boleta.consumoM3} m³
                              </td>
                              <td className="py-2 px-2 text-right text-slate-700">
                                {formatearPesos(boleta.subtotal)}
                              </td>
                              <td className="py-2 px-2 text-right text-emerald-600">
                                {boleta.montoDescuento > 0 ? `-${formatearPesos(boleta.montoDescuento)}` : '-'}
                              </td>
                              <td className="py-2 px-2 text-right text-amber-600">
                                {boleta.montoSubsidio > 0 ? `-${formatearPesos(boleta.montoSubsidio)}` : '-'}
                              </td>
                              <td className="py-2 px-2 text-right font-semibold text-slate-900">
                                {formatearPesos(boleta.montoTotal)}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                      {currentDetailPreview.boletas.length > 100 && (
                        <p className="text-center text-sm text-slate-500 py-4">
                          Mostrando 100 de {currentDetailPreview.boletas.length} boletas
                        </p>
                      )}
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Import Action */}
              <Card className="border-blue-200 bg-blue-50">
                <CardContent className="pt-6">
                  <div className="flex flex-col gap-4">
                    <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                      <div>
                        <h3 className="font-semibold text-blue-900">
                          {previewData.periodos.length > 1 
                            ? '¿Importar boletas secuencialmente?' 
                            : '¿Importar boletas a la base de datos?'}
                        </h3>
                        <p className="text-sm text-blue-700 mt-1">
                          {previewData.periodos.length > 1 
                            ? `Se importarán ${previewData.periodos.length} períodos en orden cronológico`
                            : `Se guardarán ${previewData.combinedSummary.totalBoletas} boletas para ${previewData.periodosLabels[0]}`
                          }
                        </p>
                      </div>
                      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
                        {previewData.totalBoletasExistentes > 0 && (
                          <label className="flex items-center gap-2 text-sm">
                            <Switch
                              checked={sobreescribir}
                              onCheckedChange={setSobreescribir}
                            />
                            <span className="text-blue-800">Sobreescribir existentes</span>
                          </label>
                        )}
                        <Button
                          onClick={handleImport}
                          disabled={isImporting || (previewData.totalBoletasExistentes > 0 && !sobreescribir)}
                          className="gap-2 bg-blue-600 hover:bg-blue-700"
                        >
                          {isImporting ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <Download className="h-4 w-4" />
                          )}
                          {previewData.periodos.length > 1 
                            ? `Importar ${previewData.periodos.length} Períodos` 
                            : 'Importar Boletas'}
                        </Button>
                      </div>
                    </div>
                    
                    {/* Show the periods that will be imported */}
                    {previewData.periodos.length > 1 && (
                      <div className="text-sm text-blue-700 pt-2 border-t border-blue-200">
                        <p className="font-medium mb-1">Orden de importación:</p>
                        <div className="flex flex-wrap gap-2">
                          {[...previewData.periodos].sort().map((periodo, idx) => (
                            <span key={periodo} className="inline-flex items-center gap-1 px-2 py-1 bg-blue-100 rounded">
                              <span className="font-mono text-xs text-blue-500">{idx + 1}.</span>
                              {formatPeriodLabel(periodo)}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            </>
          )}

          {/* Import Result */}
          {importResult && !isLoading && (
            <Card className="border-emerald-200 bg-emerald-50">
              <CardContent className="pt-6">
                <div className="flex items-start gap-3">
                  <CheckCircle className="h-6 w-6 text-emerald-600 flex-shrink-0" />
                  <div className="space-y-3 flex-1">
                    <div>
                      <h3 className="font-semibold text-emerald-900 text-lg">
                        Importación completada exitosamente
                      </h3>
                      <p className="text-emerald-700">
                        Se importaron {importResult.totalBoletasCreadas} boletas 
                        en {importResult.resultsByPeriod.size} período(s).
                      </p>
                    </div>

                    {/* Per-period results */}
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b border-emerald-200">
                            <th className="text-left py-2 px-2 font-medium text-emerald-800">Período</th>
                            <th className="text-right py-2 px-2 font-medium text-emerald-800">Creadas</th>
                            <th className="text-right py-2 px-2 font-medium text-emerald-800">Reemplazadas</th>
                            <th className="text-center py-2 px-2 font-medium text-emerald-800">Estado</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-emerald-100">
                          {Array.from(importResult.resultsByPeriod.entries()).map(([periodo, result]) => (
                            <tr key={periodo}>
                              <td className="py-2 px-2 text-emerald-900">
                                {formatPeriodLabel(periodo)}
                              </td>
                              <td className="py-2 px-2 text-right text-emerald-700">
                                {result.boletasCreadas}
                              </td>
                              <td className="py-2 px-2 text-right text-emerald-700">
                                {result.boletasActualizadas || '-'}
                              </td>
                              <td className="py-2 px-2 text-center">
                                {result.errores.length === 0 ? (
                                  <Check className="h-4 w-4 text-emerald-600 inline" />
                                ) : (
                                  <AlertTriangle className="h-4 w-4 text-amber-600 inline" />
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                        <tfoot>
                          <tr className="border-t-2 border-emerald-300 font-medium">
                            <td className="py-2 px-2 text-emerald-900">Total</td>
                            <td className="py-2 px-2 text-right text-emerald-900">
                              {importResult.totalBoletasCreadas}
                            </td>
                            <td className="py-2 px-2 text-right text-emerald-900">
                              {importResult.totalBoletasActualizadas || '-'}
                            </td>
                            <td></td>
                          </tr>
                        </tfoot>
                      </table>
                    </div>

                    {importResult.totalErrores.length > 0 && (
                      <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
                        <p className="font-medium text-amber-800 mb-1">Errores encontrados:</p>
                        <ul className="text-sm text-amber-700 list-disc list-inside">
                          {importResult.totalErrores.map((error, i) => (
                            <li key={i}>{error}</li>
                          ))}
                        </ul>
                      </div>
                    )}

                    <Button
                      variant="outline"
                      onClick={handleReset}
                      className="gap-2 mt-4"
                    >
                      <RefreshCw className="h-4 w-4" />
                      Generar otros períodos
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Empty State */}
          {!previewData && !importResult && !isLoading && (
            <Card>
              <CardContent className="py-12">
                <div className="text-center text-slate-500">
                  <FileSpreadsheet className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p className="text-lg font-medium">Selecciona uno o más períodos y genera la vista previa</p>
                  <p className="text-sm mt-1">
                    Podrás revisar los cálculos antes de importar las boletas a la base de datos
                  </p>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
