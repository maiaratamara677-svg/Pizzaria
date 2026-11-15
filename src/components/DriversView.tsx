import React, { useMemo, useState } from 'react';
import { Bike, CheckCircle2, ExternalLink, Plus, Send, Trash2, X } from 'lucide-react';
import type { AppSnapshot, DeliveryDriver, Order } from '../types.ts';
import {
  buildDriverDispatchMessage,
  buildWhatsAppLink,
  formatBRL,
  getOrderServiceType,
} from '../utils/format.ts';

interface DriversViewProps {
  snapshot: AppSnapshot;
  onAddDriver: (input: { name: string; phone: string; vehicle?: string }) => Promise<void>;
  onUpdateDriver: (
    id: string,
    patch: Partial<Omit<DeliveryDriver, 'id' | 'createdAt'>>
  ) => Promise<void>;
  onDeleteDriver: (id: string) => Promise<void>;
  onOpenDriverDispatch: (order: Order) => void;
}

export const DriversView: React.FC<DriversViewProps> = ({
  snapshot,
  onAddDriver,
  onUpdateDriver,
  onDeleteDriver,
  onOpenDriverDispatch,
}) => {
  const [showAdd, setShowAdd] = useState(false);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('+55 11 9');
  const [vehicle, setVehicle] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const driverStats = useMemo(() => {
    const map = new Map<
      string,
      { activeOrders: Order[]; completedCount: number; totalValue: number }
    >();
    for (const d of snapshot.drivers) {
      map.set(d.id, { activeOrders: [], completedCount: 0, totalValue: 0 });
    }
    for (const order of snapshot.orders) {
      if (!order.driverId) continue;
      const entry = map.get(order.driverId);
      if (!entry) continue;
      if (order.stage === 'entregue') {
        entry.completedCount += 1;
        entry.totalValue += order.total;
      } else if (order.stage !== 'cancelado') {
        entry.activeOrders.push(order);
      }
    }
    return map;
  }, [snapshot.drivers, snapshot.orders]);

  const unassignedDeliveryOrders = useMemo(() => {
    return snapshot.orders.filter(
      (o) =>
        getOrderServiceType(o) === 'entrega' &&
        o.stage !== 'entregue' &&
        o.stage !== 'cancelado' &&
        !o.driverId
    );
  }, [snapshot.orders]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !phone.trim()) return;
    setSaving(true);
    setError(null);
    try {
      await onAddDriver({
        name: name.trim(),
        phone: phone.trim(),
        vehicle: vehicle.trim(),
      });
      setName('');
      setPhone('+55 11 9');
      setVehicle('');
      setShowAdd(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao cadastrar entregador.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-stone-900">
            Entregadores (Motoboys) & Despacho WhatsApp
          </h1>
          <p className="text-xs text-stone-600 mt-1">
            Cadastre seus motoboys com WhatsApp para atribuir pedidos e enviar endereço, itens e troco direto no celular deles.
          </p>
        </div>

        <button
          type="button"
          onClick={() => setShowAdd(!showAdd)}
          className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold bg-stone-900 text-white rounded-lg hover:bg-stone-800 transition-colors whitespace-nowrap shrink-0"
        >
          {showAdd ? <X className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
          {showAdd ? 'Fechar' : 'Cadastrar Entregador'}
        </button>
      </div>

      {error && (
        <div className="p-3 text-xs text-red-800 bg-red-50 border border-red-200 rounded-lg">
          {error}
        </div>
      )}

      {showAdd && (
        <form
          onSubmit={handleCreate}
          className="bg-[#FFFDF9]/95 border border-stone-200 rounded-lg p-5 grid grid-cols-1 sm:grid-cols-4 gap-3 items-end"
        >
          <div>
            <label className="block text-xs font-medium text-stone-700 mb-1">
              Nome do Motoboy
            </label>
            <input
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ex: Marcos Oliveira"
              className="w-full px-3 py-2 text-xs bg-white border border-stone-200 rounded-md"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-stone-700 mb-1">
              WhatsApp (com DDD)
            </label>
            <input
              type="text"
              required
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="+55 11 99999-0000"
              className="w-full px-3 py-2 text-xs font-mono bg-white border border-stone-200 rounded-md"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-stone-700 mb-1">
              Veículo / Placa (opcional)
            </label>
            <input
              type="text"
              value={vehicle}
              onChange={(e) => setVehicle(e.target.value)}
              placeholder="Ex: Moto Honda CG · ABC-1234"
              className="w-full px-3 py-2 text-xs bg-white border border-stone-200 rounded-md"
            />
          </div>
          <button
            type="submit"
            disabled={saving}
            className="px-4 py-2 text-xs font-semibold bg-emerald-700 text-white rounded-md hover:bg-emerald-800 disabled:opacity-60 transition-colors"
          >
            {saving ? 'Salvando...' : 'Salvar Entregador'}
          </button>
        </form>
      )}

      {/* Summary Strip */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-[#FFFDF9]/95 border border-stone-200 rounded-lg p-4">
          <div className="text-xs text-stone-500">Entregadores Cadastrados</div>
          <div className="text-2xl font-mono font-semibold text-stone-900 tabular-nums mt-1">
            {snapshot.drivers.length}
          </div>
        </div>
        <div className="bg-[#FFFDF9]/95 border border-stone-200 rounded-lg p-4">
          <div className="text-xs text-stone-500">Disponíveis Agora</div>
          <div className="text-2xl font-mono font-semibold text-emerald-700 tabular-nums mt-1">
            {snapshot.drivers.filter((d) => d.active).length}
          </div>
        </div>
        <div className="bg-[#FFFDF9]/95 border border-stone-200 rounded-lg p-4">
          <div className="text-xs text-stone-500">Entregas Aguardando Motoboy</div>
          <div className="text-2xl font-mono font-semibold text-amber-700 tabular-nums mt-1">
            {unassignedDeliveryOrders.length}
          </div>
        </div>
        <div className="bg-[#FFFDF9]/95 border border-stone-200 rounded-lg p-4">
          <div className="text-xs text-stone-500">Entregas Concluídas</div>
          <div className="text-2xl font-mono font-semibold text-stone-900 tabular-nums mt-1">
            {Array.from(driverStats.values()).reduce((s, e) => s + e.completedCount, 0)}
          </div>
        </div>
      </div>

      {/* Drivers Grid */}
      {snapshot.drivers.length === 0 ? (
        <div className="bg-[#FFFDF9]/95 border border-stone-200 rounded-lg p-8 text-center text-xs text-stone-500">
          Nenhum entregador cadastrado ainda. Clique em &ldquo;Cadastrar Entregador&rdquo; para começar.
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {snapshot.drivers.map((driver) => {
            const stats = driverStats.get(driver.id) ?? {
              activeOrders: [],
              completedCount: 0,
              totalValue: 0,
            };

            return (
              <div
                key={driver.id}
                className="bg-[#FFFDF9]/95 border border-stone-200 rounded-lg p-5 space-y-4"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-10 h-10 rounded-lg bg-stone-900 text-white flex items-center justify-center shrink-0">
                      <Bike className="w-5 h-5" />
                    </div>
                    <div className="min-w-0">
                      <div className="text-sm font-semibold text-stone-900 truncate">
                        {driver.name}
                      </div>
                      <div className="text-xs font-mono text-stone-500 tabular-nums">
                        {driver.phone} · {driver.vehicle || 'Moto'}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={() => onUpdateDriver(driver.id, { active: !driver.active })}
                      className={`px-2.5 py-1 text-[11px] font-semibold rounded-md border transition-colors ${
                        driver.active
                          ? 'bg-emerald-50 border-emerald-200 text-emerald-800 hover:bg-emerald-100'
                          : 'bg-stone-100 border-stone-200 text-stone-500 hover:bg-stone-200'
                      }`}
                    >
                      {driver.active ? 'Ativo' : 'Indisponível'}
                    </button>
                    <button
                      type="button"
                      onClick={() => onDeleteDriver(driver.id)}
                      className="p-1.5 text-stone-400 hover:text-red-700 rounded-md hover:bg-red-50 transition-colors"
                      title="Remover entregador"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3 pt-2 border-t border-stone-100 text-xs">
                  <div>
                    <span className="text-stone-500">Em rota / atribuídos:</span>{' '}
                    <strong className="font-mono text-stone-900 tabular-nums">
                      {stats.activeOrders.length}
                    </strong>
                  </div>
                  <div className="text-right">
                    <span className="text-stone-500">Concluídas:</span>{' '}
                    <strong className="font-mono text-emerald-700 tabular-nums">
                      {stats.completedCount} ({formatBRL(stats.totalValue)})
                    </strong>
                  </div>
                </div>

                {stats.activeOrders.length > 0 && (
                  <div className="space-y-2 pt-2 border-t border-stone-100">
                    <div className="text-[11px] font-semibold text-stone-500">
                      Pedidos atribuídos agora
                    </div>
                    {stats.activeOrders.map((order) => {
                      const msg = buildDriverDispatchMessage(
                        order,
                        driver,
                        snapshot.settings.pizzeriaName
                      );
                      const waLink = buildWhatsAppLink(driver.phone, msg);
                      return (
                        <div
                          key={order.id}
                          className="p-2.5 bg-[#FAF6F0] border border-stone-200 rounded-md flex items-center justify-between gap-2 text-xs"
                        >
                          <div className="min-w-0">
                            <div className="font-medium text-stone-900 truncate">
                              <span className="font-mono font-semibold">{order.code}</span> ·{' '}
                              {order.customerName}
                            </div>
                            <div className="text-[11px] text-stone-500 truncate">
                              {order.deliveryAddress}
                            </div>
                          </div>
                          <div className="flex items-center gap-1.5 shrink-0">
                            <button
                              type="button"
                              onClick={() => onOpenDriverDispatch(order)}
                              className="px-2.5 py-1 text-[11px] font-medium bg-white border border-stone-200 rounded hover:bg-stone-50 text-stone-700"
                            >
                              Ver Rota
                            </button>
                            <a
                              href={waLink}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-semibold bg-emerald-700 text-white rounded hover:bg-emerald-800"
                            >
                              <Send className="w-3 h-3" />
                              WhatsApp
                              <ExternalLink className="w-2.5 h-2.5" />
                            </a>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}

                {stats.activeOrders.length === 0 && (
                  <div className="flex items-center gap-1.5 text-[11px] text-stone-500 pt-1">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-700" />
                    <span>Livre para novas entregas em Pedidos & Cozinha.</span>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
