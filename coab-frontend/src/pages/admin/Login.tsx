import { useState } from 'react';
import { useNavigate } from 'react-router';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import apiClient from '@/lib/api';

// Validation schema
const loginSchema = z.object({
  email: z.string().email('Email inválido'),
  password: z.string().min(1, 'Contraseña requerida'),
});

type LoginForm = z.infer<typeof loginSchema>;

export default function AdminLoginPage() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [loginError, setLoginError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
    setValue,
    clearErrors,
  } = useForm<LoginForm>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      email: '',
      password: '',
    },
  });

  const onSubmit = async (data: LoginForm) => {
    setLoginError(null);

    try {
      const response = await apiClient.post('/auth/admin/login', {
        email: data.email,
        password: data.password,
      });

      const { accessToken, refreshToken, user } = response.data;

      // Store admin tokens separately from customer tokens
      localStorage.setItem('admin_access_token', accessToken);
      localStorage.setItem('admin_refresh_token', refreshToken);
      localStorage.setItem('admin_user', JSON.stringify(user));

      toast({
        title: 'Inicio de sesión exitoso',
        description: `Bienvenido, ${user.nombre}`,
      });

      navigate('/admin/dashboard');
    } catch (error: any) {
      const message =
        error.response?.data?.error?.message || 'Error al iniciar sesión';
      setLoginError(message);
      toast({
        variant: 'destructive',
        title: 'Error',
        description: message,
      });
      // Clear password on error, keep email
      setValue('password', '');
    }
  };

  const handleInputChange = () => {
    if (loginError) {
      setLoginError(null);
    }
    clearErrors();
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-100 p-4">
      <Card className="w-full max-w-md shadow-lg">
        <CardHeader className="text-center space-y-2 pb-6">
          <div className="mx-auto w-16 h-16 bg-slate-800 rounded-xl flex items-center justify-center mb-2">
            <span className="text-2xl font-bold text-white">C</span>
          </div>
          <CardTitle className="text-2xl font-bold text-slate-800">
            Portal Administrativo
          </CardTitle>
          <p className="text-slate-600 text-sm">COAB - Sistema de Gestión</p>
        </CardHeader>

        <CardContent>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
            {/* Email */}
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                placeholder="admin@coab.cl"
                {...register('email')}
                onChange={(e) => {
                  register('email').onChange(e);
                  handleInputChange();
                }}
                className={`h-11 ${errors.email ? 'border-red-500' : ''}`}
                autoComplete="email"
              />
              {errors.email && (
                <p className="text-sm text-red-500">{errors.email.message}</p>
              )}
            </div>

            {/* Password */}
            <div className="space-y-2">
              <Label htmlFor="password">Contraseña</Label>
              <Input
                id="password"
                type="password"
                placeholder="••••••••"
                {...register('password')}
                onChange={(e) => {
                  register('password').onChange(e);
                  handleInputChange();
                }}
                className={`h-11 ${errors.password ? 'border-red-500' : ''}`}
                autoComplete="current-password"
              />
              {errors.password && (
                <p className="text-sm text-red-500">{errors.password.message}</p>
              )}
            </div>

            {/* Error Message */}
            {loginError && (
              <div
                className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded relative"
                role="alert"
              >
                <span className="block sm:inline">{loginError}</span>
              </div>
            )}

            {/* Submit Button */}
            <Button
              type="submit"
              className="w-full h-11 bg-slate-800 hover:bg-slate-700"
              disabled={isSubmitting}
            >
              {isSubmitting ? 'Iniciando sesión...' : 'Iniciar Sesión'}
            </Button>
          </form>

          {/* Back to customer portal link */}
          <div className="mt-6 text-center">
            <a
              href="/login"
              className="text-sm text-slate-500 hover:text-slate-700"
            >
              ← Volver al portal de clientes
            </a>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

