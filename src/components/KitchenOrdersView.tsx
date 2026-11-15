import React, { useMemo, useState } from 'react';
import {
  Bike,
  CheckCircle2,
  ChevronRight,
  Clock,
  Flame,
  Loader2,
  MessageSquare,
  PackageCheck,
  Plus,
  Printer,
  Search,
  ShoppingBag,
  Truck,
} from 'lucide-react';
import type {
  AppSnapshot,
  Order,
  OrderChannel,
  OrderServiceType,
  OrderStage,
} from '../types.ts';
import {
  formatBRL,
  formatPaymentMethod,
  formatPaymentStatus,
  formatTime,
  getOrderChannel,
  getOrderServiceType,
  ORDER_CHANNEL_META,
  ORDER_SERVICE_TYPE_META,
  ORDER_STAGE_META,
} from '../utils/format.ts';

interface KitchenOrdersViewProps {
  snapshot: AppSnapshot;
  onAdvanceOrder: (orderId: string, targetStage?: OrderStage) => Promise<void>;
  onConfirmPayment: (orderId: string) => Promise<void>;
  onSimulateMarketplaceOrder: (channel: 'ifood' | '99food') => Promise<void>;
  onOpenChat: (conversationId: string) => void;
  onOpenPdvModal: () => void;
  onOpenReceipt: (order: Order, tab?: 'comanda' | 'motoboy') => void;
  onAssignDriver: (orderId: string, driverId: string | null) => Promise<void>;
}

const PIPELINE_COLUMNS: { stage: OrderStage; title: string; nextLabel: string }[] = [
  { stage: 'recebido', title: 'Recebidos', nextLabel: 'Iniciar Preparo' },
  { stage: 'em_preparo', title: 'Em Preparo', nextLabel: 'Enviar ao Forno' },
  { stage: 'no_forno', title: 'No Forno', nextLabel: 'Despachar / Pronto' },
  { stage: 'saiu_entrega', title: 'Em Entrega / Retirada', nextLabel: 'Marcar Concluído' },
];

export const KitchenOrdersView: React.FC<KitchenOrdersViewProps> = ({
  snapshot,
  onAdvanceOrder,
  onConfirmPayment,
  onSimulateMarketplaceOrder,
  onOpenChat,
  onOpenPdvModal,
  onOpenReceipt,
  onAssignDriver,
}) => {
  const [search, setSearch] = useState('');
  const [channelFilter, setChannelFilter] = useState<'all' | OrderChannel>('all');
  const [serviceFilter, setServiceFilter] = useState<'all' | OrderServiceType>('all');
  const [viewMode, setViewMode] = useState<'board' | 'table'>('board');
  const [simulatingChannel, setSimulatingChannel] = useState<'ifood' | '99food' | null>(null);
  const [simError, setSimError] = useState<string | null>(null);

  const channelCounts = useMemo(() => {
    const counts: Record<'all' | OrderChannel, number> = {
      all: snapshot.orders.length,
      whatsapp: 0,
      ifood: 0,
      '99food': 0,
      pdv: 0,
    };
    for (const o of snapshot.orders) {
      counts[getOrderChannel(o.channel)] += 1;
    }
    return counts;
  }, [snapshot.orders]);

  const serviceCounts = useMemo(() => {
    const counts: Record<'all' | OrderServiceType, number> = {
      all: snapshot.orders.length,
      entrega: 0,
      retirada: 0,
      mesa: 0,
    };
    for (const o of snapshot.orders) {
      counts[getOrderServiceType(o)] += 1;
    }
    return counts;
  }, [snapshot.orders]);

  const filteredOrders = useMemo(() => {
    return snapshot.orders.filter((o) => {
      const ch = getOrderChannel(o.channel);
      if (channelFilter !== 'all' && ch !== channelFilter) return false;
      const svc = getOrderServiceType(o);
      if (serviceFilter !== 'all' && svc !== serviceFilter) return false;
      if (!search.trim()) return true;
      const q = search.toLowerCase();
      return (
        o.code.toLowerCase().includes(q) ||
        (o.externalDisplayId ?? '').toLowerCase().includes(q) ||
        (o.pickupCode ?? '').toLowerCase().includes(q) ||
        o.customerName.toLowerCase().includes(q) ||
        o.deliveryAddress.toLowerCase().includes(q)
      );
    });
  }, [snapshot.orders, search, channelFilter, serviceFilter]);

  const metrics = useMemo(() => {
    const active = filteredOrders.filter(
      (o) => o.stage !== 'entregue' && o.stage !== 'cancelado'
    ).length;
    const awaitingPay = filteredOrders.filter(
      (o) => o.payment.status === 'aguardando'
    ).length;
    const revenue = filteredOrders
      .filter((o) => o.stage !== 'cancelado')
      .reduce((sum, o) => sum + o.total, 0);
    return { active, awaitingPay, revenue, total: filteredOrders.length };
  }, [filteredOrders]);

  const handleSimulate = async (channel: 'ifood' | '99food') => {
    setSimulatingChannel(channel);
    setSimError(null);
    try {
      await onSimulateMarketplaceOrder(channel);
    } catch (err) {
      setSimError(err instanceof Error ? err.message : 'Não foi possível simular o pedido.');
    } finally {
      setSimulatingChannel(null);
    }
  };

  const renderOrderCard = (order: Order, nextLabel?: string) => {
    const payStatus = formatPaymentStatus(order.payment.status);
    const channel = getOrderChannel(order.channel);
    const channelMeta = ORDER_CHANNEL_META[channel];
    const serviceType = getOrderServiceType(order);
    const serviceMeta = ORDER_SERVICE_TYPE_META[serviceType];
    const convId = order.conversationId;
    const isOwnDelivery = serviceType === 'entrega' && order.deliveryBy !== 'marketplace';

    return (
      <div
        key={order.id}
        className="bg-white border border-slate-200 rounded-lg p-3.5 space-y-2.5"
      >
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 min-w-0">
            <span className="text-xs font-mono font-semibold text-slate-900 tabular-nums shrink-0">
              {order.code}
            </span>
            <span className="text-slate-300" aria-hidden="true">·</span>
            <span className={`text-[11px] font-semibold shrink-0 ${channelMeta.textColor}`}>
              {channelMeta.shortLabel}
            </span>
            <span className="text-slate-300" aria-hidden="true">·</span>
            <span className={`text-[11px] font-semibold shrink-0 ${serviceMeta.textColor}`}>
              {serviceType === 'mesa' && order.tableNumber
                ? `Mesa ${order.tableNumber}`
                : serviceMeta.shortLabel}
            </span>
          </div>
          <span className="text-[11px] font-mono text-slate-400 tabular-nums shrink-0">
            {formatTime(order.createdAt)}
          </span>
        </div>

        <div className="flex items-center justify-between gap-2">
          <div className="text-xs font-medium text-slate-800 truncate">{order.customerName}</div>
          {order.externalDisplayId && (
            <span className="text-[11px] font-mono text-slate-500 tabular-nums shrink-0">
              {order.externalDisplayId}
            </span>
          )}
        </div>

        {(order.pickupCode || channel === 'ifood' || channel === '99food') && (
          <div className="text-[11px] text-slate-500 flex flex-wrap items-center gap-x-2 gap-y-0.5">
            <span>
              {order.deliveryBy === 'marketplace' ? 'Entregador Parceiro' : 'Entrega Própria'}
            </span>
            {order.pickupCode && (
              <>
                <span className="text-slate-300" aria-hidden="true">·</span>
                <span className="font-mono font-semibold text-slate-700 tabular-nums">
                  Coleta {order.pickupCode}
                </span>
              </>
            )}
          </div>
        )}

        <ul className="space-y-1 text-xs text-slate-600 border-t border-slate-100 pt-2">
          {order.items.map((item, i) => (
            <li key={i} className="space-y-0.5">
              <div className="flex justify-between gap-2">
                <span className="truncate">
                  {item.quantity}x {item.name}
                  {item.crust && item.crust !== 'Tradicional' ? ` · Borda ${item.crust}` : ''}
                </span>
                <span className="font-mono tabular-nums text-slate-800 shrink-0">
                  {formatBRL(item.unitPrice * item.quantity)}
                </span>
              </div>
              {item.notes && (
                <div className="text-[11px] text-amber-800 truncate">Obs: {item.notes}</div>
              )}
            </li>
          ))}
        </ul>

        <div className="text-[11px] text-slate-500 truncate">{order.deliveryAddress}</div>

        {order.orderNotes && (
          <div className="text-[11px] text-slate-600 bg-slate-50 border border-slate-100 rounded px-2 py-1 truncate">
            {order.orderNotes}
          </div>
        )}

        {isOwnDelivery && (
          <div className="pt-1">
            <select
              aria-label={`Entregador do pedido ${order.code}`}
              value={order.driverId ?? ''}
              onChange={(e) => void onAssignDriver(order.id, e.target.value || null)}
              className="w-full px-2 py-1 text-[11px] bg-[#FAF6F0] border border-stone-200 rounded text-stone-700 focus:outline-none focus:border-orange-600"
            >
              <option value="">Selecionar motoboy...</option>
              {snapshot.drivers.map((d) => (
                <option key={d.id} value={d.id}>
                  Motoboy: {d.name} {!d.active ? '(Indisp.)' : ''}
                </option>
              ))}
            </select>
          </div>
        )}

        <div className="space-y-1 pt-2 border-t border-slate-100">
          <div className="flex items-center justify-between text-xs">
            <span className={`font-medium ${payStatus.colorClass}`}>
              {formatPaymentMethod(order.payment.method)} · {payStatus.label}
            </span>
            <span className="font-mono font-semibold text-slate-900 tabular-nums">
              {formatBRL(order.total)}
            </span>
          </div>
          {(order.discountTotal && order.discountTotal > 0) ||
          (order.payment.method === 'dinheiro' && order.payment.changeFor) ? (
            <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] font-mono tabular-nums">
              {order.discountTotal && order.discountTotal > 0 ? (
                <span className="text-emerald-700">
                  Desc: -{formatBRL(order.discountTotal)}
                  {order.couponCode ? ` (${order.couponCode})` : ''}
                </span>
              ) : (
                <span />
              )}
              {order.payment.method === 'dinheiro' && order.payment.changeFor ? (
                <span className="text-amber-800">
                  Troco p/ {formatBRL(order.payment.changeFor)}
                </span>
              ) : null}
            </div>
          ) : null}
        </div>

        <div className="flex items-center gap-1.5 pt-1">
          {order.payment.status === 'aguardando' && (
            <button
              type="button"
              onClick={() => onConfirmPayment(order.id)}
              className="flex-1 py-1.5 px-2 text-[11px] font-semibold bg-emerald-700 text-white rounded-md hover:bg-emerald-800 transition-colors whitespace-nowrap"
            >
              {order.payment.method === 'pix' ? 'Confirmar PIX' : 'Confirmar Pgto'}
            </button>
          )}
          {nextLabel && (
            <button
              type="button"
              onClick={() => onAdvanceOrder(order.id)}
              className="flex-1 py-1.5 px-2 text-[11px] font-semibold bg-slate-900 text-white rounded-md hover:bg-slate-800 transition-colors flex items-center justify-center gap-1 whitespace-nowrap"
            >
              {nextLabel}
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          )}
          <button
            type="button"
            onClick={() => onOpenReceipt(order, 'comanda')}
            className="p-1.5 text-slate-600 border border-slate-200 rounded-md hover:bg-slate-50 transition-colors shrink-0"
            title="Imprimir comanda térmica"
          >
            <Printer className="w-3.5 h-3.5" />
          </button>
          {isOwnDelivery && (
            <button
              type="button"
              onClick={() => onOpenReceipt(order, 'motoboy')}
              className={`p-1.5 border rounded-md transition-colors shrink-0 ${
                order.dispatchedToDriverAt
                  ? 'border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
                  : 'border-slate-200 text-slate-600 hover:bg-slate-50'
              }`}
              title="Enviar rota no WhatsApp do Motoboy"
            >
              <Bike className="w-3.5 h-3.5" />
            </button>
          )}
          {convId && (
            <button
              type="button"
              onClick={() => onOpenChat(convId)}
              className="p-1.5 text-slate-600 border border-slate-200 rounded-md hover:bg-slate-50 transition-colors shrink-0"
              title="Abrir conversa no WhatsApp"
            >
              <MessageSquare className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-5">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">Pedidos & Cozinha em Tempo Real</h1>
          <p className="text-xs text-slate-500 mt-1">
            Central unificada para pedidos WhatsApp, iFood, 99Food e PDV com comanda térmica e despacho para motoboy.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={onOpenPdvModal}
            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold bg-emerald-700 text-white rounded-md hover:bg-emerald-800 transition-colors whitespace-nowrap shrink-0"
          >
            <ShoppingBag className="w-3.5 h-3.5" />
            Novo Pedido (PDV)
          </button>
          <button
            type="button"
            disabled={simulatingChannel !== null}
            onClick={() => handleSimulate('ifood')}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-red-700 text-white rounded-md hover:bg-red-800 disabled:opacity-60 transition-colors whitespace-nowrap shrink-0"
          >
            {simulatingChannel === 'ifood' ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Plus className="w-3.5 h-3.5" />
            )}
            Simular iFood
          </button>
          <button
            type="button"
            disabled={simulatingChannel !== null}
            onClick={() => handleSimulate('99food')}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-amber-700 text-white rounded-md hover:bg-amber-800 disabled:opacity-60 transition-colors whitespace-nowrap shrink-0"
          >
            {simulatingChannel === '99food' ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Plus className="w-3.5 h-3.5" />
            )}
            Simular 99Food
          </button>

          <div className="relative">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar pedido, coleta ou cliente..."
              className="pl-8 pr-3 py-1.5 text-xs bg-white border border-slate-200 rounded-md w-52 focus:outline-none focus:border-emerald-600"
            />
          </div>
          <div className="flex items-center p-1 bg-slate-200/70 rounded-lg">
            <button
              type="button"
              onClick={() => setViewMode('board')}
              className={`px-3 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                viewMode === 'board' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600'
              }`}
            >
              Painel Cozinha
            </button>
            <button
              type="button"
              onClick={() => setViewMode('table')}
              className={`px-3 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                viewMode === 'table' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600'
              }`}
            >
              Tabela Completa
            </button>
          </div>
        </div>
      </div>

      {simError && (
        <div className="p-3 text-xs text-red-800 bg-red-50 border border-red-200 rounded-lg">
          {simError}
        </div>
      )}

      {/* Channel & Service Type Filter Bar */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2.5">
          <div className="flex items-center p-1 bg-stone-200/75 rounded-lg overflow-x-auto">
            {(
              [
                { id: 'all', label: 'Todos', count: channelCounts.all },
                { id: 'whatsapp', label: 'WhatsApp', count: channelCounts.whatsapp },
                { id: 'ifood', label: 'iFood', count: channelCounts.ifood },
                { id: '99food', label: '99Food', count: channelCounts['99food'] },
                { id: 'pdv', label: 'PDV', count: channelCounts.pdv },
              ] as const
            ).map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setChannelFilter(tab.id)}
                className={`px-2.5 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 flex items-center gap-1.5 ${
                  channelFilter === tab.id
                    ? 'bg-white text-stone-900 shadow-xs font-semibold'
                    : 'text-stone-600 hover:text-stone-900'
                }`}
              >
                <span>{tab.label}</span>
                <span className="font-mono text-[11px] text-stone-400 tabular-nums">
                  {tab.count}
                </span>
              </button>
            ))}
          </div>

          <div className="flex items-center p-1 bg-stone-200/75 rounded-lg overflow-x-auto">
            {(
              [
                { id: 'all', label: 'Todos Tipos', count: serviceCounts.all },
                { id: 'entrega', label: 'Entrega', count: serviceCounts.entrega },
                { id: 'retirada', label: 'Retirada', count: serviceCounts.retirada },
                { id: 'mesa', label: 'Mesa', count: serviceCounts.mesa },
              ] as const
            ).map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setServiceFilter(tab.id)}
                className={`px-2.5 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 flex items-center gap-1.5 ${
                  serviceFilter === tab.id
                    ? 'bg-white text-stone-900 shadow-xs font-semibold'
                    : 'text-stone-600 hover:text-stone-900'
                }`}
              >
                <span>{tab.label}</span>
                <span className="font-mono text-[11px] text-stone-400 tabular-nums">
                  {tab.count}
                </span>
              </button>
            ))}
          </div>
        </div>

        <div className="text-xs text-stone-500 flex items-center gap-3">
          <span>
            iFood:{' '}
            <strong className={snapshot.settings.ifoodEnabled ? 'text-emerald-700' : 'text-stone-400'}>
              {snapshot.settings.ifoodEnabled ? 'Ativo' : 'Pausado'}
            </strong>
          </span>
          <span aria-hidden="true">·</span>
          <span>
            99Food:{' '}
            <strong className={snapshot.settings.food99Enabled ? 'text-emerald-700' : 'text-stone-400'}>
              {snapshot.settings.food99Enabled ? 'Ativo' : 'Pausado'}
            </strong>
          </span>
        </div>
      </div>

      {/* KPI Strip */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-[#FFFDF9]/95 border border-stone-200 rounded-lg p-4">
          <div className="text-xs text-stone-500">Pedidos em Andamento</div>
          <div className="text-2xl font-mono font-semibold text-stone-900 tabular-nums mt-1">
            {metrics.active}
          </div>
        </div>
        <div className="bg-[#FFFDF9]/95 border border-stone-200 rounded-lg p-4">
          <div className="text-xs text-stone-500">Aguardando Pagamento</div>
          <div className="text-2xl font-mono font-semibold text-amber-700 tabular-nums mt-1">
            {metrics.awaitingPay}
          </div>
        </div>
        <div className="bg-[#FFFDF9]/95 border border-stone-200 rounded-lg p-4">
          <div className="text-xs text-stone-500">Total de Pedidos</div>
          <div className="text-2xl font-mono font-semibold text-stone-900 tabular-nums mt-1">
            {metrics.total}
          </div>
        </div>
        <div className="bg-[#FFFDF9]/95 border border-stone-200 rounded-lg p-4">
          <div className="text-xs text-stone-500">Faturamento Registrado</div>
          <div className="text-2xl font-mono font-semibold text-emerald-700 tabular-nums mt-1">
            {formatBRL(metrics.revenue)}
          </div>
        </div>
      </div>

      {viewMode === 'board' ? (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4 items-start">
          {PIPELINE_COLUMNS.map((col) => {
            const colOrders = filteredOrders.filter((o) => o.stage === col.stage);
            return (
              <div
                key={col.stage}
                className="bg-[#F3ECE1]/85 border border-stone-200 rounded-lg p-3 space-y-3"
              >
                <div className="flex items-center justify-between px-1">
                  <div className="flex items-center gap-2 text-xs font-semibold text-slate-800">
                    {col.stage === 'recebido' && <Clock className="w-3.5 h-3.5 text-slate-600" />}
                    {col.stage === 'em_preparo' && <CheckCircle2 className="w-3.5 h-3.5 text-amber-700" />}
                    {col.stage === 'no_forno' && <Flame className="w-3.5 h-3.5 text-orange-600" />}
                    {col.stage === 'saiu_entrega' && <Truck className="w-3.5 h-3.5 text-blue-700" />}
                    <span>{col.title}</span>
                  </div>
                  <span className="text-xs font-mono text-slate-500 tabular-nums">
                    {colOrders.length}
                  </span>
                </div>

                <div className="space-y-2.5">
                  {colOrders.length === 0 ? (
                    <div className="py-6 text-center text-xs text-slate-400 border border-dashed border-slate-200 rounded-md">
                      Sem pedidos nesta etapa
                    </div>
                  ) : (
                    colOrders.map((order) => renderOrderCard(order, col.nextLabel))
                  )}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-[11px] font-semibold text-slate-500">
                  <th className="py-2.5 px-3">Impr.</th>
                  <th className="py-2.5 px-3">Pedido</th>
                  <th className="py-2.5 px-3">Tipo</th>
                  <th className="py-2.5 px-3">Origem</th>
                  <th className="py-2.5 px-3">Cliente</th>
                  <th className="py-2.5 px-3">Itens</th>
                  <th className="py-2.5 px-3">Entregador</th>
                  <th className="py-2.5 px-3">Etapa</th>
                  <th className="py-2.5 px-3">Pagamento / Troco</th>
                  <th className="py-2.5 px-3 text-right">Total</th>
                  <th className="py-2.5 px-3 text-right">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-xs">
                {filteredOrders.map((order) => {
                  const stageMeta = ORDER_STAGE_META[order.stage];
                  const payMeta = formatPaymentStatus(order.payment.status);
                  const chMeta = ORDER_CHANNEL_META[getOrderChannel(order.channel)];
                  const svc = getOrderServiceType(order);
                  const svcMeta = ORDER_SERVICE_TYPE_META[svc];
                  const convId = order.conversationId;
                  const isOwnDelivery = svc === 'entrega' && order.deliveryBy !== 'marketplace';

                  return (
                    <tr key={order.id} className="hover:bg-slate-50/80">
                      <td className="py-3 px-3">
                        <button
                          type="button"
                          onClick={() => onOpenReceipt(order, 'comanda')}
                          className="p-1.5 text-slate-600 border border-slate-200 rounded hover:bg-slate-100"
                          title="Imprimir Comanda"
                        >
                          <Printer className="w-3.5 h-3.5" />
                        </button>
                      </td>
                      <td className="py-3 px-3 font-mono font-semibold text-slate-900 tabular-nums">
                        <div>{order.code}</div>
                        {order.externalDisplayId && (
                          <div className="text-[11px] font-normal text-slate-400">
                            {order.externalDisplayId}
                          </div>
                        )}
                      </td>
                      <td className={`py-3 px-3 font-semibold ${svcMeta.textColor}`}>
                        {svc === 'mesa' && order.tableNumber
                          ? `Mesa ${order.tableNumber}`
                          : svcMeta.shortLabel}
                      </td>
                      <td className="py-3 px-3">
                        <div className={`font-semibold ${chMeta.textColor}`}>{chMeta.shortLabel}</div>
                        {order.pickupCode && (
                          <div className="text-[11px] font-mono text-slate-500 tabular-nums">
                            Coleta {order.pickupCode}
                          </div>
                        )}
                      </td>
                      <td className="py-3 px-3">
                        <div className="font-medium text-slate-900">{order.customerName}</div>
                        <div className="text-[11px] text-slate-500 font-mono tabular-nums">
                          {order.customerPhone}
                        </div>
                      </td>
                      <td className="py-3 px-3 text-slate-600 max-w-[200px] truncate">
                        {order.items.map((i) => `${i.quantity}x ${i.name}`).join(', ')}
                      </td>
                      <td className="py-3 px-3">
                        {isOwnDelivery ? (
                          <select
                            aria-label={`Entregador do pedido ${order.code}`}
                            value={order.driverId ?? ''}
                            onChange={(e) => void onAssignDriver(order.id, e.target.value || null)}
                            className="px-2 py-1 text-[11px] bg-white border border-slate-200 rounded text-slate-700"
                          >
                            <option value="">Sem motoboy</option>
                            {snapshot.drivers.map((d) => (
                              <option key={d.id} value={d.id}>
                                {d.name}
                              </option>
                            ))}
                          </select>
                        ) : (
                          <span className="text-[11px] text-slate-400">
                            {order.deliveryBy === 'marketplace' ? 'Parceiro' : '--'}
                          </span>
                        )}
                      </td>
                      <td className={`py-3 px-3 font-medium ${stageMeta.textColor}`}>
                        {stageMeta.shortLabel}
                      </td>
                      <td className="py-3 px-3">
                        <div className={`font-medium ${payMeta.colorClass}`}>
                          {formatPaymentMethod(order.payment.method)} · {payMeta.label}
                        </div>
                        {order.payment.method === 'dinheiro' && order.payment.changeFor && (
                          <div className="text-[11px] font-mono text-amber-800 tabular-nums">
                            Troco p/ {formatBRL(order.payment.changeFor)}
                          </div>
                        )}
                      </td>
                      <td className="py-3 px-3 text-right font-mono font-semibold text-slate-900 tabular-nums">
                        <div>{formatBRL(order.total)}</div>
                        {order.discountTotal && order.discountTotal > 0 ? (
                          <div className="text-[10px] text-emerald-700">
                            -{formatBRL(order.discountTotal)}
                          </div>
                        ) : null}
                      </td>
                      <td className="py-3 px-3 text-right whitespace-nowrap space-x-1.5">
                        {isOwnDelivery && (
                          <button
                            type="button"
                            onClick={() => onOpenReceipt(order, 'motoboy')}
                            className="px-2 py-1 text-[11px] font-medium border border-emerald-200 bg-emerald-50 text-emerald-800 rounded hover:bg-emerald-100"
                          >
                            Motoboy
                          </button>
                        )}
                        {order.stage !== 'entregue' && order.stage !== 'cancelado' && (
                          <button
                            type="button"
                            onClick={() => onAdvanceOrder(order.id)}
                            className="px-2.5 py-1 text-[11px] font-medium bg-slate-900 text-white rounded hover:bg-slate-800"
                          >
                            Avançar
                          </button>
                        )}
                        {convId && (
                          <button
                            type="button"
                            onClick={() => onOpenChat(convId)}
                            className="px-2 py-1 text-[11px] font-medium border border-slate-200 text-slate-700 rounded hover:bg-slate-50"
                          >
                            Chat
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Delivered archive summary */}
      {filteredOrders.some((o) => o.stage === 'entregue') && (
        <div className="bg-white border border-slate-200 rounded-lg p-4 space-y-2">
          <div className="flex items-center gap-2 text-xs font-semibold text-slate-800">
            <PackageCheck className="w-4 h-4 text-emerald-700" />
            <span>Pedidos Concluídos Recentemente</span>
          </div>
          <div className="divide-y divide-slate-100">
            {filteredOrders
              .filter((o) => o.stage === 'entregue')
              .map((o) => {
                const chMeta = ORDER_CHANNEL_META[getOrderChannel(o.channel)];
                return (
                  <div key={o.id} className="py-2 flex items-center justify-between gap-3 text-xs">
                    <span className="text-slate-700 truncate">
                      <strong className="font-mono tabular-nums">{o.code}</strong> ·{' '}
                      <span className={`font-medium ${chMeta.textColor}`}>{chMeta.shortLabel}</span> ·{' '}
                      {o.customerName} · {o.deliveryAddress}
                    </span>
                    <div className="flex items-center gap-3 shrink-0">
                      <button
                        type="button"
                        onClick={() => onOpenReceipt(o, 'comanda')}
                        className="text-[11px] text-slate-600 hover:text-slate-900 underline"
                      >
                        Comanda
                      </button>
                      <span className="font-mono font-semibold text-emerald-700 tabular-nums">
                        {formatBRL(o.total)}
                      </span>
                    </div>
                  </div>
                );
              })}
          </div>
        </div>
      )}
    </div>
  );
};

