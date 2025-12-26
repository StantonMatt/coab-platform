import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { FileText, Pencil, AlertCircle, Search, CheckCircle, MapPin, Gauge, ArrowUpDown, ArrowUp, ArrowDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import adminApiClient from '@/lib/adminApi';
import {
  AdminLayout,
  DataTable,
  useCanAccess,
} from '@/components/admin';

interface Lectura {
  id: string;
  medidorId: string;
  valorLectura: number;
  valorCorregido: number | null;
  fechaLectura: string;
  periodoAno: number;
  periodoMes: number;
  tipoLectura: string | null;
  confirmada: boolean;
  observaciones: string | null;
  advertencia: string | null;
  propiedadVacante: boolean;
  notasNoAcceso: string | null;
  tieneCorreccion: boolean;
  medidor: {
    id: string;
    numeroSerie: string | null;
    direccion: {
      id: string;
      direccion: string;
      poblacion: string;
    } | null;
    cliente: {
      id: string;
      numeroCliente: string;
      nombre: string;
      recibeFactura: boolean;
    } | null;
  } | null;
  correccion: {
    id: string;
    valorOriginal: number;
    valorCorregido: number;
    motivoCorreccion: string;
    corregidoPor: string;
    fechaCorreccion: string;
  } | null;
}

interface LecturasResponse {
  lecturas: Lectura[];
  pagination: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
}

interface LecturaContext {
  lecturaAnterior: {
    id: string;
    valorLectura: number;
    valorCorregido: number | null;
    periodoAno: number;
    periodoMes: number;
  } | null;
  consumoActual: number | null;
  promedioConsumo: number | null;
  mesesEnPromedio: number;
}

interface PeriodoDisponible {
  año: number;
  mes: number;
  totalBoletas: number;
  boletasConPdf: number;
  tieneBoletasPdf: boolean;
}

export default function LecturasPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const canEdit = useCanAccess('lecturas', 'edit_before_boleta');
  const canCorrect = useCanAccess('lecturas', 'create_correction');

  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [periodoAno, setPeriodoAno] = useState('');
  const [periodoMes, setPeriodoMes] = useState('');
  const [conCorreccion, setConCorreccion] = useState('');
  const [initializedFilters, setInitializedFilters] = useState(false);
  
  // Sort state - default to client number ascending
  const [sortBy, setSortBy] = useState<string | null>('numeroCliente');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');

  // Fetch available periods
  const { data: periodosData, isLoading: isLoadingPeriodos } = useQuery({
    queryKey: ['admin', 'lecturas', 'periodos-disponibles'],
    queryFn: async () => {
      const response = await adminApiClient.get<{ periodos: PeriodoDisponible[] }>('/admin/lecturas/periodos-disponibles');
      return response.data.periodos;
    },
  });

  // Initialize filters with the most recent available period
  useEffect(() => {
    if (periodosData && periodosData.length > 0 && !initializedFilters) {
      const latestPeriod = periodosData[0]; // Already sorted desc by backend
      setPeriodoAno(latestPeriod.año.toString());
      setPeriodoMes(latestPeriod.mes.toString());
      setInitializedFilters(true);
    }
  }, [periodosData, initializedFilters]);

  // Get unique years and months from available periods
  const availableYears = periodosData 
    ? [...new Set(periodosData.map(p => p.año))].sort((a, b) => b - a)
    : [];
  
  const availableMonthsForYear = periodosData && periodoAno
    ? periodosData
        .filter(p => p.año === parseInt(periodoAno))
        .map(p => p.mes)
        .sort((a, b) => b - a)
    : [];

  // Sort handler - resets to page 1 when sorting changes
  const handleSort = (column: string) => {
    if (sortBy === column) {
      setSortDirection(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setSortBy(column);
      setSortDirection('asc');
    }
    setPage(1); // Reset to first page when sorting
  };

  // Sortable header component
  const SortableHeader = ({ column, label }: { column: string; label: string }) => (
    <button
      onClick={() => handleSort(column)}
      className="inline-flex items-center gap-1 hover:text-blue-600 transition-colors font-semibold"
    >
      {label}
      {sortBy === column ? (
        sortDirection === 'asc' ? (
          <ArrowUp className="h-3 w-3" />
        ) : (
          <ArrowDown className="h-3 w-3" />
        )
      ) : (
        <ArrowUpDown className="h-3 w-3 opacity-40" />
      )}
    </button>
  );

  // Detail modal state
  const [selectedLectura, setSelectedLectura] = useState<Lectura | null>(null);
  const [showDetailModal, setShowDetailModal] = useState(false);
  
  // Edit mode within detail modal
  const [isEditing, setIsEditing] = useState(false);
  const [isCreatingCorrection, setIsCreatingCorrection] = useState(false);
  
  // Form state
  const [editLectura, setEditLectura] = useState('');
  const [editNotas, setEditNotas] = useState('');
  const [correccionLectura, setCorreccionLectura] = useState('');
  const [correccionMotivo, setCorreccionMotivo] = useState('');

  // Fetch context for selected lectura
  const { data: lecturaContext, isLoading: isLoadingContext } = useQuery<LecturaContext>({
    queryKey: ['admin-lectura-context', selectedLectura?.id],
    queryFn: async () => {
      if (!selectedLectura) return null;
      const res = await adminApiClient.get(`/admin/lecturas/${selectedLectura.id}/context`);
      return res.data;
    },
    enabled: !!selectedLectura && showDetailModal,
  });

  // Fetch lecturas - sorting is done server-side
  const { data, isLoading } = useQuery<LecturasResponse>({
    queryKey: ['admin-lecturas', page, search, periodoAno, periodoMes, conCorreccion, sortBy, sortDirection],
    queryFn: async () => {
      const params = new URLSearchParams();
      params.append('page', page.toString());
      params.append('limit', '20');
      if (search) params.append('search', search);
      if (periodoAno) params.append('periodoAno', periodoAno);
      if (periodoMes) params.append('periodoMes', periodoMes);
      if (conCorreccion) params.append('conCorreccion', conCorreccion);
      if (sortBy) params.append('sortBy', sortBy);
      if (sortBy) params.append('sortDirection', sortDirection);
      const res = await adminApiClient.get<LecturasResponse>(`/admin/lecturas?${params}`);
      return res.data;
    },
    // Only fetch once filters are initialized
    enabled: initializedFilters,
  });

  // Edit mutation (direct edit - before boleta)
  const editMutation = useMutation({
    mutationFn: async ({ id, valorLectura, observaciones }: { id: string; valorLectura: number; observaciones: string }) => {
      const res = await adminApiClient.patch(`/admin/lecturas/${id}`, { valorLectura, observaciones });
      return res.data;
    },
    onSuccess: () => {
      toast({ title: 'Lectura actualizada', description: 'Los cambios se guardaron correctamente' });
      queryClient.invalidateQueries({ queryKey: ['admin-lecturas'] });
      setIsEditing(false);
      setShowDetailModal(false);
      setSelectedLectura(null);
    },
    onError: (error: any) => {
      toast({
        variant: 'destructive',
        title: 'Error',
        description: error.response?.data?.error?.message || 'Error al actualizar lectura',
      });
    },
  });

  // Correction mutation (after boleta generated)
  const correctionMutation = useMutation({
    mutationFn: async ({ lecturaId, valorCorregido, motivoCorreccion }: { lecturaId: string; valorCorregido: number; motivoCorreccion: string }) => {
      const res = await adminApiClient.post(`/admin/lecturas/${lecturaId}/correccion`, { valorCorregido, motivoCorreccion });
      return res.data;
    },
    onSuccess: () => {
      toast({ title: 'Corrección registrada', description: 'La corrección se aplicará en la próxima boleta' });
      queryClient.invalidateQueries({ queryKey: ['admin-lecturas'] });
      setIsCreatingCorrection(false);
      setShowDetailModal(false);
      setSelectedLectura(null);
    },
    onError: (error: any) => {
      toast({
        variant: 'destructive',
        title: 'Error',
        description: error.response?.data?.error?.message || 'Error al registrar corrección',
      });
    },
  });

  const handleRowClick = (lectura: Lectura) => {
    setSelectedLectura(lectura);
    setShowDetailModal(true);
    setIsEditing(false);
    setIsCreatingCorrection(false);
  };

  const handleStartEdit = () => {
    if (!selectedLectura) return;
    setEditLectura(selectedLectura.valorLectura.toString());
    setEditNotas(selectedLectura.observaciones || '');
    setIsEditing(true);
  };

  const handleStartCorrection = () => {
    if (!selectedLectura) return;
    setCorreccionLectura(selectedLectura.valorLectura.toString());
    setCorreccionMotivo('');
    setIsCreatingCorrection(true);
  };

  const handleSubmitEdit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedLectura) return;
    editMutation.mutate({
      id: selectedLectura.id,
      valorLectura: parseFloat(editLectura),
      observaciones: editNotas,
    });
  };

  const handleSubmitCorrection = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedLectura || !correccionMotivo.trim()) {
      toast({ variant: 'destructive', title: 'Error', description: 'Debe ingresar un motivo para la corrección' });
      return;
    }
    correctionMutation.mutate({
      lecturaId: selectedLectura.id,
      valorCorregido: parseFloat(correccionLectura),
      motivoCorreccion: correccionMotivo,
    });
  };

  const handleCloseModal = () => {
    setShowDetailModal(false);
    setSelectedLectura(null);
    setIsEditing(false);
    setIsCreatingCorrection(false);
  };

  const formatPeriodo = (ano: number, mes: number) => {
    const date = new Date(ano, mes - 1, 1);
    return format(date, 'MMMM yyyy', { locale: es });
  };

  // Helper for warning styles
  const getWarningStyle = (advertencia: string) => {
    const lower = advertencia.toLowerCase();
    if (lower.includes('negativo')) {
      return 'bg-red-100 text-red-700';
    } else if (lower.includes('bajo')) {
      return 'bg-blue-100 text-blue-700';
    } else if (lower.includes('alto')) {
      return 'bg-slate-100 text-slate-600';
    } else if (lower.includes('cero')) {
      return 'bg-amber-100 text-amber-700';
    }
    return 'bg-amber-100 text-amber-700';
  };

  const columns = [
    {
      key: 'periodo',
      header: <SortableHeader column="periodo" label="Período" />,
      render: (lectura: Lectura) => (
        <span className="text-slate-900">
          {formatPeriodo(lectura.periodoAno, lectura.periodoMes)}
        </span>
      ),
    },
    {
      key: 'numeroCliente',
      header: <SortableHeader column="numeroCliente" label="N° Cliente" />,
      render: (lectura: Lectura) => (
        <span className="font-mono text-sm text-slate-700">
          {lectura.medidor?.cliente?.numeroCliente || '-'}
        </span>
      ),
    },
    {
      key: 'nombreCliente',
      header: <SortableHeader column="nombreCliente" label="Nombre Cliente" />,
      render: (lectura: Lectura) => (
        <span className="text-slate-900">
          {lectura.medidor?.cliente?.nombre || '-'}
        </span>
      ),
    },
    {
      key: 'lectura',
      header: <SortableHeader column="lectura" label="Lectura" />,
      render: (lectura: Lectura) => (
        <>
          {lectura.tieneCorreccion && lectura.correccion ? (
            <>
              <span className="text-slate-400 line-through text-sm">
                {lectura.valorLectura.toLocaleString()}
              </span>
              <span className="font-bold text-blue-600 ml-2">
                {lectura.correccion.valorCorregido.toLocaleString()}
              </span>
            </>
          ) : (
            <span className="font-medium text-slate-900">
              {lectura.valorLectura.toLocaleString()}
            </span>
          )}
        </>
      ),
    },
    {
      key: 'estado',
      header: <SortableHeader column="estado" label="Estado" />,
      render: (lectura: Lectura) => {
        const recibeFactura = lectura.medidor?.cliente?.recibeFactura || false;
        
        return (
          <div className="flex flex-col items-start gap-1">
            {recibeFactura ? (
              // Client receives factura - show gray badge (external system)
              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-600">
                Factura
              </span>
            ) : lectura.confirmada ? (
              // Client receives boleta and reading is confirmed
              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-100 text-emerald-700">
                <CheckCircle className="h-3 w-3 mr-1" />
                Boleta
              </span>
            ) : (
              // Client receives boleta but reading is pending
              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-yellow-100 text-yellow-700">
                Pendiente
              </span>
            )}
            {lectura.tieneCorreccion && (
              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-700">
                Corregida
              </span>
            )}
            {lectura.advertencia && (
              <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${getWarningStyle(lectura.advertencia)}`}>
                <AlertCircle className="h-3 w-3 mr-1" />
                {lectura.advertencia}
              </span>
            )}
          </div>
        );
      },
    },
  ];


  return (
    <AdminLayout
      title="Lecturas"
      subtitle="Gestión de lecturas de medidores"
      icon={<FileText className="h-5 w-5 text-blue-600" />}
    >
      {/* Filters */}
      <div className="mb-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <Input
            placeholder="Buscar cliente o medidor..."
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            className="pl-9"
          />
        </div>
        <Select
          value={periodoAno || 'all'}
          onValueChange={(val) => {
            const newYear = val === 'all' ? '' : val;
            setPeriodoAno(newYear);
            // When changing year, auto-select the first available month for that year
            if (newYear && periodosData) {
              const monthsForYear = periodosData
                .filter(p => p.año === parseInt(newYear))
                .map(p => p.mes)
                .sort((a, b) => b - a);
              if (monthsForYear.length > 0) {
                setPeriodoMes(monthsForYear[0].toString());
              }
            } else {
              setPeriodoMes('');
            }
            setPage(1);
          }}
        >
          <SelectTrigger>
            <SelectValue placeholder="Año" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos los años</SelectItem>
            {availableYears.map((year) => (
              <SelectItem key={year} value={year.toString()}>
                {year}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select
          value={periodoMes || 'all'}
          onValueChange={(val) => {
            setPeriodoMes(val === 'all' ? '' : val);
            setPage(1);
          }}
          disabled={!periodoAno}
        >
          <SelectTrigger>
            <SelectValue placeholder="Mes" />
          </SelectTrigger>
          <SelectContent>
            {!periodoAno && <SelectItem value="all">Todos los meses</SelectItem>}
            {availableMonthsForYear.map((month) => (
              <SelectItem key={month} value={month.toString()}>
                {format(new Date(2000, month - 1, 1), 'MMMM', { locale: es })}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select
          value={conCorreccion || 'all'}
          onValueChange={(val) => {
            setConCorreccion(val === 'all' ? '' : val);
            setPage(1);
          }}
        >
          <SelectTrigger>
            <SelectValue placeholder="Correcciones" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas</SelectItem>
            <SelectItem value="true">Con corrección</SelectItem>
            <SelectItem value="false">Sin corrección</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <DataTable
        columns={columns as any}
        data={(data?.lecturas || []) as any}
        keyExtractor={(lectura: any) => lectura.id}
        isLoading={isLoading || isLoadingPeriodos || !initializedFilters}
        emptyMessage="No hay lecturas registradas"
        emptyIcon={<FileText className="h-12 w-12 text-slate-300" />}
        onRowClick={handleRowClick as any}
        pagination={
          data?.pagination && {
            page: data.pagination.page,
            totalPages: data.pagination.totalPages,
            total: data.pagination.total,
            onPageChange: setPage,
          }
        }
      />

      {/* Detail Modal */}
      <Dialog open={showDetailModal} onOpenChange={setShowDetailModal}>
        <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5 text-blue-600" />
              Detalle de Lectura
            </DialogTitle>
          </DialogHeader>

          {selectedLectura && !isEditing && !isCreatingCorrection && (
            <div className="space-y-4">
              {/* Period and Date */}
              <div className="bg-slate-50 p-4 rounded-lg">
                <h3 className="font-semibold text-slate-900 mb-2">
                  {formatPeriodo(selectedLectura.periodoAno, selectedLectura.periodoMes)}
                </h3>
                <p className="text-sm text-slate-600">
                  Fecha de lectura: {selectedLectura.fechaLectura 
                    ? format(new Date(selectedLectura.fechaLectura), "d 'de' MMMM 'de' yyyy", { locale: es })
                    : 'No registrada'}
                </p>
              </div>

              {/* Client and Meter Info */}
              <div className="grid grid-cols-2 gap-4">
                <div className="flex items-start gap-2">
                  <MapPin className="h-4 w-4 text-slate-400 mt-1" />
                  <div>
                    <p className="font-medium text-slate-900">
                      {selectedLectura.medidor?.cliente?.nombre || 'Cliente desconocido'}
                    </p>
                    <p className="text-sm text-slate-500">
                      {selectedLectura.medidor?.cliente?.numeroCliente}
                    </p>
                    <p className="text-xs text-slate-400">
                      {selectedLectura.medidor?.direccion?.direccion}
                    </p>
                  </div>
                </div>
                <div className="flex items-start gap-2">
                  <Gauge className="h-4 w-4 text-slate-400 mt-1" />
                  <div>
                    <p className="font-medium text-slate-900">Medidor</p>
                    <p className="text-sm text-slate-500">
                      {selectedLectura.medidor?.numeroSerie || 'Sin serie'}
                    </p>
                  </div>
                </div>
              </div>

              {/* Reading Value */}
              <div className="border rounded-lg p-4">
                <div className="flex items-center justify-between">
                  <span className="text-slate-600">Valor de Lectura:</span>
                  <div className="text-right">
                    {selectedLectura.tieneCorreccion && selectedLectura.correccion ? (
                      <div>
                        <span className="text-slate-400 line-through">
                          {selectedLectura.valorLectura.toLocaleString()}
                        </span>
                        <span className="font-bold text-2xl text-blue-600 ml-2">
                          {selectedLectura.correccion.valorCorregido.toLocaleString()}
                        </span>
                      </div>
                    ) : (
                      <span className="font-bold text-2xl text-slate-900">
                        {selectedLectura.valorLectura.toLocaleString()}
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {/* Context: Previous Reading & Average */}
              <div className="bg-slate-50 rounded-lg p-4 space-y-3">
                <h4 className="font-medium text-slate-700 text-sm">Contexto de Consumo</h4>
                {isLoadingContext ? (
                  <div className="text-center text-slate-500 text-sm py-2">Cargando...</div>
                ) : lecturaContext ? (
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    {/* Previous Reading */}
                    <div className="space-y-1">
                      <p className="text-slate-500">Lectura Anterior</p>
                      {lecturaContext.lecturaAnterior ? (
                        <div>
                          <p className="font-semibold text-slate-900">
                            {(lecturaContext.lecturaAnterior.valorCorregido ?? lecturaContext.lecturaAnterior.valorLectura).toLocaleString()}
                          </p>
                          <p className="text-xs text-slate-400">
                            {formatPeriodo(lecturaContext.lecturaAnterior.periodoAno, lecturaContext.lecturaAnterior.periodoMes)}
                          </p>
                        </div>
                      ) : (
                        <p className="text-slate-400 italic">Sin registro</p>
                      )}
                    </div>

                    {/* Current Consumption */}
                    <div className="space-y-1">
                      <p className="text-slate-500">Consumo Actual</p>
                      {lecturaContext.consumoActual !== null ? (
                        <p className={`font-semibold ${lecturaContext.consumoActual < 0 ? 'text-red-600' : 'text-slate-900'}`}>
                          {lecturaContext.consumoActual.toLocaleString()} m³
                        </p>
                      ) : (
                        <p className="text-slate-400 italic">-</p>
                      )}
                    </div>

                    {/* Average Consumption */}
                    <div className="space-y-1 col-span-2 pt-2 border-t border-slate-200">
                      <p className="text-slate-500">Promedio de Consumo</p>
                      {lecturaContext.promedioConsumo !== null ? (
                        <div className="flex items-baseline gap-2">
                          <p className="font-semibold text-lg text-emerald-600">
                            {lecturaContext.promedioConsumo.toLocaleString()} m³
                          </p>
                          <p className="text-xs text-slate-400">
                            (últimos {lecturaContext.mesesEnPromedio} meses)
                          </p>
                        </div>
                      ) : (
                        <p className="text-slate-400 italic">Sin suficientes datos</p>
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="text-center text-slate-400 text-sm py-2">Sin datos de contexto</div>
                )}
              </div>

              {/* Status Badges */}
              <div className="flex flex-wrap gap-2">
                {selectedLectura.medidor?.cliente?.recibeFactura ? (
                  <span className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-slate-100 text-slate-600">
                    Factura (Sistema Externo)
                  </span>
                ) : selectedLectura.confirmada ? (
                  <span className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-emerald-100 text-emerald-700">
                    <CheckCircle className="h-4 w-4 mr-1" />
                    Boleta Generada
                  </span>
                ) : (
                  <span className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-yellow-100 text-yellow-700">
                    Pendiente de Boleta
                  </span>
                )}
                {selectedLectura.tieneCorreccion && (
                  <span className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-blue-100 text-blue-700">
                    Tiene Corrección
                  </span>
                )}
                {selectedLectura.advertencia && (() => {
                  const lower = selectedLectura.advertencia.toLowerCase();
                  let style = 'bg-amber-100 text-amber-700';
                  if (lower.includes('negativo')) style = 'bg-red-100 text-red-700';
                  else if (lower.includes('bajo')) style = 'bg-blue-100 text-blue-700';
                  else if (lower.includes('alto')) style = 'bg-slate-100 text-slate-600';
                  return (
                    <span className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-medium ${style}`}>
                      <AlertCircle className="h-4 w-4 mr-1" />
                      {selectedLectura.advertencia}
                    </span>
                  );
                })()}
              </div>

              {/* Observations */}
              {selectedLectura.observaciones && (
                <div>
                  <p className="text-sm font-medium text-slate-700 mb-1">Observaciones:</p>
                  <p className="text-sm text-slate-600 bg-slate-50 p-2 rounded">
                    {selectedLectura.observaciones}
                  </p>
                </div>
              )}

              {/* Correction Details */}
              {selectedLectura.correccion && (
                <div className="border-t pt-4">
                  <h4 className="font-medium text-slate-900 mb-2">Detalles de Corrección</h4>
                  <div className="bg-blue-50 p-3 rounded-lg text-sm space-y-1">
                    <p><strong>Valor original:</strong> {selectedLectura.correccion.valorOriginal.toLocaleString()}</p>
                    <p><strong>Valor corregido:</strong> {selectedLectura.correccion.valorCorregido.toLocaleString()}</p>
                    <p><strong>Motivo:</strong> {selectedLectura.correccion.motivoCorreccion}</p>
                    <p><strong>Corregido por:</strong> {selectedLectura.correccion.corregidoPor}</p>
                    <p><strong>Fecha:</strong> {format(new Date(selectedLectura.correccion.fechaCorreccion), 'dd/MM/yyyy HH:mm', { locale: es })}</p>
                  </div>
                </div>
              )}

              {/* Action Buttons */}
              <DialogFooter className="flex-col sm:flex-row gap-2">
                <Button variant="outline" onClick={handleCloseModal}>
                  Cerrar
                </Button>
                
                {/* Edit button - only if NOT confirmed (no boleta yet) */}
                {!selectedLectura.confirmada && canEdit && (
                  <Button onClick={handleStartEdit} className="bg-blue-600 hover:bg-blue-700">
                    <Pencil className="h-4 w-4 mr-2" />
                    Editar Lectura
                  </Button>
                )}
                
                {/* Correction button - only if confirmed (boleta exists) AND no correction yet */}
                {selectedLectura.confirmada && !selectedLectura.tieneCorreccion && canCorrect && (
                  <Button onClick={handleStartCorrection} className="bg-amber-600 hover:bg-amber-700">
                    <AlertCircle className="h-4 w-4 mr-2" />
                    Crear Corrección
                  </Button>
                )}
              </DialogFooter>
            </div>
          )}

          {/* Edit Form */}
          {selectedLectura && isEditing && (
            <form onSubmit={handleSubmitEdit} className="space-y-4">
              <div className="bg-yellow-50 border border-yellow-200 p-3 rounded-lg text-sm text-yellow-800">
                <strong>Edición directa:</strong> Como la boleta aún no ha sido generada, puede modificar el valor de lectura directamente.
              </div>
              
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Valor de Lectura *
                </label>
                <Input
                  type="number"
                  step="0.01"
                  value={editLectura}
                  onChange={(e) => setEditLectura(e.target.value)}
                  required
                  autoFocus
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Observaciones
                </label>
                <Textarea
                  value={editNotas}
                  onChange={(e) => setEditNotas(e.target.value)}
                  placeholder="Observaciones opcionales"
                  rows={3}
                />
              </div>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setIsEditing(false)}>
                  Cancelar
                </Button>
                <Button
                  type="submit"
                  className="bg-blue-600 hover:bg-blue-700"
                  disabled={editMutation.isPending}
                >
                  {editMutation.isPending ? 'Guardando...' : 'Guardar Cambios'}
                </Button>
              </DialogFooter>
            </form>
          )}

          {/* Correction Form */}
          {selectedLectura && isCreatingCorrection && (
            <form onSubmit={handleSubmitCorrection} className="space-y-4">
              <div className="bg-blue-50 border border-blue-200 p-3 rounded-lg text-sm text-blue-800">
                <strong>Corrección post-boleta:</strong> La boleta ya fue generada. Esta corrección se aplicará como ajuste en el siguiente período de facturación.
              </div>

              <div className="bg-slate-50 p-3 rounded-md text-sm">
                <p className="text-slate-600">
                  <strong>Lectura actual:</strong> {selectedLectura.valorLectura.toLocaleString()}
                </p>
                <p className="text-slate-600">
                  <strong>Período:</strong> {formatPeriodo(selectedLectura.periodoAno, selectedLectura.periodoMes)}
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Valor Corregido *
                </label>
                <Input
                  type="number"
                  step="0.01"
                  value={correccionLectura}
                  onChange={(e) => setCorreccionLectura(e.target.value)}
                  required
                  autoFocus
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Motivo de la Corrección *
                </label>
                <Textarea
                  value={correccionMotivo}
                  onChange={(e) => setCorreccionMotivo(e.target.value)}
                  placeholder="Explique el motivo de la corrección (ej: error de digitación, lectura mal tomada, etc.)"
                  rows={3}
                  required
                />
              </div>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setIsCreatingCorrection(false)}>
                  Cancelar
                </Button>
                <Button
                  type="submit"
                  className="bg-amber-600 hover:bg-amber-700"
                  disabled={correctionMutation.isPending}
                >
                  {correctionMutation.isPending ? 'Registrando...' : 'Registrar Corrección'}
                </Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </AdminLayout>
  );
}
