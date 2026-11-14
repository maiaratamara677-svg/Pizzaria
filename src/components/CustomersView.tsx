import React, { useMemo, useState } from 'react';
import { MessageSquare, Search, UserCheck } from 'lucide-react';
import type { AppSnapshot } from '../types.ts';
import { formatBRL, formatDateTime, getOrderChannel, ORDER_CHANNEL_META } from '../utils/format.ts';

interface CustomersViewProps {
  snapshot: AppSnapshot;
  onOpenChat: (conversationId: string) => void;
}

export const CustomersView: React.FC<CustomersViewProps> = ({ snapshot, onOpenChat }) => {
  const [search, setSearch] = useState('');
  const [onlyAuto, setOnlyAuto] = useState<'all' | 'auto' | 'pending'>('all');

  const filtered = useMemo(() => {
    return snapshot.customers.filter((c) => {
      if (onlyAuto === 'auto' && !c.autoRegistered) return false;
      if (onlyAuto === 'pending' && c.autoRegistered) return false;
      if (!search.trim()) return true;
      const q = search.toLowerCase();
      return (
        c.name.toLowerCase().includes(q) ||
        c.phone.toLowerCase().includes(q) ||
        c.address.toLowerCase().includes(q) ||
        c.neighborhood.toLowerCase().includes(q)
      );
    });
  }, [snapshot.customers, search, onlyAuto]);

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">
            Clientes · Cadastro Automático via IA & Apps
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            Clientes atendidos pelo WhatsApp, iFood e 99Food são cadastrados e atualizados automaticamente aqui.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar por nome, telefone ou bairro..."
              className="pl-8 pr-3 py-1.5 text-xs bg-white border border-slate-200 rounded-md w-64 focus:outline-none focus:border-emerald-600"
            />
          </div>

          <div className="flex items-center p-1 bg-slate-200/70 rounded-lg">
            {[
              { id: 'all', label: 'Todos' },
              { id: 'auto', label: 'Auto-cadastrados' },
              { id: 'pending', label: 'Incompletos' },
            ].map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setOnlyAuto(tab.id as typeof onlyAuto)}
                className={`px-3 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                  onlyAuto === tab.id ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-[11px] font-semibold text-slate-500">
                <th className="py-2.5 px-4">Cliente</th>
                <th className="py-2.5 px-4">Contato</th>
                <th className="py-2.5 px-4">Endereço de Entrega</th>
                <th className="py-2.5 px-4">Cadastro</th>
                <th className="py-2.5 px-4 text-right">Pedidos</th>
                <th className="py-2.5 px-4 text-right">Total Gasto</th>
                <th className="py-2.5 px-4 text-right">Origem</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-xs">
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-10 text-center text-slate-500">
                    Nenhum cliente encontrado.
                  </td>
                </tr>
              ) : (
                filtered.map((customer) => {
                  const conv = snapshot.conversations.find(
                    (c) => c.customerId === customer.id
                  );
                  const chMeta = ORDER_CHANNEL_META[getOrderChannel(customer.channel)];
                  return (
                    <tr key={customer.id} className="hover:bg-slate-50/80">
                      <td className="py-3 px-4">
                        <div className="font-medium text-slate-900">{customer.name}</div>
                        <div className="text-[11px] text-slate-400 font-mono tabular-nums">
                          <span className={`font-sans font-semibold ${chMeta.textColor}`}>
                            {chMeta.label}
                          </span>{' '}
                          · Desde {formatDateTime(customer.registeredAt)}
                        </div>
                      </td>
                      <td className="py-3 px-4 font-mono text-slate-700 tabular-nums">
                        {customer.phone}
                      </td>
                      <td className="py-3 px-4 text-slate-600">
                        {customer.address ? (
                          <div>
                            <span>{customer.address}</span>
                            {customer.neighborhood && <span> · {customer.neighborhood}</span>}
                            {customer.complement && (
                              <div className="text-[11px] text-slate-400">
                                {customer.complement}
                              </div>
                            )}
                          </div>
                        ) : (
                          <span className="text-slate-400">Aguardando endereço no chat</span>
                        )}
                      </td>
                      <td className="py-3 px-4">
                        {customer.autoRegistered ? (
                          <span className="inline-flex items-center gap-1 text-emerald-700 font-medium">
                            <UserCheck className="w-3.5 h-3.5" />
                            {customer.channel && customer.channel !== 'whatsapp'
                              ? `Auto (${chMeta.label})`
                              : 'Auto-IA Completo'}
                          </span>
                        ) : (
                          <span className="text-amber-700 font-medium">Pendente no chat</span>
                        )}
                      </td>
                      <td className="py-3 px-4 text-right font-mono tabular-nums text-slate-900">
                        {customer.totalOrders}
                      </td>
                      <td className="py-3 px-4 text-right font-mono font-semibold tabular-nums text-slate-900">
                        {formatBRL(customer.totalSpent)}
                      </td>
                      <td className="py-3 px-4 text-right">
                        {conv ? (
                          <button
                            type="button"
                            onClick={() => onOpenChat(conv.id)}
                            className="inline-flex items-center gap-1.5 px-2.5 py-1 text-[11px] font-medium border border-slate-200 rounded-md text-slate-700 hover:bg-slate-100 transition-colors"
                          >
                            <MessageSquare className="w-3.5 h-3.5" />
                            Abrir
                          </button>
                        ) : (
                          <span className={`text-[11px] font-medium ${chMeta.textColor}`}>
                            Via {chMeta.label}
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
