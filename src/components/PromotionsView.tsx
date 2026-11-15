import React, { useState } from 'react';
import { Percent, Plus, Save, Tag, Trash2, TrendingUp } from 'lucide-react';
import type { AppSnapshot, PromotionsConfig } from '../types.ts';
import { formatBRL, formatDateTime } from '../utils/format.ts';

interface PromotionsViewProps {
  snapshot: AppSnapshot;
  onAddCoupon: (input: {
    code: string;
    type: 'percent' | 'fixed';
    value: number;
    minOrder?: number;
  }) => Promise<void>;
  onToggleCoupon: (id: string, active: boolean) => Promise<void>;
  onDeleteCoupon: (id: string) => Promise<void>;
  onSavePromotions: (patch: Partial<PromotionsConfig>) => Promise<void>;
}

const CASHBACK_PRESETS = [2, 3, 5, 10, 15];

export const PromotionsView: React.FC<PromotionsViewProps> = ({
  snapshot,
  onAddCoupon,
  onToggleCoupon,
  onDeleteCoupon,
  onSavePromotions,
}) => {
  const [activeSubTab, setActiveSubTab] = useState<'cashback' | 'coupons' | 'progressive'>('cashback');

  const [cashbackDraft, setCashbackDraft] = useState(snapshot.promotions.cashback);
  const [progressiveEnabled, setProgressiveEnabled] = useState(
    snapshot.promotions.progressiveEnabled
  );
  const [tiersDraft, setTiersDraft] = useState(snapshot.promotions.progressiveTiers);
  const [savingPromo, setSavingPromo] = useState(false);
  const [promoFeedback, setPromoFeedback] = useState<string | null>(null);

  const [couponCode, setCouponCode] = useState('');
  const [couponType, setCouponType] = useState<'percent' | 'fixed'>('percent');
  const [couponValue, setCouponValue] = useState('10');
  const [couponMinOrder, setCouponMinOrder] = useState('50');
  const [creatingCoupon, setCreatingCoupon] = useState(false);
  const [couponError, setCouponError] = useState<string | null>(null);

  const customersWithCashback = snapshot.customers.filter(
    (c) => (c.cashbackBalance ?? 0) > 0
  );

  const handleSaveCashback = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingPromo(true);
    setPromoFeedback(null);
    try {
      await onSavePromotions({ cashback: cashbackDraft });
      setPromoFeedback('Regras de Cashback atualizadas e ativas no WhatsApp IA e PDV.');
      setTimeout(() => setPromoFeedback(null), 3000);
    } finally {
      setSavingPromo(false);
    }
  };

  const handleCreateCoupon = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreatingCoupon(true);
    setCouponError(null);
    try {
      await onAddCoupon({
        code: couponCode.trim().toUpperCase(),
        type: couponType,
        value: Number(couponValue) || 10,
        minOrder: Number(couponMinOrder) > 0 ? Number(couponMinOrder) : undefined,
      });
      setCouponCode('');
    } catch (err) {
      setCouponError(err instanceof Error ? err.message : 'Erro ao criar cupom.');
    } finally {
      setCreatingCoupon(false);
    }
  };

  const handleSaveProgressive = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingPromo(true);
    setPromoFeedback(null);
    try {
      await onSavePromotions({
        progressiveEnabled,
        progressiveTiers: tiersDraft,
      });
      setPromoFeedback('Desconto progressivo salvo e ativo para pedidos no WhatsApp e PDV.');
      setTimeout(() => setPromoFeedback(null), 3000);
    } finally {
      setSavingPromo(false);
    }
  };

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-stone-900">
            Fidelidade & Promoções (Cashback, Cupons & Desconto Progressivo)
          </h1>
          <p className="text-xs text-stone-600 mt-1">
            Incentive pedidos recorrentes e tickets maiores — a IA do WhatsApp e o PDV aplicam essas regras automaticamente.
          </p>
        </div>

        <div className="flex items-center p-1 bg-stone-200/80 rounded-lg self-start">
          {(
            [
              { id: 'cashback', label: 'Cashback' },
              { id: 'coupons', label: 'Cupons' },
              { id: 'progressive', label: 'Desconto Progressivo' },
            ] as const
          ).map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveSubTab(tab.id)}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                activeSubTab === tab.id
                  ? 'bg-white text-stone-900 shadow-xs font-semibold'
                  : 'text-stone-600 hover:text-stone-900'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {promoFeedback && (
        <div className="p-3 text-xs text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-lg">
          {promoFeedback}
        </div>
      )}

      {activeSubTab === 'cashback' && (
        <div className="space-y-6">
          <form
            onSubmit={handleSaveCashback}
            className="bg-[#FFFDF9]/95 border border-stone-200 rounded-lg p-5 space-y-4"
          >
            <div className="flex items-center justify-between gap-4 border-b border-stone-100 pb-3">
              <div className="flex items-center gap-2">
                <Percent className="w-4 h-4 text-emerald-700" />
                <h2 className="text-sm font-semibold text-stone-900">
                  Cashback Automático por Pedido
                </h2>
              </div>
              <label className="inline-flex items-center gap-2 text-xs font-medium text-stone-700 cursor-pointer">
                <input
                  type="checkbox"
                  checked={cashbackDraft.enabled}
                  onChange={(e) =>
                    setCashbackDraft({ ...cashbackDraft, enabled: e.target.checked })
                  }
                  className="rounded border-stone-300 text-emerald-700"
                />
                <span>{cashbackDraft.enabled ? 'Cashback Ativo' : 'Pausado'}</span>
              </label>
            </div>

            <div className="space-y-2">
              <label className="block text-xs font-medium text-stone-700">
                Percentual de Cashback devolvido ao cliente
              </label>
              <div className="flex flex-wrap items-center gap-2">
                {CASHBACK_PRESETS.map((pct) => (
                  <button
                    key={pct}
                    type="button"
                    onClick={() => setCashbackDraft({ ...cashbackDraft, percent: pct })}
                    className={`px-3 py-1.5 text-xs font-mono font-semibold rounded-md border transition-colors ${
                      cashbackDraft.percent === pct
                        ? 'bg-emerald-700 text-white border-emerald-700'
                        : 'bg-white text-stone-700 border-stone-200 hover:bg-stone-50'
                    }`}
                  >
                    {pct}%
                  </button>
                ))}
                <div className="flex items-center gap-1.5 ml-2">
                  <span className="text-xs text-stone-500">Outro:</span>
                  <input
                    type="number"
                    min="1"
                    max="50"
                    value={cashbackDraft.percent}
                    onChange={(e) =>
                      setCashbackDraft({
                        ...cashbackDraft,
                        percent: Math.max(0, Number(e.target.value) || 0),
                      })
                    }
                    className="w-16 px-2.5 py-1.5 text-xs font-mono bg-white border border-stone-200 rounded-md"
                  />
                  <span className="text-xs text-stone-500">%</span>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-stone-700 mb-1">
                  Validade do Cashback (dias)
                </label>
                <input
                  type="number"
                  min="1"
                  max="365"
                  value={cashbackDraft.validityDays}
                  onChange={(e) =>
                    setCashbackDraft({
                      ...cashbackDraft,
                      validityDays: Math.max(1, Number(e.target.value) || 15),
                    })
                  }
                  className="w-full px-3 py-2 text-xs font-mono bg-white border border-stone-200 rounded-md"
                />
                <p className="text-[11px] text-stone-500 mt-1">
                  Padrão recomendado: 15 dias para estimular o cliente a pedir novamente logo.
                </p>
              </div>
              <div>
                <label className="block text-xs font-medium text-stone-700 mb-1">
                  Pedido Mínimo para Gerar Cashback (R$)
                </label>
                <input
                  type="number"
                  min="0"
                  step="5"
                  value={cashbackDraft.minOrderValue}
                  onChange={(e) =>
                    setCashbackDraft({
                      ...cashbackDraft,
                      minOrderValue: Math.max(0, Number(e.target.value) || 0),
                    })
                  }
                  className="w-full px-3 py-2 text-xs font-mono bg-white border border-stone-200 rounded-md"
                />
              </div>
            </div>

            <div className="flex justify-end">
              <button
                type="submit"
                disabled={savingPromo}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold bg-emerald-700 text-white rounded-lg hover:bg-emerald-800 disabled:opacity-60"
              >
                <Save className="w-3.5 h-3.5" />
                {savingPromo ? 'Salvando...' : 'Salvar Regra de Cashback'}
              </button>
            </div>
          </form>

          {/* Customers with active cashback */}
          <div className="bg-[#FFFDF9]/95 border border-stone-200 rounded-lg overflow-hidden">
            <div className="px-4 py-3 border-b border-stone-200 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-stone-900">
                Clientes com Saldo de Cashback Ativo
              </h3>
              <span className="text-xs font-mono text-stone-500 tabular-nums">
                {customersWithCashback.length} clientes
              </span>
            </div>
            {customersWithCashback.length === 0 ? (
              <div className="p-6 text-center text-xs text-stone-500">
                Nenhum cliente possui saldo de cashback no momento. Assim que um pedido pago for confirmado, o saldo aparece aqui.
              </div>
            ) : (
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-stone-200 bg-[#FAF6F0] text-[11px] font-semibold text-stone-500">
                    <th className="py-2.5 px-4">Cliente</th>
                    <th className="py-2.5 px-4">WhatsApp</th>
                    <th className="py-2.5 px-4">Validade</th>
                    <th className="py-2.5 px-4 text-right">Saldo Disponível</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-stone-100 text-xs">
                  {customersWithCashback.map((c) => (
                    <tr key={c.id} className="hover:bg-stone-50/70">
                      <td className="py-2.5 px-4 font-medium text-stone-900">{c.name}</td>
                      <td className="py-2.5 px-4 font-mono text-stone-600 tabular-nums">
                        {c.phone}
                      </td>
                      <td className="py-2.5 px-4 font-mono text-stone-500 tabular-nums">
                        {c.cashbackExpiresAt ? formatDateTime(c.cashbackExpiresAt) : '15 dias'}
                      </td>
                      <td className="py-2.5 px-4 text-right font-mono font-semibold text-emerald-700 tabular-nums">
                        {formatBRL(c.cashbackBalance ?? 0)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}

      {activeSubTab === 'coupons' && (
        <div className="space-y-6">
          <form
            onSubmit={handleCreateCoupon}
            className="bg-[#FFFDF9]/95 border border-stone-200 rounded-lg p-5 space-y-4"
          >
            <div className="flex items-center gap-2 border-b border-stone-100 pb-2">
              <Tag className="w-4 h-4 text-orange-700" />
              <h2 className="text-sm font-semibold text-stone-900">Criar Novo Cupom</h2>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-5 gap-3 items-end">
              <div>
                <label className="block text-xs font-medium text-stone-700 mb-1">
                  Código do Cupom
                </label>
                <input
                  type="text"
                  required
                  value={couponCode}
                  onChange={(e) => setCouponCode(e.target.value.toUpperCase())}
                  placeholder="EX: QUEROPIZZA"
                  className="w-full px-3 py-2 text-xs font-mono uppercase bg-white border border-stone-200 rounded-md"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-stone-700 mb-1">Tipo</label>
                <select
                  value={couponType}
                  onChange={(e) => setCouponType(e.target.value as 'percent' | 'fixed')}
                  className="w-full px-3 py-2 text-xs bg-white border border-stone-200 rounded-md"
                >
                  <option value="percent">Percentual (%)</option>
                  <option value="fixed">Valor Fixo (R$)</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-stone-700 mb-1">
                  {couponType === 'percent' ? 'Desconto (%)' : 'Desconto (R$)'}
                </label>
                <input
                  type="number"
                  min="1"
                  step="0.5"
                  required
                  value={couponValue}
                  onChange={(e) => setCouponValue(e.target.value)}
                  className="w-full px-3 py-2 text-xs font-mono bg-white border border-stone-200 rounded-md"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-stone-700 mb-1">
                  Pedido Mínimo (R$)
                </label>
                <input
                  type="number"
                  min="0"
                  step="5"
                  value={couponMinOrder}
                  onChange={(e) => setCouponMinOrder(e.target.value)}
                  className="w-full px-3 py-2 text-xs font-mono bg-white border border-stone-200 rounded-md"
                />
              </div>
              <button
                type="submit"
                disabled={creatingCoupon}
                className="inline-flex items-center justify-center gap-1.5 px-4 py-2 text-xs font-semibold bg-stone-900 text-white rounded-md hover:bg-stone-800 disabled:opacity-60"
              >
                <Plus className="w-3.5 h-3.5" />
                {creatingCoupon ? 'Criando...' : 'Criar Cupom'}
              </button>
            </div>

            {couponError && (
              <div className="p-2.5 text-xs text-red-800 bg-red-50 border border-red-200 rounded-md">
                {couponError}
              </div>
            )}
          </form>

          <div className="bg-[#FFFDF9]/95 border border-stone-200 rounded-lg overflow-hidden">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-stone-200 bg-[#FAF6F0] text-[11px] font-semibold text-stone-500">
                  <th className="py-2.5 px-4">Código</th>
                  <th className="py-2.5 px-4">Desconto</th>
                  <th className="py-2.5 px-4">Pedido Mínimo</th>
                  <th className="py-2.5 px-4 text-right">Usos</th>
                  <th className="py-2.5 px-4">Status</th>
                  <th className="py-2.5 px-4 text-right">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100 text-xs">
                {snapshot.coupons.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-8 text-center text-stone-500">
                      Nenhum cupom cadastrado.
                    </td>
                  </tr>
                ) : (
                  snapshot.coupons.map((cpn) => (
                    <tr key={cpn.id} className="hover:bg-stone-50/70">
                      <td className="py-3 px-4 font-mono font-bold text-stone-900">{cpn.code}</td>
                      <td className="py-3 px-4 font-mono font-semibold text-emerald-700 tabular-nums">
                        {cpn.type === 'percent' ? `${cpn.value}% OFF` : `${formatBRL(cpn.value)} OFF`}
                      </td>
                      <td className="py-3 px-4 font-mono text-stone-600 tabular-nums">
                        {cpn.minOrder ? formatBRL(cpn.minOrder) : 'Sem mínimo'}
                      </td>
                      <td className="py-3 px-4 text-right font-mono tabular-nums text-stone-800">
                        {cpn.usageCount}
                      </td>
                      <td className="py-3 px-4">
                        <button
                          type="button"
                          onClick={() => onToggleCoupon(cpn.id, !cpn.active)}
                          className={`px-2.5 py-0.5 text-[11px] font-semibold rounded border ${
                            cpn.active
                              ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                              : 'bg-stone-100 border-stone-200 text-stone-500'
                          }`}
                        >
                          {cpn.active ? 'Ativo' : 'Pausado'}
                        </button>
                      </td>
                      <td className="py-3 px-4 text-right">
                        <button
                          type="button"
                          onClick={() => onDeleteCoupon(cpn.id)}
                          className="p-1.5 text-stone-400 hover:text-red-700 rounded hover:bg-red-50"
                          title="Excluir cupom"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {activeSubTab === 'progressive' && (
        <form
          onSubmit={handleSaveProgressive}
          className="bg-[#FFFDF9]/95 border border-stone-200 rounded-lg p-5 space-y-4"
        >
          <div className="flex items-center justify-between gap-4 border-b border-stone-100 pb-3">
            <div className="flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-orange-700" />
              <div>
                <h2 className="text-sm font-semibold text-stone-900">
                  Desconto Progressivo por Quantidade de Pizzas
                </h2>
                <p className="text-[11px] text-stone-500">
                  Quanto mais pizzas o cliente pedir no mesmo pedido, maior o desconto automático.
                </p>
              </div>
            </div>
            <label className="inline-flex items-center gap-2 text-xs font-medium text-stone-700 cursor-pointer">
              <input
                type="checkbox"
                checked={progressiveEnabled}
                onChange={(e) => setProgressiveEnabled(e.target.checked)}
                className="rounded border-stone-300 text-emerald-700"
              />
              <span>{progressiveEnabled ? 'Ativo' : 'Pausado'}</span>
            </label>
          </div>

          <div className="space-y-2.5">
            {tiersDraft.map((tier, idx) => (
              <div
                key={tier.id}
                className="flex flex-wrap items-center gap-3 p-3 bg-[#FAF6F0] border border-stone-200 rounded-lg text-xs"
              >
                <span className="text-stone-600">A partir de</span>
                <input
                  type="number"
                  min="2"
                  max="20"
                  value={tier.minItems}
                  onChange={(e) => {
                    const next = [...tiersDraft];
                    next[idx] = { ...tier, minItems: Math.max(2, Number(e.target.value) || 2) };
                    setTiersDraft(next);
                  }}
                  className="w-16 px-2.5 py-1.5 font-mono bg-white border border-stone-200 rounded-md"
                />
                <span className="text-stone-600">pizzas → aplicar</span>
                <input
                  type="number"
                  min="1"
                  max="50"
                  value={tier.discountPercent}
                  onChange={(e) => {
                    const next = [...tiersDraft];
                    next[idx] = {
                      ...tier,
                      discountPercent: Math.max(1, Number(e.target.value) || 1),
                    };
                    setTiersDraft(next);
                  }}
                  className="w-16 px-2.5 py-1.5 font-mono bg-white border border-stone-200 rounded-md"
                />
                <span className="text-stone-700 font-semibold">% de desconto</span>

                <button
                  type="button"
                  onClick={() => setTiersDraft(tiersDraft.filter((_, i) => i !== idx))}
                  className="ml-auto p-1.5 text-stone-400 hover:text-red-700"
                  title="Remover faixa"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>

          <div className="flex items-center justify-between pt-2">
            <button
              type="button"
              onClick={() =>
                setTiersDraft([
                  ...tiersDraft,
                  {
                    id: `prog-${Date.now()}`,
                    minItems: (tiersDraft[tiersDraft.length - 1]?.minItems ?? 1) + 1,
                    discountPercent:
                      (tiersDraft[tiersDraft.length - 1]?.discountPercent ?? 5) + 5,
                  },
                ])
              }
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-white border border-stone-300 text-stone-700 rounded-md hover:bg-stone-50"
            >
              <Plus className="w-3.5 h-3.5" />
              Adicionar Faixa
            </button>

            <button
              type="submit"
              disabled={savingPromo}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold bg-emerald-700 text-white rounded-lg hover:bg-emerald-800 disabled:opacity-60"
            >
              <Save className="w-3.5 h-3.5" />
              {savingPromo ? 'Salvando...' : 'Salvar Desconto Progressivo'}
            </button>
          </div>
        </form>
      )}
    </div>
  );
};
