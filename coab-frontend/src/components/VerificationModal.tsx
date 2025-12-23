import { useState, useEffect, useRef } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Loader2, Mail, Phone, Clock } from 'lucide-react';

interface VerificationModalProps {
  isOpen: boolean;
  onClose: () => void;
  tipo: 'email' | 'telefono';
  nuevoValor: string;
  onConfirm: (codigo: string) => Promise<void>;
  onResend: () => Promise<void>;
  isLoading: boolean;
  error: string | null;
}

export default function VerificationModal({
  isOpen,
  onClose,
  tipo,
  nuevoValor,
  onConfirm,
  onResend,
  isLoading,
  error,
}: VerificationModalProps) {
  // 6-digit code input state
  const [digits, setDigits] = useState<string[]>(['', '', '', '', '', '']);
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

  // Timer for expiration (10 minutes)
  const [timeLeft, setTimeLeft] = useState(600); // 10 minutes in seconds

  // Resend cooldown (60 seconds)
  const [resendCooldown, setResendCooldown] = useState(0);

  // Reset state when modal opens
  useEffect(() => {
    if (isOpen) {
      setDigits(['', '', '', '', '', '']);
      setTimeLeft(600);
      setResendCooldown(60); // Start with 60s cooldown on initial open
      // Focus first input after modal animation
      setTimeout(() => {
        inputRefs.current[0]?.focus();
      }, 100);
    }
  }, [isOpen]);

  // Countdown timer for expiration
  useEffect(() => {
    if (!isOpen || timeLeft <= 0) return;

    const timer = setInterval(() => {
      setTimeLeft((prev) => prev - 1);
    }, 1000);

    return () => clearInterval(timer);
  }, [isOpen, timeLeft]);

  // Resend cooldown timer
  useEffect(() => {
    if (resendCooldown <= 0) return;

    const timer = setInterval(() => {
      setResendCooldown((prev) => prev - 1);
    }, 1000);

    return () => clearInterval(timer);
  }, [resendCooldown]);

  // Format time as mm:ss
  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  // Handle digit input
  const handleDigitChange = (index: number, value: string) => {
    // Only allow numeric input
    if (value && !/^\d$/.test(value)) return;

    const newDigits = [...digits];
    newDigits[index] = value;
    setDigits(newDigits);

    // Auto-advance to next input
    if (value && index < 5) {
      inputRefs.current[index + 1]?.focus();
    }

    // Auto-submit when all digits are entered
    if (value && index === 5) {
      const code = [...newDigits.slice(0, 5), value].join('');
      if (code.length === 6) {
        onConfirm(code);
      }
    }
  };

  // Handle backspace
  const handleKeyDown = (index: number, e: React.KeyboardEvent) => {
    if (e.key === 'Backspace' && !digits[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }
  };

  // Handle paste
  const handlePaste = (e: React.ClipboardEvent) => {
    e.preventDefault();
    const pastedData = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6);
    if (pastedData.length === 6) {
      const newDigits = pastedData.split('');
      setDigits(newDigits);
      inputRefs.current[5]?.focus();
      onConfirm(pastedData);
    }
  };

  // Handle resend
  const handleResend = async () => {
    await onResend();
    setDigits(['', '', '', '', '', '']);
    setTimeLeft(600);
    setResendCooldown(60);
    inputRefs.current[0]?.focus();
  };

  // Handle manual submit
  const handleSubmit = () => {
    const code = digits.join('');
    if (code.length === 6) {
      onConfirm(code);
    }
  };

  const isCodeComplete = digits.every((d) => d !== '');
  const isExpired = timeLeft <= 0;

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {tipo === 'email' ? (
              <Mail className="h-5 w-5 text-blue-600" />
            ) : (
              <Phone className="h-5 w-5 text-blue-600" />
            )}
            Verificar {tipo === 'email' ? 'Correo' : 'Teléfono'}
          </DialogTitle>
          <DialogDescription>
            Ingresa el código de 6 dígitos enviado a{' '}
            <span className="font-medium text-gray-900">{nuevoValor}</span>
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* Code Input */}
          <div className="flex justify-center gap-2" onPaste={handlePaste}>
            {digits.map((digit, index) => (
              <Input
                key={index}
                ref={(el) => (inputRefs.current[index] = el)}
                type="text"
                inputMode="numeric"
                maxLength={1}
                value={digit}
                onChange={(e) => handleDigitChange(index, e.target.value)}
                onKeyDown={(e) => handleKeyDown(index, e)}
                className="w-12 h-14 text-center text-2xl font-semibold"
                disabled={isLoading || isExpired}
              />
            ))}
          </div>

          {/* Timer */}
          <div className="flex items-center justify-center gap-2 text-sm">
            <Clock className="h-4 w-4 text-gray-500" />
            {isExpired ? (
              <span className="text-red-600">Código expirado</span>
            ) : (
              <span className="text-gray-600">
                Expira en <span className="font-medium">{formatTime(timeLeft)}</span>
              </span>
            )}
          </div>

          {/* Error Message */}
          {error && (
            <div className="text-center text-sm text-red-600 bg-red-50 p-3 rounded-lg">
              {error}
            </div>
          )}

          {/* Submit Button */}
          <Button
            onClick={handleSubmit}
            disabled={!isCodeComplete || isLoading || isExpired}
            className="w-full"
          >
            {isLoading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Verificando...
              </>
            ) : (
              'Verificar'
            )}
          </Button>

          {/* Resend Button */}
          <div className="text-center">
            <button
              type="button"
              onClick={handleResend}
              disabled={resendCooldown > 0 || isLoading}
              className="text-sm text-blue-600 hover:text-blue-800 disabled:text-gray-400 disabled:cursor-not-allowed"
            >
              {resendCooldown > 0
                ? `Reenviar código en ${resendCooldown}s`
                : '¿No recibiste el código? Reenviar'}
            </button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

