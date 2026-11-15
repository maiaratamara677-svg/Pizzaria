import type {
  DeliveryDriver,
  Order,
  OrderChannel,
  OrderServiceType,
  OrderStage,
  PaymentMethod,
  PaymentStatus,
} from '../types.ts';

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

export const ORDER_CHANNEL_META: Record<
  OrderChannel,
  {
    label: string;
    shortLabel: string;
    textColor: string;
    accentColor: string;
  }
> = {
  whatsapp: {
    label: 'WhatsApp',
    shortLabel: 'WhatsApp',
    textColor: 'text-emerald-700',
    accentColor: '#047857',
  },
  ifood: {
    label: 'iFood',
    shortLabel: 'iFood',
    textColor: 'text-red-700',
    accentColor: '#B91C1C',
  },
  '99food': {
    label: '99Food',
    shortLabel: '99Food',
    textColor: 'text-amber-700',
    accentColor: '#B45309',
  },
  pdv: {
    label: 'PDV / Balcão',
    shortLabel: 'PDV',
    textColor: 'text-stone-800',
    accentColor: '#44403C',
  },
};

export function getOrderChannel(channel?: OrderChannel): OrderChannel {
  if (channel === 'ifood' || channel === '99food' || channel === 'pdv') return channel;
  return 'whatsapp';
}

export const ORDER_SERVICE_TYPE_META: Record<
  OrderServiceType,
  {
    label: string;
    shortLabel: string;
    textColor: string;
  }
> = {
  entrega: {
    label: 'Entrega',
    shortLabel: 'Entrega',
    textColor: 'text-sky-700',
  },
  retirada: {
    label: 'Retirada no Balcão',
    shortLabel: 'Retirada',
    textColor: 'text-violet-700',
  },
  mesa: {
    label: 'Comer no Local / Mesa',
    shortLabel: 'Mesa',
    textColor: 'text-orange-700',
  },
};

export function getOrderServiceType(order: Pick<Order, 'serviceType' | 'deliveryAddress'>): OrderServiceType {
  if (order.serviceType === 'retirada' || order.serviceType === 'mesa' || order.serviceType === 'entrega') {
    return order.serviceType;
  }
  if (/retirada|balc[aã]o/i.test(order.deliveryAddress)) return 'retirada';
  if (/^mesa\b/i.test(order.deliveryAddress)) return 'mesa';
  return 'entrega';
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
    case 'ifood_online':
      return 'Pago via iFood';
    case '99food_online':
      return 'Pago via 99Food';
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

export function buildDriverDispatchMessage(
  order: Order,
  driver: Pick<DeliveryDriver, 'name'>,
  pizzeriaName: string
): string {
  const payStatus = formatPaymentStatus(order.payment.status).label;
  const payMethod = formatPaymentMethod(order.payment.method);
  const itemsText = order.items
    .map(
      (i) =>
        `• ${i.quantity}x ${i.name}${i.size !== 'unico' ? ` (${i.size})` : ''}${
          i.crust && i.crust !== 'Tradicional' ? ` - Borda ${i.crust}` : ''
        }`
    )
    .join('\n');

  const lines = [
    `*${pizzeriaName} — Nova Entrega ${order.code}*`,
    `Entregador: ${driver.name}`,
    ``,
    `*Cliente:* ${order.customerName}`,
    `*Telefone:* ${order.customerPhone}`,
    `*Endereço:* ${order.deliveryAddress}`,
    ``,
    `*Itens:*`,
    itemsText,
    ``,
    `*Total:* ${formatBRL(order.total)}`,
    `*Pagamento:* ${payMethod} (${payStatus})`,
  ];

  if (order.payment.method === 'dinheiro' && order.payment.changeFor) {
    lines.push(
      `*Troco para:* ${formatBRL(order.payment.changeFor)} (Levar troco de ${formatBRL(
        order.payment.changeAmount ?? Math.max(0, order.payment.changeFor - order.total)
      )})`
    );
  }
  if (order.pickupCode) {
    lines.push(`*Código de coleta:* ${order.pickupCode}`);
  }
  if (order.orderNotes) {
    lines.push(`*Obs:* ${order.orderNotes}`);
  }

  return lines.join('\n');
}

export function buildWhatsAppLink(phone: string, text: string): string {
  let digits = phone.replace(/\D/g, '');
  if (digits.length === 10 || digits.length === 11) {
    digits = `55${digits}`;
  }
  return `https://wa.me/${digits}?text=${encodeURIComponent(text)}`;
}
