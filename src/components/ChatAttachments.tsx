import React, { useState } from 'react';
import {
  Check,
  CheckCircle2,
  ChefHat,
  Clock,
  Copy,
  CreditCard,
  Flame,
  MapPin,
  PackageCheck,
  Pizza,
  QrCode,
  Truck,
} from 'lucide-react';
import type { MessageAttachment, Order, OrderStage } from '../types.ts';
import { formatBRL, formatPaymentMethod, formatTime, ORDER_STAGE_META } from '../utils/format.ts';
import { PixQrSvg } from './PixQrSvg.tsx';

interface ChatAttachmentRendererProps {
  attachment: MessageAttachment;
  orders: Order[];
  onConfirmPayment: (orderId: string) => Promise<void>;
  onQuickOrderItem: (text: string) => void;
}

const TRACKING_STEPS: { stage: OrderStage; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { stage: 'recebido', label: 'Recebido', icon: Clock },
  { stage: 'em_preparo', label: 'Preparo', icon: ChefHat },
  { stage: 'no_forno', label: 'Forno', icon: Flame },
  { stage: 'saiu_entrega', label: 'Entrega', icon: Truck },
  { stage: 'entregue', label: 'Entregue', icon: PackageCheck },
];

export const ChatAttachmentRenderer: React.FC<ChatAttachmentRendererProps> = ({
  attachment,
  orders,
  onConfirmPayment,
  onQuickOrderItem,
}) => {
  const [copied, setCopied] = useState(false);
  const [paying, setPaying] = useState(false);

  if (attachment.type === 'menu_highlight') {
    return (
      <div className="mt-2.5 border-t border-slate-200/80 pt-2.5 space-y-2">
        <div className="text-[11px] font-semibold text-slate-500">
          Destaques do Cardápio
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {attachment.items.map((item) => (
            <div
              key={item.id}
              className="bg-slate-50 border border-slate-200 rounded-lg overflow-hidden flex flex-col"
            >
              {item.imageUrl ? (
                <img
                  src={item.imageUrl}
                  alt={item.name}
                  referrerPolicy="no-referrer"
                  className="w-full h-24 object-cover"
                />
              ) : (
                <div className="w-full h-20 bg-slate-100 flex items-center justify-center text-slate-400">
                  <Pizza className="w-6 h-6" />
                </div>
              )}
              <div className="p-2.5 flex-1 flex flex-col justify-between gap-2">
                <div>
                  <div className="text-xs font-semibold text-slate-900 leading-snug">
                    {item.name}
                  </div>
                  <div className="text-[11px] text-slate-500 line-clamp-2 mt-0.5">
                    {item.description}
                  </div>
                </div>
                <div className="flex items-center justify-between gap-2 pt-1 border-t border-slate-200/70">
                  <span className="text-xs font-mono font-semibold text-slate-900 tabular-nums">
                    {formatBRL(item.prices.grande)}
                  </span>
                  <button
                    type="button"
                    onClick={() =>
                      onQuickOrderItem(`Quero pedir uma ${item.name} tamanho grande.`)
                    }
                    className="px-2.5 py-1 text-[11px] font-medium bg-emerald-700 text-white rounded-md hover:bg-emerald-800 transition-colors whitespace-nowrap shrink-0"
                  >
                    Pedir
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (attachment.type === 'payment') {
    const liveOrder = orders.find((o) => o.id === attachment.orderId);
    const payment = liveOrder ? liveOrder.payment : attachment.payment;
    const isPaid = payment.status === 'pago';

    const handleCopy = async () => {
      if (!payment.pixCode) return;
      try {
        await navigator.clipboard.writeText(payment.pixCode);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      } catch {
        setCopied(false);
      }
    };

    const handlePayNow = async () => {
      setPaying(true);
      try {
        await onConfirmPayment(attachment.orderId);
      } finally {
        setPaying(false);
      }
    };

    return (
      <div className="mt-2.5 border border-slate-200 bg-slate-50 rounded-lg p-3 space-y-2.5">
        <div className="flex items-center justify-between gap-2 border-b border-slate-200 pb-2">
          <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-900">
            {payment.method === 'pix' ? (
              <QrCode className="w-4 h-4 text-emerald-700" />
            ) : (
              <CreditCard className="w-4 h-4 text-emerald-700" />
            )}
            <span>Pagamento {attachment.orderCode}</span>
          </div>
          <span className="text-xs font-mono font-semibold text-slate-900 tabular-nums">
            {formatBRL(payment.amount)}
          </span>
        </div>

        <div className="flex items-center justify-between text-[11px] text-slate-600">
          <span>{formatPaymentMethod(payment.method)}</span>
          <span aria-hidden="true">·</span>
          <span className={isPaid ? 'font-semibold text-emerald-700' : 'font-semibold text-amber-700'}>
            {isPaid ? 'Pago e Confirmado' : 'Aguardando Confirmação'}
          </span>
        </div>

        {isPaid ? (
          <div className="flex items-center gap-2 p-2.5 rounded-md bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs">
            <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-700" />
            <span>
              Pagamento confirmado {payment.paidAt ? `às ${formatTime(payment.paidAt)}` : ''}. Pedido enviado para preparo.
            </span>
          </div>
        ) : (
          <>
            {payment.method === 'pix' && payment.pixCode && (
              <div className="flex flex-col sm:flex-row items-center gap-3 pt-1">
                <PixQrSvg value={payment.pixCode} size={108} />
                <div className="flex-1 min-w-0 w-full space-y-2">
                  <div className="text-[11px] text-slate-600">
                    Escaneie o QR Code ou copie o código PIX Copia e Cola:
                  </div>
                  <div className="font-mono text-[10px] text-slate-700 bg-white border border-slate-200 rounded px-2 py-1.5 truncate">
                    {payment.pixCode}
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={handleCopy}
                      className="flex items-center gap-1.5 px-2.5 py-1.5 text-[11px] font-medium border border-slate-300 bg-white text-slate-700 rounded-md hover:bg-slate-100 transition-colors whitespace-nowrap shrink-0"
                    >
                      {copied ? <Check className="w-3.5 h-3.5 text-emerald-700" /> : <Copy className="w-3.5 h-3.5" />}
                      {copied ? 'Copiado' : 'Copiar PIX'}
                    </button>
                    <button
                      type="button"
                      disabled={paying}
                      onClick={handlePayNow}
                      className="flex-1 px-3 py-1.5 text-[11px] font-semibold bg-emerald-700 text-white rounded-md hover:bg-emerald-800 disabled:opacity-60 transition-colors whitespace-nowrap shrink-0"
                    >
                      {paying ? 'Confirmando...' : 'Confirmar Pagamento PIX'}
                    </button>
                  </div>
                </div>
              </div>
            )}

            {payment.method === 'cartao_online' && (
              <div className="space-y-2 pt-1">
                <div className="text-[11px] text-slate-600">
                  Link seguro de pagamento via Cartão de Crédito/Débito:
                </div>
                <button
                  type="button"
                  disabled={paying}
                  onClick={handlePayNow}
                  className="w-full px-3 py-2 text-xs font-semibold bg-emerald-700 text-white rounded-md hover:bg-emerald-800 disabled:opacity-60 transition-colors whitespace-nowrap"
                >
                  {paying ? 'Processando cartão...' : `Pagar ${formatBRL(payment.amount)} no Cartão`}
                </button>
              </div>
            )}
          </>
        )}
      </div>
    );
  }

  if (attachment.type === 'tracking') {
    const order = orders.find((o) => o.id === attachment.orderId);
    if (!order) return null;

    const meta = ORDER_STAGE_META[order.stage];
    const currentStep = meta.stepIndex;

    return (
      <div className="mt-2.5 border border-slate-200 bg-slate-50 rounded-lg p-3 space-y-3">
        <div className="flex items-center justify-between gap-2 border-b border-slate-200 pb-2">
          <div className="flex items-center gap-2">
            <span className="text-xs font-mono font-semibold text-slate-900 tabular-nums">
              Pedido {order.code}
            </span>
            <span className="text-slate-300" aria-hidden="true">·</span>
            <span className={`text-xs font-semibold ${meta.textColor}`}>{meta.label}</span>
          </div>
          {order.estimatedMinutes > 0 && order.stage !== 'entregue' && (
            <span className="text-[11px] font-mono text-slate-600 tabular-nums whitespace-nowrap">
              ~{order.estimatedMinutes} min
            </span>
          )}
        </div>

        {/* 5-step horizontal progress bar */}
        <div className="grid grid-cols-5 gap-1">
          {TRACKING_STEPS.map((step, idx) => {
            const StepIcon = step.icon;
            const completed = currentStep >= idx;
            const active = currentStep === idx;
            return (
              <div key={step.stage} className="flex flex-col items-center text-center gap-1">
                <div
                  className={`w-7 h-7 rounded-full flex items-center justify-center border transition-colors ${
                    completed
                      ? active
                        ? 'bg-emerald-700 border-emerald-700 text-white'
                        : 'bg-emerald-100 border-emerald-300 text-emerald-800'
                      : 'bg-white border-slate-200 text-slate-400'
                  }`}
                >
                  <StepIcon className="w-3.5 h-3.5" />
                </div>
                <span
                  className={`text-[10px] leading-tight ${
                    completed ? 'font-semibold text-slate-900' : 'text-slate-400'
                  }`}
                >
                  {step.label}
                </span>
              </div>
            );
          })}
        </div>

        <div className="text-[11px] text-slate-600 space-y-1 pt-1 border-t border-slate-200/80">
          <div className="flex items-start gap-1.5">
            <MapPin className="w-3.5 h-3.5 text-slate-400 shrink-0 mt-0.5" />
            <span className="truncate">{order.deliveryAddress}</span>
          </div>
          {order.riderName && (
            <div className="flex items-center gap-1.5 text-blue-700 font-medium">
              <Truck className="w-3.5 h-3.5 shrink-0" />
              <span>Entregador: {order.riderName}</span>
            </div>
          )}
          <div className="flex items-center justify-between text-slate-500 pt-0.5">
            <span>{order.items.map((i) => `${i.quantity}x ${i.name}`).join(', ')}</span>
            <span className="font-mono font-semibold text-slate-800 tabular-nums shrink-0 ml-2">
              {formatBRL(order.total)}
            </span>
          </div>
        </div>
      </div>
    );
  }

  return null;
};
