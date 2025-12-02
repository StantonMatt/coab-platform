import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import apiClient from '@/lib/api';
import { validarRUT, formatearRUT } from '@coab/utils';

// Validation schema using Chilean RUT validation
const loginSchema = z.object({
  rut: z
    .string()
    .min(1, 'RUT requerido')
    .refine(validarRUT, 'RUT inválido'),
  password: z.string().min(1, 'Contraseña requerida'),
});

type LoginForm = z.infer<typeof loginSchema>;

export default function LoginPage() {
  const [rutDisplay, setRutDisplay] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [loginError, setLoginError] = useState<string | null>(null);
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { toast } = useToast();

  // Pre-fill RUT from URL params (after password setup)
  const prefilledRut = searchParams.get('rut');

  const {
    register,
    handleSubmit,
    setValue,
    formState: { errors },
  } = useForm<LoginForm>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      rut: prefilledRut || '',
      password: '',
    },
    mode: 'onSubmit', // Only validate on submit, not on change
  });

  // Set initial display value if RUT is pre-filled
  useEffect(() => {
    if (prefilledRut) {
      setRutDisplay(formatearRUT(prefilledRut));
    }
  }, [prefilledRut]);

  // Check if already logged in
  useEffect(() => {
    const token = localStorage.getItem('access_token');
    if (token) {
      navigate('/dashboard');
    }
  }, [navigate]);

  const handleRutChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    // Remove all non-alphanumeric characters except K/k
    const cleanValue = value.replace(/[^0-9kK]/g, '').toUpperCase();
    const formatted = formatearRUT(cleanValue);
    setRutDisplay(formatted);
    // Store clean value for validation (without dots and dashes)
    setValue('rut', cleanValue, { shouldValidate: cleanValue.length > 0 });
    // Clear any login error when user types
    if (loginError) setLoginError(null);
  };

  const onSubmit = async (data: LoginForm) => {
    setIsLoading(true);
    setLoginError(null);
    try {
      const response = await apiClient.post('/auth/login', {
        rut: data.rut,
        password: data.password,
      });

      const { accessToken, refreshToken, user } = response.data;

      // Store tokens and user data
      localStorage.setItem('access_token', accessToken);
      localStorage.setItem('refresh_token', refreshToken);
      localStorage.setItem('user', JSON.stringify(user));

      toast({
        title: 'Bienvenido',
        description: `Hola, ${user.nombre?.split(' ')[0] || 'Cliente'}!`,
      });

      // Redirect to dashboard
      navigate('/dashboard');
    } catch (error: any) {
      const message =
        error.response?.data?.error?.message || 'Error al iniciar sesión';
      
      // Show error in form (more visible than toast)
      setLoginError(message);
      
      // Also show toast
      toast({
        title: 'Error',
        description: message,
        variant: 'destructive',
      });
      
      // Clear only password on error, keep RUT
      setValue('password', '');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-4 bg-gradient-to-br from-blue-50 to-blue-100">
      <Card className="w-full max-w-md shadow-xl">
        <CardHeader className="text-center pb-2">
          {/* Logo */}
          <div className="mx-auto w-16 h-16 bg-blue-600 rounded-xl flex items-center justify-center mb-4">
            <span className="text-2xl font-bold text-white">C</span>
          </div>
          <CardTitle className="text-2xl font-bold text-blue-600">
            Portal Clientes COAB
          </CardTitle>
          <p className="text-gray-600 text-sm mt-1">
            Sistema de Agua Potable Rural
          </p>
        </CardHeader>
        <CardContent className="pt-6">
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
            {/* RUT Input */}
            <div className="space-y-2">
              <Label htmlFor="rut" className="text-gray-700">
                RUT
              </Label>
              <Input
                id="rut"
                type="text"
                inputMode="numeric"
                placeholder="12.345.678-9"
                value={rutDisplay}
                onChange={handleRutChange}
                className="h-12 text-lg"
                autoComplete="username"
                aria-describedby={errors.rut ? 'rut-error' : undefined}
              />
              {errors.rut && (
                <p id="rut-error" className="text-sm text-red-600">
                  {errors.rut.message}
                </p>
              )}
            </div>

            {/* Password Input */}
            <div className="space-y-2">
              <Label htmlFor="password" className="text-gray-700">
                Contraseña
              </Label>
              <Input
                id="password"
                type="password"
                {...register('password', {
                  onChange: () => {
                    if (loginError) setLoginError(null);
                  },
                })}
                className="h-12 text-lg"
                autoComplete="current-password"
                aria-describedby={errors.password ? 'password-error' : undefined}
              />
              {errors.password && (
                <p id="password-error" className="text-sm text-red-600">
                  {errors.password.message}
                </p>
              )}
            </div>

            {/* Forgot Password Link */}
            <div className="text-right">
              <a
                href="/recuperar"
                className="text-sm text-blue-600 hover:underline"
              >
                ¿Olvidó su contraseña?
              </a>
            </div>

            {/* Login Error Message */}
            {loginError && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-lg">
                <p className="text-sm text-red-700 text-center">
                  {loginError}
                </p>
              </div>
            )}

            {/* Submit Button - 44px minimum for mobile touch targets */}
            <Button
              type="submit"
              className="w-full h-12 text-lg bg-blue-600 hover:bg-blue-700"
              disabled={isLoading}
            >
              {isLoading ? (
                <span className="flex items-center gap-2">
                  <svg
                    className="animate-spin h-5 w-5"
                    xmlns="http://www.w3.org/2000/svg"
                    fill="none"
                    viewBox="0 0 24 24"
                  >
                    <circle
                      className="opacity-25"
                      cx="12"
                      cy="12"
                      r="10"
                      stroke="currentColor"
                      strokeWidth="4"
                    />
                    <path
                      className="opacity-75"
                      fill="currentColor"
                      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                    />
                  </svg>
                  Ingresando...
                </span>
              ) : (
                'Ingresar'
              )}
            </Button>
          </form>

          {/* Footer */}
          <p className="text-center text-xs text-gray-500 mt-6">
            Cooperativa de Agua Potable de Batuco
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

