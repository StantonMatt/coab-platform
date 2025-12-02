import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';

export function Toaster() {
  const { toasts } = useToast();

  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className={cn(
            'rounded-lg border p-4 shadow-lg transition-all',
            'animate-in slide-in-from-bottom-5 fade-in-0',
            toast.variant === 'destructive'
              ? 'border-red-200 bg-red-50 text-red-900'
              : 'border-gray-200 bg-white text-gray-900'
          )}
        >
          {toast.title && (
            <p className="font-semibold">{toast.title}</p>
          )}
          {toast.description && (
            <p className="text-sm opacity-90 mt-1">{toast.description}</p>
          )}
        </div>
      ))}
    </div>
  );
}

