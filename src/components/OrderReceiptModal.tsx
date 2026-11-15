import React, { useState } from 'react';
import { Check, Copy, ExternalLink, Printer, Send, X } from 'lucide-react';
import type { DeliveryDriver, Order, StoreSettings } from '../types.ts';
import {
  buildDriverDispatchMessage,
  buildWhatsAppLink,
  formatBRL,
  formatDateTime,
  formatPaymentMethod,
  formatPaymentStatus,
  getOrderChannel,
  getOrderServiceType,
  ORDER_CHANNEL_META,
  ORDER_SERVICE_TYPE_META,
} from '../utils/format.ts';

interface OrderReceiptModalProps {
  order: Order;
  settings: StoreSettings;
  drivers: DeliveryDriver[];
  initialTab?: 'comanda' | 'motoboy';
  onClose: () => void;
  onAssignDriver: (orderId: string, driverId: string | null) => Promise<void>;
  onMarkDispatched: (orderId: string) => Promise<void>;
}

export const OrderReceiptModal: React.FC<OrderReceiptModalProps> = ({
  order,
  settings,
  drivers,
  initialTab = 'comanda',
  onClose,
  onAssignDriver,
  onMarkDispatched,
}) => {
  const [tab, setTab] = useState<'comanda' | 'motoboy'>(initialTab);
  const [copiedDriverMsg, setCopiedDriverMsg] = useState(false);
  const [assigning, setAssigning] = useState(false);

  const channelMeta = ORDER_CHANNEL_META[getOrderChannel(order.channel)];
  const serviceType = getOrderServiceType(order);
  const serviceMeta = ORDER_SERVICE_TYPE_META[serviceType];
  const payStatus = formatPaymentStatus(order.payment.status);

  const assignedDriver =
    drivers.find((d) => d.id === order.driverId) ??
    drivers.find((d) => order.riderName && order.riderName.startsWith(d.name)) ??
    drivers.find((d) => d.active) ??
    drivers[0];

  const dispatchMessage = assignedDriver
    ? buildDriverDispatchMessage(order, assignedDriver, settings.pizzeriaName)
    : '';
  const whatsappUrl =
    assignedDriver && dispatchMessage
      ? buildWhatsAppLink(assignedDriver.phone, dispatchMessage)
      : '';

  const handleCopyDispatch = async () => {
    if (!dispatchMessage) return;
    try {
      await navigator.clipboard.writeText(dispatchMessage);
      setCopiedDriverMsg(true);
      await onMarkDispatched(order.id);
      setTimeout(() => setCopiedDriverMsg(false), 2500);
    } catch {
      // Ignore clipboard failure
    }
  };

  const handleDriverChange = async (driverId: string) => {
    setAssigning(true);
    try {
      await onAssignDriver(order.id, driverId || null);
    } finally {
      setAssigning(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-stone-950/60 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-[#FFFDF9] border border-stone-200 rounded-xl w-full max-w-lg shadow-xl overflow-hidden flex flex-col max-h-[90vh]">
        <div className="px-5 py-3.5 border-b border-stone-200 flex items-center justify-between gap-3 no-print">
          <div className="flex items-center gap-1 p-1 bg-stone-100 rounded-lg">
            <button
              type="button"
              onClick={() => setTab('comanda')}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                tab === 'comanda' ? 'bg-white text-stone-900 shadow-xs font-semibold' : 'text-stone-600'
              }`}
            >
              Comanda / Impressão
            </button>
            <button
              type="button"
              onClick={() => setTab('motoboy')}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                tab === 'motoboy' ? 'bg-white text-stone-900 shadow-xs font-semibold' : 'text-stone-600'
              }`}
            >
              Despacho Motoboy (WhatsApp)
            </button>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 text-stone-400 hover:text-stone-800"
            aria-label="Fechar"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 overflow-y-auto flex-1">
          {tab === 'comanda' ? (
            <div className="space-y-4">
              {/* 80mm thermal style comanda */}
              <div className="print-receipt-area mx-auto max-w-[320px] bg-white border border-stone-300 rounded-md p-4 font-mono text-[11px] text-stone-900 space-y-2.5 leading-snug">
                <div className="text-center border-b border-dashed border-stone-400 pb-2 space-y-0.5">
                  <div className="text-xs font-bold uppercase">{settings.pizzeriaName}</div>
                  <div className="text-[10px] text-stone-600">{settings.whatsappPhoneDisplay}</div>
                  <div className="text-[11px] font-bold pt-1">
                    COMANDA {order.code} · {serviceMeta.shortLabel.toUpperCase()}
                    {order.tableNumber ? ` (${order.tableNumber})` : ''}
                  </div>
                  <div className="text-[10px] text-stone-600">
                    Origem: {channelMeta.label}
                    {order.externalDisplayId ? ` (${order.externalDisplayId})` : ''} · {formatDateTime(order.createdAt)}
                  </div>
                </div>

                <div className="border-b border-dashed border-stone-400 pb-2 space-y-0.5">
                  <div>
                    <strong>Cliente:</strong> {order.customerName}
                  </div>
                  <div>
                    <strong>Tel:</strong> {order.customerPhone}
                  </div>
                  <div>
                    <strong>Local:</strong> {order.deliveryAddress}
                  </div>
                  {order.pickupCode && (
                    <div>
                      <strong>Coleta:</strong> {order.pickupCode}
                    </div>
                  )}
                  {order.riderName && (
                    <div>
                      <strong>Entregador:</strong> {order.riderName}
                    </div>
                  )}
                </div>

                <div className="border-b border-dashed border-stone-400 pb-2 space-y-1.5">
                  <div className="font-bold">ITENS DO PEDIDO</div>
                  {order.items.map((item, idx) => (
                    <div key={idx} className="space-y-0.5">
                      <div className="flex justify-between gap-2">
                        <span>
                          {item.quantity}x {item.name}
                          {item.size !== 'unico' ? ` (${item.size})` : ''}
                        </span>
                        <span className="tabular-nums shrink-0">
                          {formatBRL(item.unitPrice * item.quantity)}
                        </span>
                      </div>
                      {item.crust && item.crust !== 'Tradicional' && (
                        <div className="text-[10px] text-stone-600 pl-2">+ Borda {item.crust}</div>
                      )}
                      {item.halfAndHalf && (
                        <div className="text-[10px] text-stone-600 pl-2">Meio a meio: {item.halfAndHalf}</div>
                      )}
                      {item.notes && (
                        <div className="text-[10px] text-stone-700 pl-2">Obs: {item.notes}</div>
                      )}
                    </div>
                  ))}
                  {order.orderNotes && (
                    <div className="text-[10px] pt-1">
                      <strong>Obs. pedido:</strong> {order.orderNotes}
                    </div>
                  )}
                </div>

                <div className="space-y-1 border-b border-dashed border-stone-400 pb-2">
                  <div className="flex justify-between">
                    <span>Subtotal</span>
                    <span className="tabular-nums">{formatBRL(order.subtotal)}</span>
                  </div>
                  {order.deliveryFee > 0 && (
                    <div className="flex justify-between">
                      <span>Taxa de Entrega</span>
                      <span className="tabular-nums">{formatBRL(order.deliveryFee)}</span>
                    </div>
                  )}
                  {order.discountTotal && order.discountTotal > 0 ? (
                    <div className="flex justify-between">
                      <span>
                        Descontos
                        {order.couponCode ? ` (${order.couponCode})` : ''}
                      </span>
                      <span className="tabular-nums">-{formatBRL(order.discountTotal)}</span>
                    </div>
                  ) : null}
                  <div className="flex justify-between text-xs font-bold pt-1">
                    <span>TOTAL</span>
                    <span className="tabular-nums">{formatBRL(order.total)}</span>
                  </div>
                </div>

                <div className="space-y-0.5 text-[10px]">
                  <div>
                    <strong>Pagamento:</strong> {formatPaymentMethod(order.payment.method)} ({payStatus.label})
                  </div>
                  {order.payment.method === 'dinheiro' && order.payment.changeFor && (
                    <div>
                      <strong>Troco para:</strong> {formatBRL(order.payment.changeFor)} · Levar{' '}
                      {formatBRL(
                        order.payment.changeAmount ?? Math.max(0, order.payment.changeFor - order.total)
                      )}
                    </div>
                  )}
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 no-print">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-3 py-2 text-xs text-stone-600 hover:text-stone-900"
                >
                  Fechar
                </button>
                <button
                  type="button"
                  onClick={() => window.print()}
                  className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold bg-stone-900 text-white rounded-lg hover:bg-stone-800 transition-colors"
                >
                  <Printer className="w-3.5 h-3.5" />
                  Imprimir Comanda
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-stone-700 mb-1">
                  Selecionar Entregador (Motoboy)
                </label>
                <select
                  value={assignedDriver?.id ?? ''}
                  disabled={assigning}
                  onChange={(e) => handleDriverChange(e.target.value)}
                  className="w-full px-3 py-2 text-xs bg-white border border-stone-200 rounded-md focus:outline-none focus:border-orange-600"
                >
                  <option value="">Sem entregador definido</option>
                  {drivers.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name} · {d.phone} ({d.vehicle}) {!d.active ? '[Inativo]' : ''}
                    </option>
                  ))}
                </select>
              </div>

              {assignedDriver ? (
                <>
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs font-medium text-stone-700">
                        Mensagem pronta para WhatsApp do Motoboy
                      </span>
                      {order.dispatchedToDriverAt && (
                        <span className="text-[11px] text-emerald-700 font-medium">
                          Enviado às {formatDateTime(order.dispatchedToDriverAt)}
                        </span>
                      )}
                    </div>
                    <pre className="p-3 text-xs font-mono bg-[#FAF6F0] border border-stone-200 rounded-lg whitespace-pre-wrap text-stone-800 leading-relaxed">
                      {dispatchMessage}
                    </pre>
                  </div>

                  <div className="flex flex-wrap items-center justify-end gap-2">
                    <button
                      type="button"
                      onClick={handleCopyDispatch}
                      className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium bg-white border border-stone-300 text-stone-800 rounded-lg hover:bg-stone-50"
                    >
                      {copiedDriverMsg ? (
                        <Check className="w-3.5 h-3.5 text-emerald-700" />
                      ) : (
                        <Copy className="w-3.5 h-3.5" />
                      )}
                      {copiedDriverMsg ? 'Copiado!' : 'Copiar Mensagem'}
                    </button>
                    <a
                      href={whatsappUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={() => void onMarkDispatched(order.id)}
                      className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold bg-emerald-700 text-white rounded-lg hover:bg-emerald-800 transition-colors"
                    >
                      <Send className="w-3.5 h-3.5" />
                      Enviar no WhatsApp do Motoboy
                      <ExternalLink className="w-3 h-3" />
                    </a>
                  </div>
                </>
              ) : (
                <div className="p-4 text-xs text-stone-600 bg-stone-50 border border-stone-200 rounded-lg">
                  Cadastre ao menos um entregador na aba <strong>Entregadores</strong> para enviar a rota direta no WhatsApp dele.
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
