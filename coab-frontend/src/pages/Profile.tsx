import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import apiClient from '@/lib/api';
import VerificationModal from '@/components/VerificationModal';
import {
  ArrowLeft,
  Mail,
  Phone,
  Lock,
  CreditCard,
  Trash2,
  Eye,
  EyeOff,
  Check,
  X,
  Loader2,
  Edit2,
} from 'lucide-react';

// ============================================================================
// Types
// ============================================================================

interface Profile {
  id: string;
  rut: string;
  numeroCliente: string;
  nombre: string;
  email: string | null;
  telefono: string | null;
  estadoCuenta: string;
  direccion: string | null;
}

interface SavedCard {
  id: string;
  ultimosDigitos: string | null;
  tipoTarjeta: string | null;
}

// ============================================================================
// Schemas
// ============================================================================

const changePasswordSchema = z
  .object({
    contrasenaActual: z.string().min(1, 'Contraseña actual requerida'),
    nuevaContrasena: z
      .string()
      .min(8, 'Mínimo 8 caracteres')
      .regex(/[A-Z]/, 'Debe incluir una mayúscula')
      .regex(/[a-z]/, 'Debe incluir una minúscula')
      .regex(/[0-9]/, 'Debe incluir un número'),
    confirmarContrasena: z.string().min(1, 'Confirmación requerida'),
  })
  .refine((data) => data.nuevaContrasena === data.confirmarContrasena, {
    message: 'Las contraseñas no coinciden',
    path: ['confirmarContrasena'],
  });

type ChangePasswordForm = z.infer<typeof changePasswordSchema>;

// ============================================================================
// Component
// ============================================================================

export default function ProfilePage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  // Editing state for contact info
  const [isEditingEmail, setIsEditingEmail] = useState(false);
  const [isEditingPhone, setIsEditingPhone] = useState(false);
  const [newEmail, setNewEmail] = useState('');
  const [newPhone, setNewPhone] = useState('');

  // Verification modal state
  const [verificationModalOpen, setVerificationModalOpen] = useState(false);
  const [verificationType, setVerificationType] = useState<'email' | 'telefono'>('email');
  const [verificationValue, setVerificationValue] = useState('');
  const [verificationError, setVerificationError] = useState<string | null>(null);

  // Password visibility toggles
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  // Check authentication
  useEffect(() => {
    const token = localStorage.getItem('access_token');
    if (!token) {
      navigate('/login');
    }
  }, [navigate]);

  // =========================================================================
  // Queries
  // =========================================================================

  const { data: profile, isLoading: profileLoading } = useQuery({
    queryKey: ['profile'],
    queryFn: async () => {
      const res = await apiClient.get('/clientes/me');
      return res.data as Profile;
    },
    enabled: !!localStorage.getItem('access_token'),
  });

  const { data: cardsData, isLoading: cardsLoading } = useQuery({
    queryKey: ['saved-cards'],
    queryFn: async () => {
      const res = await apiClient.get('/pagos/config');
      const tarjetas = res.data?.transbank?.tarjetas || [];
      return tarjetas.map(
        (t: {
          id: string;
          ultimosDigitos: string | null;
          tipoTarjeta: string | null;
        }) => ({
          id: t.id,
          ultimosDigitos: t.ultimosDigitos,
          tipoTarjeta: t.tipoTarjeta,
        })
      ) as SavedCard[];
    },
    enabled: !!localStorage.getItem('access_token'),
  });

  // =========================================================================
  // Forms
  // =========================================================================

  const passwordForm = useForm<ChangePasswordForm>({
    resolver: zodResolver(changePasswordSchema),
    defaultValues: {
      contrasenaActual: '',
      nuevaContrasena: '',
      confirmarContrasena: '',
    },
  });

  // =========================================================================
  // Mutations
  // =========================================================================

  // Initiate verification (send code)
  const initiateVerificationMutation = useMutation({
    mutationFn: async (data: { tipo: 'email' | 'telefono'; nuevoValor: string }) => {
      const res = await apiClient.post('/clientes/me/verificar-contacto', data);
      return res.data;
    },
    onSuccess: (_data, variables) => {
      setVerificationType(variables.tipo);
      setVerificationValue(variables.nuevoValor);
      setVerificationError(null);
      setVerificationModalOpen(true);
      toast({
        title: 'Código enviado',
        description:
          variables.tipo === 'email'
            ? `Revisa tu correo ${variables.nuevoValor}`
            : `Código enviado por SMS a ${variables.nuevoValor}`,
      });
    },
    onError: (error: any) => {
      toast({
        title: 'Error',
        description:
          error.response?.data?.error?.message || 'Error al enviar código',
        variant: 'destructive',
      });
    },
  });

  // Confirm verification (submit code)
  const confirmVerificationMutation = useMutation({
    mutationFn: async (data: { tipo: 'email' | 'telefono'; codigo: string }) => {
      const res = await apiClient.post('/clientes/me/confirmar-contacto', data);
      return res.data;
    },
    onSuccess: () => {
      setVerificationModalOpen(false);
      setIsEditingEmail(false);
      setIsEditingPhone(false);
      setNewEmail('');
      setNewPhone('');
      queryClient.invalidateQueries({ queryKey: ['profile'] });
      toast({
        title: 'Actualizado',
        description:
          verificationType === 'email'
            ? 'Correo electrónico actualizado exitosamente.'
            : 'Teléfono actualizado exitosamente.',
      });
    },
    onError: (error: any) => {
      setVerificationError(
        error.response?.data?.error?.message || 'Código incorrecto'
      );
    },
  });

  const changePasswordMutation = useMutation({
    mutationFn: async (data: ChangePasswordForm) => {
      const res = await apiClient.post('/clientes/me/cambiar-contrasena', data);
      return res.data;
    },
    onSuccess: () => {
      passwordForm.reset();
      toast({
        title: 'Contraseña actualizada',
        description: 'Tu contraseña ha sido cambiada exitosamente.',
      });
    },
    onError: (error: any) => {
      const errorCode = error.response?.data?.error?.code;
      if (errorCode === 'INVALID_PASSWORD') {
        passwordForm.setError('contrasenaActual', {
          message: 'Contraseña actual incorrecta',
        });
      } else {
        toast({
          title: 'Error',
          description:
            error.response?.data?.error?.message ||
            'Error al cambiar contraseña',
          variant: 'destructive',
        });
      }
    },
  });

  const deleteCardMutation = useMutation({
    mutationFn: async (cardId: string) => {
      const res = await apiClient.delete(`/pagos/transbank/eliminar/${cardId}`);
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['saved-cards'] });
      queryClient.invalidateQueries({ queryKey: ['autopago'] });
      toast({
        title: 'Tarjeta eliminada',
        description: 'La tarjeta ha sido eliminada de tu cuenta.',
      });
    },
    onError: (error: any) => {
      toast({
        title: 'Error',
        description:
          error.response?.data?.error?.message || 'Error al eliminar tarjeta',
        variant: 'destructive',
      });
    },
  });

  // =========================================================================
  // Handlers
  // =========================================================================

  // Start editing email
  const handleEditEmail = () => {
    setIsEditingEmail(true);
    setNewEmail(profile?.email || '');
  };

  // Start editing phone
  const handleEditPhone = () => {
    setIsEditingPhone(true);
    // Strip +56 prefix for display
    let phone = profile?.telefono || '';
    if (phone.startsWith('+56')) {
      phone = phone.slice(3);
    } else if (phone.startsWith('56') && phone.length > 9) {
      phone = phone.slice(2);
    }
    setNewPhone(phone);
  };

  // Send verification code for email
  const handleSendEmailCode = () => {
    if (!newEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(newEmail)) {
      toast({
        title: 'Error',
        description: 'Ingresa un correo electrónico válido',
        variant: 'destructive',
      });
      return;
    }
    initiateVerificationMutation.mutate({
      tipo: 'email',
      nuevoValor: newEmail.toLowerCase().trim(),
    });
  };

  // Send verification code for phone
  const handleSendPhoneCode = () => {
    if (!newPhone || !/^[0-9]{9}$/.test(newPhone)) {
      toast({
        title: 'Error',
        description: 'Ingresa un número de 9 dígitos',
        variant: 'destructive',
      });
      return;
    }
    initiateVerificationMutation.mutate({
      tipo: 'telefono',
      nuevoValor: `+56${newPhone}`,
    });
  };

  // Confirm verification code
  const handleConfirmCode = async (codigo: string) => {
    confirmVerificationMutation.mutate({
      tipo: verificationType,
      codigo,
    });
  };

  // Resend verification code
  const handleResendCode = async () => {
    setVerificationError(null);
    initiateVerificationMutation.mutate({
      tipo: verificationType,
      nuevoValor: verificationValue,
    });
  };

  const handlePasswordSubmit = (data: ChangePasswordForm) => {
    changePasswordMutation.mutate(data);
  };

  const handleDeleteCard = (cardId: string) => {
    if (window.confirm('¿Estás seguro de eliminar esta tarjeta?')) {
      deleteCardMutation.mutate(cardId);
    }
  };

  // Password validation indicators
  const newPassword = passwordForm.watch('nuevaContrasena');
  const passwordValidations = {
    minLength: newPassword?.length >= 8,
    hasUppercase: /[A-Z]/.test(newPassword || ''),
    hasLowercase: /[a-z]/.test(newPassword || ''),
    hasNumber: /[0-9]/.test(newPassword || ''),
  };

  // Format phone for display
  const formatPhoneDisplay = (phone: string | null | undefined) => {
    if (!phone) return 'No configurado';
    if (phone.startsWith('+56')) return phone;
    if (phone.startsWith('56') && phone.length > 9) return `+${phone}`;
    return `+56${phone}`;
  };

  if (profileLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b">
        <div className="max-w-2xl mx-auto px-4 py-4 flex items-center gap-4">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => navigate('/dashboard')}
          >
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <h1 className="text-xl font-semibold">Mi Perfil</h1>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 py-6 space-y-6">
        {/* Contact Information Section */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Mail className="h-5 w-5 text-blue-600" />
              Información de Contacto
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Email Field */}
            <div className="space-y-2">
              <Label>Correo Electrónico</Label>
              {isEditingEmail ? (
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                    <Input
                      type="email"
                      placeholder="correo@ejemplo.com"
                      className="pl-10"
                      value={newEmail}
                      onChange={(e) => setNewEmail(e.target.value)}
                    />
                  </div>
                  <Button
                    onClick={handleSendEmailCode}
                    disabled={initiateVerificationMutation.isPending}
                  >
                    {initiateVerificationMutation.isPending ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      'Enviar Código'
                    )}
                  </Button>
                  <Button
                    variant="ghost"
                    onClick={() => {
                      setIsEditingEmail(false);
                      setNewEmail('');
                    }}
                  >
                    Cancelar
                  </Button>
                </div>
              ) : (
                <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                  <div className="flex items-center gap-3">
                    <Mail className="h-5 w-5 text-gray-400" />
                    <span className={profile?.email ? '' : 'text-gray-400 italic'}>
                      {profile?.email || 'No configurado'}
                    </span>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleEditEmail}
                    className="text-blue-600 hover:text-blue-700"
                  >
                    <Edit2 className="h-4 w-4 mr-1" />
                    Editar
                  </Button>
                </div>
              )}
            </div>

            {/* Phone Field */}
            <div className="space-y-2">
              <Label>Teléfono</Label>
              {isEditingPhone ? (
                <div className="flex gap-2">
                  <div className="flex flex-1">
                    <div className="flex items-center px-3 bg-gray-100 border border-r-0 rounded-l-md text-gray-600 text-sm font-medium">
                      <Phone className="h-4 w-4 mr-2 text-gray-400" />
                      +56
                    </div>
                    <Input
                      type="tel"
                      inputMode="numeric"
                      placeholder="912345678"
                      maxLength={9}
                      className="rounded-l-none"
                      value={newPhone}
                      onChange={(e) =>
                        setNewPhone(e.target.value.replace(/\D/g, ''))
                      }
                    />
                  </div>
                  <Button
                    onClick={handleSendPhoneCode}
                    disabled={initiateVerificationMutation.isPending}
                  >
                    {initiateVerificationMutation.isPending ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      'Enviar Código'
                    )}
                  </Button>
                  <Button
                    variant="ghost"
                    onClick={() => {
                      setIsEditingPhone(false);
                      setNewPhone('');
                    }}
                  >
                    Cancelar
                  </Button>
                </div>
              ) : (
                <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                  <div className="flex items-center gap-3">
                    <Phone className="h-5 w-5 text-gray-400" />
                    <span className={profile?.telefono ? '' : 'text-gray-400 italic'}>
                      {formatPhoneDisplay(profile?.telefono)}
                    </span>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleEditPhone}
                    className="text-blue-600 hover:text-blue-700"
                  >
                    <Edit2 className="h-4 w-4 mr-1" />
                    Editar
                  </Button>
                </div>
              )}
            </div>

            <p className="text-xs text-gray-500 mt-2">
              Los cambios de correo o teléfono requieren verificación con un código enviado al nuevo contacto.
            </p>
          </CardContent>
        </Card>

        {/* Change Password Section */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Lock className="h-5 w-5 text-blue-600" />
              Cambiar Contraseña
            </CardTitle>
          </CardHeader>
          <CardContent>
            <form
              onSubmit={passwordForm.handleSubmit(handlePasswordSubmit)}
              className="space-y-4"
            >
              {/* Current Password */}
              <div className="space-y-2">
                <Label htmlFor="contrasenaActual">Contraseña Actual</Label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                  <Input
                    id="contrasenaActual"
                    type={showCurrentPassword ? 'text' : 'password'}
                    className="pl-10 pr-10"
                    {...passwordForm.register('contrasenaActual')}
                  />
                  <button
                    type="button"
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                    onClick={() => setShowCurrentPassword(!showCurrentPassword)}
                  >
                    {showCurrentPassword ? (
                      <EyeOff className="h-4 w-4" />
                    ) : (
                      <Eye className="h-4 w-4" />
                    )}
                  </button>
                </div>
                {passwordForm.formState.errors.contrasenaActual && (
                  <p className="text-sm text-red-500">
                    {passwordForm.formState.errors.contrasenaActual.message}
                  </p>
                )}
              </div>

              {/* New Password */}
              <div className="space-y-2">
                <Label htmlFor="nuevaContrasena">Nueva Contraseña</Label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                  <Input
                    id="nuevaContrasena"
                    type={showNewPassword ? 'text' : 'password'}
                    className="pl-10 pr-10"
                    {...passwordForm.register('nuevaContrasena')}
                  />
                  <button
                    type="button"
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                    onClick={() => setShowNewPassword(!showNewPassword)}
                  >
                    {showNewPassword ? (
                      <EyeOff className="h-4 w-4" />
                    ) : (
                      <Eye className="h-4 w-4" />
                    )}
                  </button>
                </div>
                {passwordForm.formState.errors.nuevaContrasena && (
                  <p className="text-sm text-red-500">
                    {passwordForm.formState.errors.nuevaContrasena.message}
                  </p>
                )}

                {/* Password Requirements */}
                <div className="space-y-1 text-sm">
                  <div
                    className={`flex items-center gap-2 ${passwordValidations.minLength ? 'text-green-600' : 'text-gray-500'}`}
                  >
                    {passwordValidations.minLength ? (
                      <Check className="h-3 w-3" />
                    ) : (
                      <X className="h-3 w-3" />
                    )}
                    Mínimo 8 caracteres
                  </div>
                  <div
                    className={`flex items-center gap-2 ${passwordValidations.hasUppercase ? 'text-green-600' : 'text-gray-500'}`}
                  >
                    {passwordValidations.hasUppercase ? (
                      <Check className="h-3 w-3" />
                    ) : (
                      <X className="h-3 w-3" />
                    )}
                    Una letra mayúscula
                  </div>
                  <div
                    className={`flex items-center gap-2 ${passwordValidations.hasLowercase ? 'text-green-600' : 'text-gray-500'}`}
                  >
                    {passwordValidations.hasLowercase ? (
                      <Check className="h-3 w-3" />
                    ) : (
                      <X className="h-3 w-3" />
                    )}
                    Una letra minúscula
                  </div>
                  <div
                    className={`flex items-center gap-2 ${passwordValidations.hasNumber ? 'text-green-600' : 'text-gray-500'}`}
                  >
                    {passwordValidations.hasNumber ? (
                      <Check className="h-3 w-3" />
                    ) : (
                      <X className="h-3 w-3" />
                    )}
                    Un número
                  </div>
                </div>
              </div>

              {/* Confirm Password */}
              <div className="space-y-2">
                <Label htmlFor="confirmarContrasena">
                  Confirmar Nueva Contraseña
                </Label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                  <Input
                    id="confirmarContrasena"
                    type={showConfirmPassword ? 'text' : 'password'}
                    className="pl-10 pr-10"
                    {...passwordForm.register('confirmarContrasena')}
                  />
                  <button
                    type="button"
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                    onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                  >
                    {showConfirmPassword ? (
                      <EyeOff className="h-4 w-4" />
                    ) : (
                      <Eye className="h-4 w-4" />
                    )}
                  </button>
                </div>
                {passwordForm.formState.errors.confirmarContrasena && (
                  <p className="text-sm text-red-500">
                    {passwordForm.formState.errors.confirmarContrasena.message}
                  </p>
                )}
              </div>

              <Button
                type="submit"
                className="w-full"
                disabled={changePasswordMutation.isPending}
              >
                {changePasswordMutation.isPending ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Cambiando...
                  </>
                ) : (
                  'Cambiar Contraseña'
                )}
              </Button>
            </form>
          </CardContent>
        </Card>

        {/* Saved Cards Section */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <CreditCard className="h-5 w-5 text-blue-600" />
              Tarjetas Guardadas
            </CardTitle>
          </CardHeader>
          <CardContent>
            {cardsLoading ? (
              <div className="flex justify-center py-4">
                <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
              </div>
            ) : !cardsData || cardsData.length === 0 ? (
              <p className="text-gray-500 text-center py-4">
                No tienes tarjetas guardadas.
              </p>
            ) : (
              <div className="space-y-3">
                {cardsData.map((card) => (
                  <div
                    key={card.id}
                    className="flex items-center justify-between p-3 bg-gray-50 rounded-lg"
                  >
                    <div className="flex items-center gap-3">
                      <CreditCard className="h-5 w-5 text-gray-600" />
                      <span className="font-medium">
                        {card.tipoTarjeta?.toUpperCase() || 'Tarjeta'} ****
                        {card.ultimosDigitos}
                      </span>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-red-600 hover:text-red-700 hover:bg-red-50"
                      onClick={() => handleDeleteCard(card.id)}
                      disabled={deleteCardMutation.isPending}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </main>

      {/* Verification Modal */}
      <VerificationModal
        isOpen={verificationModalOpen}
        onClose={() => setVerificationModalOpen(false)}
        tipo={verificationType}
        nuevoValor={verificationValue}
        onConfirm={handleConfirmCode}
        onResend={handleResendCode}
        isLoading={confirmVerificationMutation.isPending}
        error={verificationError}
      />
    </div>
  );
}
