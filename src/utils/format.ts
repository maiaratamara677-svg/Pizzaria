import type { OrderStage, PaymentMethod, PaymentStatus } from '../types.ts';

export function formatBRL(value: number): string {
  return value.toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  });
}

export function formatTime(iso: string): string {
  try {
    return new Date(iso).toLocaleTimeString('pt-BR', {
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return '--:--';
  }
}

export function formatDateTime(iso: string): string {
  try {
    return new Date(iso).toLocaleString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return '--';
  }
}

export const ORDER_STAGE_META: Record<
  OrderStage,
  {
    label: string;
    shortLabel: string;
    stepIndex: number;
    textColor: string;
    bgTint: string;
    borderTint: string;
  }
> = {
  recebido: {
    label: 'Pedido Recebido',
    shortLabel: 'Recebido',
    stepIndex: 0,
    textColor: 'text-slate-700',
    bgTint: 'bg-slate-100',
    borderTint: 'border-slate-200',
  },
  em_preparo: {
    label: 'Em Preparo',
    shortLabel: 'Preparo',
    stepIndex: 1,
    textColor: 'text-amber-700',
    bgTint: 'bg-amber-50',
    borderTint: 'border-amber-200',
  },
  no_forno: {
    label: 'No Forno a Lenha',
    shortLabel: 'No Forno',
    stepIndex: 2,
    textColor: 'text-orange-700',
    bgTint: 'bg-orange-50',
    borderTint: 'border-orange-200',
  },
  saiu_entrega: {
    label: 'Saiu para Entrega',
    shortLabel: 'Em Rota',
    stepIndex: 3,
    textColor: 'text-blue-700',
    bgTint: 'bg-blue-50',
    borderTint: 'border-blue-200',
  },
  entregue: {
    label: 'Entregue',
    shortLabel: 'Entregue',
    stepIndex: 4,
    textColor: 'text-emerald-700',
    bgTint: 'bg-emerald-50',
    borderTint: 'border-emerald-200',
  },
  cancelado: {
    label: 'Cancelado',
    shortLabel: 'Cancelado',
    stepIndex: -1,
    textColor: 'text-red-700',
    bgTint: 'bg-red-50',
    borderTint: 'border-red-200',
  },
};

export function formatPaymentMethod(method: PaymentMethod): string {
  switch (method) {
    case 'pix':
      return 'PIX Instantâneo';
    case 'cartao_online':
      return 'Cartão Online';
    case 'cartao_entrega':
      return 'Cartão na Entrega';
    case 'dinheiro':
      return 'Dinheiro na Entrega';
  }
}

export function formatPaymentStatus(status: PaymentStatus): {
  label: string;
  colorClass: string;
} {
  switch (status) {
    case 'pago':
      return { label: 'Pago', colorClass: 'text-emerald-700' };
    case 'aguardando':
      return { label: 'Aguardando Pagamento', colorClass: 'text-amber-700' };
    case 'pagamento_na_entrega':
      return { label: 'Pagar na Entrega', colorClass: 'text-slate-600' };
  }
}
