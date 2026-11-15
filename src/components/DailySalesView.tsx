import React, { useMemo, useState } from 'react';
import { Calendar, Download, Loader2, MessageSquare, Receipt, Send, Settings } from 'lucide-react';
import type { AppSnapshot, Order, OrderChannel } from '../types.ts';
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

interface DailySalesViewProps {
  snapshot: AppSnapshot;
  onOpenChat: (conversationId: string) => void;
  onSendTelegramBackup: () => Promise<{ summary: string; sentAt: string }>;
  onOpenSettings: () => void;
}

function toLocalDateKey(iso: string): string {
  const d = new Date(iso);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function formatDateLabel(dateKey: string): string {
  const [y, m, d] = dateKey.split('-');
  return `${d}/${m}/${y}`;
}

export const DailySalesView: React.FC<DailySalesViewProps> = ({
  snapshot,
  onOpenChat,
  onSendTelegramBackup,
  onOpenSettings,
}) => {
  const todayKey = toLocalDateKey(new Date().toISOString());
  const [selectedDate, setSelectedDate] = useState(todayKey);
  const [channelFilter, setChannelFilter] = useState<'all' | OrderChannel>('all');
  const [sendingBackup, setSendingBackup] = useState(false);
  const [backupNotice, setBackupNotice] = useState<{
    type: 'success' | 'error';
    text: string;
    needsConfig?: boolean;
  } | null>(null);

  const handleQuickTelegramBackup = async () => {
    setSendingBackup(true);
    setBackupNotice(null);
    try {
      const res = await onSendTelegramBackup();
      setBackupNotice({
        type: 'success',
        text: `Backup enviado para o Telegram às ${formatTime(res.sentAt)} · ${res.summary}`,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Erro ao enviar backup para o Telegram.';
      setBackupNotice({
        type: 'error',
        text: msg,
        needsConfig: /não configurado|Bot Token|Chat ID/i.test(msg),
      });
    } finally {
      setSendingBackup(false);
    }
  };

  const allDayOrders = useMemo(() => {
    return snapshot.orders
      .filter(
        (o) => toLocalDateKey(o.createdAt) === selectedDate && o.stage !== 'cancelado'
      )
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }, [snapshot.orders, selectedDate]);

  const dailyOrders = useMemo(() => {
    if (channelFilter === 'all') return allDayOrders;
    return allDayOrders.filter((o) => getOrderChannel(o.channel) === channelFilter);
  }, [allDayOrders, channelFilter]);

  const channelStats = useMemo(() => {
    const stats: Record<OrderChannel, { count: number; total: number }> = {
      whatsapp: { count: 0, total: 0 },
      ifood: { count: 0, total: 0 },
      '99food': { count: 0, total: 0 },
      pdv: { count: 0, total: 0 },
    };
    for (const order of allDayOrders) {
      const ch = getOrderChannel(order.channel);
      stats[ch].count += 1;
      stats[ch].total += order.total;
    }
    return stats;
  }, [allDayOrders]);

  const serviceStats = useMemo(() => {
    const counts = { entrega: 0, retirada: 0, mesa: 0 };
    for (const order of dailyOrders) {
      counts[getOrderServiceType(order)] += 1;
    }
    return counts;
  }, [dailyOrders]);

  const summary = useMemo(() => {
    let totalSold = 0;
    let totalPaid = 0;
    let totalPending = 0;
    let totalItemsCount = 0;
    let totalDiscounts = 0;

    const itemBreakdown = new Map<
      string,
      { name: string; sizeLabel: string; quantity: number; revenue: number }
    >();

    for (const order of dailyOrders) {
      totalSold += order.total;
      totalDiscounts += order.discountTotal ?? 0;
      if (order.payment.status === 'pago') {
        totalPaid += order.total;
      } else {
        totalPending += order.total;
      }

      for (const item of order.items) {
        totalItemsCount += item.quantity;
        const sizeLabel =
          item.size === 'media'
            ? 'Média'
            : item.size === 'grande'
              ? 'Grande'
              : item.size === 'gigante'
                ? 'Gigante'
                : 'Unidade';
        const key = `${item.name}__${sizeLabel}`;
        const existing = itemBreakdown.get(key);
        const lineRevenue = item.unitPrice * item.quantity;
        if (existing) {
          existing.quantity += item.quantity;
          existing.revenue += lineRevenue;
        } else {
          itemBreakdown.set(key, {
            name: item.name,
            sizeLabel,
            quantity: item.quantity,
            revenue: lineRevenue,
          });
        }
      }
    }

    const productsSold = Array.from(itemBreakdown.values()).sort(
      (a, b) => b.revenue - a.revenue
    );

    const averageTicket = dailyOrders.length > 0 ? totalSold / dailyOrders.length : 0;

    return {
      totalSold,
      totalPaid,
      totalPending,
      totalItemsCount,
      totalDiscounts,
      averageTicket,
      productsSold,
    };
  }, [dailyOrders]);

  const handleExportCsv = () => {
    const header = [
      'Pedido',
      'Canal',
      'Ref Externa',
      'Hora',
      'Cliente',
      'Itens',
      'Pagamento',
      'Status Pgto',
      'Etapa',
      'Valor Total',
    ];
    const rows = dailyOrders.map((o: Order) => [
      o.code,
      ORDER_CHANNEL_META[getOrderChannel(o.channel)].label,
      o.externalDisplayId ?? '',
      formatTime(o.createdAt),
      `"${o.customerName.replace(/"/g, '""')}"`,
      `"${o.items.map((i) => `${i.quantity}x ${i.name} (${i.size})`).join('; ')}"`,
      formatPaymentMethod(o.payment.method),
      formatPaymentStatus(o.payment.status).label,
      ORDER_STAGE_META[o.stage].label,
      o.total.toFixed(2).replace('.', ','),
    ]);
    const csv = [header.join(';'), ...rows.map((r) => r.join(';'))].join('\n');
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `vendas-${selectedDate}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      {/* Header & Date Filter */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-stone-900">
            Vendas do Dia · Fechamento de Caixa
          </h1>
          <p className="text-xs text-stone-600 mt-1">
            Resumo detalhado do que foi vendido no dia, valor individual de cada pedido e faturamento total.
          </p>
        </div>

        <div className="flex items-center gap-2.5 flex-wrap">
          <div className="flex items-center gap-2 bg-[#FFFDF9] border border-stone-200 rounded-lg px-3 py-1.5">
            <Calendar className="w-3.5 h-3.5 text-stone-500" />
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="text-xs font-mono text-stone-800 bg-transparent focus:outline-none"
            />
          </div>
          {selectedDate !== todayKey && (
            <button
              type="button"
              onClick={() => setSelectedDate(todayKey)}
              className="px-3 py-1.5 text-xs font-medium bg-stone-200/80 hover:bg-stone-300/80 text-stone-800 rounded-lg transition-colors"
            >
              Hoje
            </button>
          )}
          <button
            type="button"
            disabled={sendingBackup}
            onClick={handleQuickTelegramBackup}
            className="flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold bg-sky-700 text-white rounded-lg hover:bg-sky-800 disabled:opacity-60 transition-colors whitespace-nowrap"
          >
            {sendingBackup ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Send className="w-3.5 h-3.5" />
            )}
            {sendingBackup ? 'Enviando...' : 'Backup Telegram'}
          </button>
          <button
            type="button"
            disabled={dailyOrders.length === 0}
            onClick={handleExportCsv}
            className="flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold bg-stone-900 text-white rounded-lg hover:bg-stone-800 disabled:opacity-50 transition-colors whitespace-nowrap"
          >
            <Download className="w-3.5 h-3.5" />
            Exportar CSV
          </button>
        </div>
      </div>

      {backupNotice && (
        <div
          className={`p-3 rounded-lg border text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-2 ${
            backupNotice.type === 'success'
              ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
              : 'bg-red-50 border-red-200 text-red-900'
          }`}
        >
          <span>{backupNotice.text}</span>
          {backupNotice.needsConfig && (
            <button
              type="button"
              onClick={onOpenSettings}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-stone-900 text-white rounded-md hover:bg-stone-800 shrink-0"
            >
              <Settings className="w-3.5 h-3.5" />
              Configurar Telegram
            </button>
          )}
        </div>
      )}

      {/* Channel Filter & Breakdown */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div className="flex items-center p-1 bg-stone-200/75 rounded-lg self-start overflow-x-auto">
          {(
            [
              { id: 'all', label: 'Todos os Canais', count: allDayOrders.length },
              { id: 'whatsapp', label: 'WhatsApp', count: channelStats.whatsapp.count },
              { id: 'ifood', label: 'iFood', count: channelStats.ifood.count },
              { id: '99food', label: '99Food', count: channelStats['99food'].count },
              { id: 'pdv', label: 'PDV', count: channelStats.pdv.count },
            ] as const
          ).map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setChannelFilter(tab.id)}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 flex items-center gap-1.5 ${
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

        <div className="flex flex-wrap items-center gap-3 text-xs text-stone-600">
          <span>
            WhatsApp:{' '}
            <strong className="font-mono text-emerald-700 tabular-nums">
              {formatBRL(channelStats.whatsapp.total)}
            </strong>
          </span>
          <span aria-hidden="true">·</span>
          <span>
            iFood:{' '}
            <strong className="font-mono text-red-700 tabular-nums">
              {formatBRL(channelStats.ifood.total)}
            </strong>
          </span>
          <span aria-hidden="true">·</span>
          <span>
            99Food:{' '}
            <strong className="font-mono text-amber-700 tabular-nums">
              {formatBRL(channelStats['99food'].total)}
            </strong>
          </span>
          <span aria-hidden="true">·</span>
          <span>
            PDV:{' '}
            <strong className="font-mono text-stone-800 tabular-nums">
              {formatBRL(channelStats.pdv.total)}
            </strong>
          </span>
        </div>
      </div>

      {/* KPI Summary Strip */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-[#FFFDF9]/95 border border-stone-200 rounded-lg p-4">
          <div className="text-xs text-stone-500">Valor Total Vendido ({formatDateLabel(selectedDate)})</div>
          <div className="text-2xl font-mono font-semibold text-emerald-700 tabular-nums mt-1">
            {formatBRL(summary.totalSold)}
          </div>
          <div className="text-[11px] text-stone-500 mt-1 font-mono tabular-nums">
            Recebido: {formatBRL(summary.totalPaid)} · Pendente: {formatBRL(summary.totalPending)}
          </div>
        </div>

        <div className="bg-[#FFFDF9]/95 border border-stone-200 rounded-lg p-4">
          <div className="text-xs text-stone-500">Pedidos no Dia</div>
          <div className="text-2xl font-mono font-semibold text-stone-900 tabular-nums mt-1">
            {dailyOrders.length}
          </div>
          <div className="text-[11px] text-stone-500 mt-1 font-mono tabular-nums">
            Entrega: {serviceStats.entrega} · Retirada: {serviceStats.retirada} · Mesa: {serviceStats.mesa}
          </div>
        </div>

        <div className="bg-[#FFFDF9]/95 border border-stone-200 rounded-lg p-4">
          <div className="text-xs text-stone-500">Itens / Pizzas Vendidas</div>
          <div className="text-2xl font-mono font-semibold text-orange-700 tabular-nums mt-1">
            {summary.totalItemsCount}
          </div>
          <div className="text-[11px] text-stone-500 mt-1">
            {summary.productsSold.length} variações no dia
          </div>
        </div>

        <div className="bg-[#FFFDF9]/95 border border-stone-200 rounded-lg p-4">
          <div className="text-xs text-stone-500">Ticket Médio</div>
          <div className="text-2xl font-mono font-semibold text-stone-900 tabular-nums mt-1">
            {formatBRL(summary.averageTicket)}
          </div>
          <div className="text-[11px] text-stone-500 mt-1 font-mono tabular-nums">
            Descontos/Cashback: {formatBRL(summary.totalDiscounts)}
          </div>
        </div>
      </div>

      {/* O que foi vendido no dia (Resumo por Produto) */}
      <div className="bg-[#FFFDF9]/95 border border-stone-200 rounded-lg overflow-hidden">
        <div className="px-4 py-3 border-b border-stone-200 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-stone-900 flex items-center gap-2">
            <Receipt className="w-4 h-4 text-orange-700" />
            O que foi vendido no dia
          </h2>
          <span className="text-xs font-mono text-stone-500 tabular-nums">
            {summary.totalItemsCount} itens
          </span>
        </div>

        {summary.productsSold.length === 0 ? (
          <div className="p-8 text-center text-xs text-stone-500">
            Nenhuma venda registrada em {formatDateLabel(selectedDate)}.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-stone-200 bg-[#FAF6F0] text-[11px] font-semibold text-stone-500">
                  <th className="py-2.5 px-4">Produto / Sabor</th>
                  <th className="py-2.5 px-4">Tamanho</th>
                  <th className="py-2.5 px-4 text-right">Quantidade Vendida</th>
                  <th className="py-2.5 px-4 text-right">Subtotal Vendido</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100 text-xs">
                {summary.productsSold.map((row) => (
                  <tr key={`${row.name}-${row.sizeLabel}`} className="hover:bg-stone-50/70">
                    <td className="py-2.5 px-4 font-medium text-stone-900">{row.name}</td>
                    <td className="py-2.5 px-4 text-stone-600">{row.sizeLabel}</td>
                    <td className="py-2.5 px-4 text-right font-mono tabular-nums text-stone-900">
                      {row.quantity}x
                    </td>
                    <td className="py-2.5 px-4 text-right font-mono font-semibold tabular-nums text-stone-900">
                      {formatBRL(row.revenue)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Valor de cada pedido + Valor Total */}
      <div className="bg-[#FFFDF9]/95 border border-stone-200 rounded-lg overflow-hidden">
        <div className="px-4 py-3 border-b border-stone-200 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-stone-900">
            Pedidos do Dia e Valores Individuais
          </h2>
          <span className="text-xs font-mono font-semibold text-emerald-700 tabular-nums">
            Total: {formatBRL(summary.totalSold)}
          </span>
        </div>

        {dailyOrders.length === 0 ? (
          <div className="p-8 text-center text-xs text-stone-500">
            Nenhum pedido encontrado para esta data.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-stone-200 bg-[#FAF6F0] text-[11px] font-semibold text-stone-500">
                  <th className="py-2.5 px-4">Pedido</th>
                  <th className="py-2.5 px-4">Canal</th>
                  <th className="py-2.5 px-4">Horário</th>
                  <th className="py-2.5 px-4">Cliente</th>
                  <th className="py-2.5 px-4">Itens Vendidos</th>
                  <th className="py-2.5 px-4">Pagamento</th>
                  <th className="py-2.5 px-4">Etapa</th>
                  <th className="py-2.5 px-4 text-right">Valor</th>
                  <th className="py-2.5 px-4 text-right">Origem</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100 text-xs">
                {dailyOrders.map((order) => {
                  const payMeta = formatPaymentStatus(order.payment.status);
                  const stageMeta = ORDER_STAGE_META[order.stage];
                  const chMeta = ORDER_CHANNEL_META[getOrderChannel(order.channel)];
                  const convId = order.conversationId;
                  return (
                    <tr key={order.id} className="hover:bg-stone-50/70">
                      <td className="py-3 px-4 font-mono font-semibold text-stone-900 tabular-nums">
                        <div>{order.code}</div>
                        {order.externalDisplayId && (
                          <div className="text-[11px] font-normal text-stone-400">
                            {order.externalDisplayId}
                          </div>
                        )}
                      </td>
                      <td className={`py-3 px-4 font-semibold ${chMeta.textColor}`}>
                        <div>{chMeta.shortLabel}</div>
                        <div className="text-[10px] font-normal text-stone-500">
                          {ORDER_SERVICE_TYPE_META[getOrderServiceType(order)].shortLabel}
                        </div>
                      </td>
                      <td className="py-3 px-4 font-mono text-stone-500 tabular-nums">
                        {formatTime(order.createdAt)}
                      </td>
                      <td className="py-3 px-4 font-medium text-stone-900">
                        {order.customerName}
                      </td>
                      <td className="py-3 px-4 text-stone-600 max-w-xs">
                        {order.items
                          .map(
                            (i) =>
                              `${i.quantity}x ${i.name}${i.size !== 'unico' ? ` (${i.size})` : ''}`
                          )
                          .join(', ')}
                      </td>
                      <td className={`py-3 px-4 font-medium ${payMeta.colorClass}`}>
                        {formatPaymentMethod(order.payment.method)} · {payMeta.label}
                      </td>
                      <td className={`py-3 px-4 font-medium ${stageMeta.textColor}`}>
                        {stageMeta.shortLabel}
                      </td>
                      <td className="py-3 px-4 text-right font-mono font-semibold text-stone-900 tabular-nums">
                        {formatBRL(order.total)}
                      </td>
                      <td className="py-3 px-4 text-right">
                        {convId ? (
                          <button
                            type="button"
                            onClick={() => onOpenChat(convId)}
                            className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-medium border border-stone-200 rounded hover:bg-stone-100 text-stone-700"
                          >
                            <MessageSquare className="w-3 h-3" />
                            Ver
                          </button>
                        ) : (
                          <span className="text-[11px] text-stone-400">Via {chMeta.label}</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-stone-200 bg-[#FAF6F0] text-xs font-semibold text-stone-900">
                  <td colSpan={7} className="py-3 px-4 text-right">
                    Valor Total das Vendas do Dia ({dailyOrders.length} pedidos):
                  </td>
                  <td className="py-3 px-4 text-right font-mono text-sm text-emerald-700 tabular-nums">
                    {formatBRL(summary.totalSold)}
                  </td>
                  <td />
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};
