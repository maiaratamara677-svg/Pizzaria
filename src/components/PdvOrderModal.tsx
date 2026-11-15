import React, { useMemo, useState } from 'react';
import { Minus, Plus, ShoppingBag, Trash2, X } from 'lucide-react';
import type {
  AppSnapshot,
  OrderItem,
  OrderServiceType,
  PaymentMethod,
} from '../types.ts';
import { formatBRL } from '../utils/format.ts';

export interface PdvOrderPayload {
  customerName: string;
  customerPhone?: string;
  serviceType: OrderServiceType;
  tableNumber?: string;
  deliveryAddress?: string;
  neighborhood?: string;
  complement?: string;
  items: {
    menuItemId: string;
    size: OrderItem['size'];
    crust?: string;
    quantity: number;
    notes?: string;
  }[];
  paymentMethod: PaymentMethod;
  paidNow?: boolean;
  changeFor?: number;
  couponCode?: string;
  useCashback?: boolean;
  orderNotes?: string;
}

interface PdvOrderModalProps {
  snapshot: AppSnapshot;
  onClose: () => void;
  onCreateOrder: (payload: PdvOrderPayload) => Promise<void>;
}

interface CartRow {
  key: string;
  menuItemId: string;
  name: string;
  size: OrderItem['size'];
  crust: string;
  unitPrice: number;
  quantity: number;
  isDrink: boolean;
}

export const PdvOrderModal: React.FC<PdvOrderModalProps> = ({
  snapshot,
  onClose,
  onCreateOrder,
}) => {
  const [serviceType, setServiceType] = useState<OrderServiceType>('entrega');
  const [tableNumber, setTableNumber] = useState('01');
  const [customerPhone, setCustomerPhone] = useState('');
  const [customerName, setCustomerName] = useState('');
  const [deliveryAddress, setDeliveryAddress] = useState('');
  const [neighborhood, setNeighborhood] = useState('');
  const [complement, setComplement] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('pix');
  const [paidNow, setPaidNow] = useState(true);
  const [changeFor, setChangeFor] = useState('');
  const [couponCode, setCouponCode] = useState('');
  const [useCashback, setUseCashback] = useState(false);
  const [orderNotes, setOrderNotes] = useState('');

  const [selectedSize, setSelectedSize] = useState<'media' | 'grande' | 'gigante'>('grande');
  const [selectedCrust, setSelectedCrust] = useState('Tradicional');
  const [cart, setCart] = useState<CartRow[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const matchedCustomer = useMemo(() => {
    const digits = customerPhone.replace(/\D/g, '');
    if (digits.length < 8) return undefined;
    return snapshot.customers.find((c) => c.phone.replace(/\D/g, '') === digits);
  }, [snapshot.customers, customerPhone]);

  const handleSelectExistingCustomer = (custId: string) => {
    const c = snapshot.customers.find((item) => item.id === custId);
    if (!c) return;
    setCustomerName(c.name);
    setCustomerPhone(c.phone);
    setDeliveryAddress(c.address);
    setNeighborhood(c.neighborhood);
    setComplement(c.complement);
  };

  const addMenuItemToCart = (menuId: string) => {
    const item = snapshot.menu.find((m) => m.id === menuId);
    if (!item) return;
    const isDrink = item.category === 'Bebidas';
    const size: OrderItem['size'] = isDrink ? 'unico' : selectedSize;
    const crust = isDrink ? '' : selectedCrust;
    const basePrice =
      size === 'media'
        ? (item.prices.media ?? item.prices.grande)
        : size === 'gigante'
          ? (item.prices.gigante ?? item.prices.grande)
          : item.prices.grande;
    const crustExtra = crust && /catupiry|cheddar/i.test(crust) ? 16 : 0;
    const unitPrice = basePrice + crustExtra;
    const key = `${item.id}__${size}__${crust}`;

    setCart((prev) => {
      const existing = prev.find((r) => r.key === key);
      if (existing) {
        return prev.map((r) => (r.key === key ? { ...r, quantity: r.quantity + 1 } : r));
      }
      return [
        ...prev,
        {
          key,
          menuItemId: item.id,
          name: item.name,
          size,
          crust,
          unitPrice,
          quantity: 1,
          isDrink,
        },
      ];
    });
  };

  const updateCartQty = (key: string, delta: number) => {
    setCart((prev) =>
      prev
        .map((r) => (r.key === key ? { ...r, quantity: r.quantity + delta } : r))
        .filter((r) => r.quantity > 0)
    );
  };

  const pricing = useMemo(() => {
    const subtotal = cart.reduce((sum, r) => sum + r.unitPrice * r.quantity, 0);
    const deliveryFee = serviceType === 'entrega' ? snapshot.settings.deliveryFee : 0;

    let progressiveDiscount = 0;
    if (snapshot.promotions.progressiveEnabled && snapshot.promotions.progressiveTiers.length > 0) {
      const pizzaQty = cart.reduce((sum, r) => (r.isDrink ? sum : sum + r.quantity), 0);
      const tier = snapshot.promotions.progressiveTiers
        .filter((t) => pizzaQty >= t.minItems)
        .sort((a, b) => b.discountPercent - a.discountPercent)[0];
      if (tier) {
        progressiveDiscount = Math.round(subtotal * (tier.discountPercent / 100) * 100) / 100;
      }
    }

    let couponDiscount = 0;
    const normalizedCoupon = couponCode.trim().toUpperCase();
    const matchedCoupon = normalizedCoupon
      ? snapshot.coupons.find((c) => c.active && c.code.toUpperCase() === normalizedCoupon)
      : undefined;
    if (matchedCoupon && subtotal >= (matchedCoupon.minOrder ?? 0)) {
      couponDiscount =
        matchedCoupon.type === 'percent'
          ? Math.round(subtotal * (matchedCoupon.value / 100) * 100) / 100
          : Math.min(subtotal, matchedCoupon.value);
    }

    const availableCashback = matchedCustomer?.cashbackBalance ?? 0;
    const afterPromo = Math.max(0, subtotal + deliveryFee - progressiveDiscount - couponDiscount);
    const cashbackUsed =
      useCashback && availableCashback > 0
        ? Math.round(Math.min(availableCashback, afterPromo) * 100) / 100
        : 0;

    const total = Math.max(
      0,
      Math.round((subtotal + deliveryFee - progressiveDiscount - couponDiscount - cashbackUsed) * 100) / 100
    );

    const parsedChangeFor = Number(changeFor.replace(',', '.'));
    const changeAmount =
      paymentMethod === 'dinheiro' &&
      Number.isFinite(parsedChangeFor) &&
      parsedChangeFor > total
        ? Math.round((parsedChangeFor - total) * 100) / 100
        : 0;

    return {
      subtotal,
      deliveryFee,
      progressiveDiscount,
      couponDiscount,
      matchedCoupon,
      availableCashback,
      cashbackUsed,
      total,
      changeAmount,
    };
  }, [
    cart,
    serviceType,
    snapshot.settings.deliveryFee,
    snapshot.promotions,
    snapshot.coupons,
    couponCode,
    matchedCustomer,
    useCashback,
    paymentMethod,
    changeFor,
  ]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (cart.length === 0) {
      setError('Adicione pelo menos 1 item do cardápio.');
      return;
    }
    if (serviceType === 'entrega' && !deliveryAddress.trim()) {
      setError('Informe o endereço de entrega para pedidos Delivery.');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const parsedChange = Number(changeFor.replace(',', '.'));
      await onCreateOrder({
        customerName:
          customerName.trim() ||
          (serviceType === 'mesa' ? `Mesa ${tableNumber}` : 'Cliente Balcão'),
        customerPhone: customerPhone.trim() || undefined,
        serviceType,
        tableNumber: serviceType === 'mesa' ? tableNumber.trim() : undefined,
        deliveryAddress: serviceType === 'entrega' ? deliveryAddress.trim() : undefined,
        neighborhood: serviceType === 'entrega' ? neighborhood.trim() : undefined,
        complement: serviceType === 'entrega' ? complement.trim() : undefined,
        items: cart.map((r) => ({
          menuItemId: r.menuItemId,
          size: r.size,
          crust: r.crust || undefined,
          quantity: r.quantity,
        })),
        paymentMethod,
        paidNow,
        changeFor:
          paymentMethod === 'dinheiro' && Number.isFinite(parsedChange) && parsedChange > 0
            ? parsedChange
            : undefined,
        couponCode: pricing.matchedCoupon?.code,
        useCashback,
        orderNotes: orderNotes.trim() || undefined,
      });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao lançar pedido.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-stone-950/60 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-[#FFFDF9] border border-stone-200 rounded-xl w-full max-w-4xl shadow-xl overflow-hidden flex flex-col max-h-[92vh]">
        <div className="px-5 py-3.5 border-b border-stone-200 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ShoppingBag className="w-4 h-4 text-orange-700" />
            <h2 className="text-sm font-semibold text-stone-900">
              Novo Pedido Rápido · PDV (Balcão / Mesa / Entrega)
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 text-stone-400 hover:text-stone-800"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-[1.2fr_1fr] overflow-y-auto">
          {/* Left: Menu Picker */}
          <div className="p-5 border-b lg:border-b-0 lg:border-r border-stone-200 space-y-4 overflow-y-auto">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-1 p-1 bg-stone-100 rounded-lg">
                {(['media', 'grande', 'gigante'] as const).map((sz) => (
                  <button
                    key={sz}
                    type="button"
                    onClick={() => setSelectedSize(sz)}
                    className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                      selectedSize === sz ? 'bg-white text-stone-900 shadow-xs font-semibold' : 'text-stone-600'
                    }`}
                  >
                    {sz === 'media' ? 'Média (M)' : sz === 'grande' ? 'Grande (G)' : 'Gigante (GG)'}
                  </button>
                ))}
              </div>

              <select
                value={selectedCrust}
                onChange={(e) => setSelectedCrust(e.target.value)}
                className="px-2.5 py-1.5 text-xs bg-white border border-stone-200 rounded-md"
              >
                <option value="Tradicional">Borda Tradicional</option>
                <option value="Catupiry (+R$ 16)">Borda Catupiry (+R$ 16)</option>
                <option value="Cheddar (+R$ 16)">Borda Cheddar (+R$ 16)</option>
              </select>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              {snapshot.menu
                .filter((m) => m.available)
                .map((item) => {
                  const isDrink = item.category === 'Bebidas';
                  const price = isDrink
                    ? item.prices.grande
                    : selectedSize === 'media'
                      ? (item.prices.media ?? item.prices.grande)
                      : selectedSize === 'gigante'
                        ? (item.prices.gigante ?? item.prices.grande)
                        : item.prices.grande;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => addMenuItemToCart(item.id)}
                      className="text-left p-3 bg-white border border-stone-200 rounded-lg hover:border-orange-500 hover:bg-orange-50/40 transition-colors flex items-center justify-between gap-2"
                    >
                      <div className="min-w-0">
                        <div className="text-xs font-semibold text-stone-900 truncate">{item.name}</div>
                        <div className="text-[11px] text-stone-500">{item.category}</div>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <span className="text-xs font-mono font-semibold text-stone-900 tabular-nums">
                          {formatBRL(price)}
                        </span>
                        <span className="w-6 h-6 rounded-md bg-stone-900 text-white flex items-center justify-center">
                          <Plus className="w-3.5 h-3.5" />
                        </span>
                      </div>
                    </button>
                  );
                })}
            </div>

            {/* Cart summary */}
            <div className="bg-[#FAF6F0] border border-stone-200 rounded-lg p-3.5 space-y-2.5">
              <div className="text-xs font-semibold text-stone-900">
                Itens Selecionados ({cart.reduce((s, r) => s + r.quantity, 0)})
              </div>
              {cart.length === 0 ? (
                <div className="text-xs text-stone-500 py-2">
                  Clique nos sabores acima para montar o pedido.
                </div>
              ) : (
                <div className="divide-y divide-stone-200/70">
                  {cart.map((row) => (
                    <div key={row.key} className="py-2 flex items-center justify-between gap-2 text-xs">
                      <div className="min-w-0">
                        <div className="font-medium text-stone-900 truncate">
                          {row.name} {!row.isDrink ? `(${row.size})` : ''}
                        </div>
                        {row.crust && row.crust !== 'Tradicional' && (
                          <div className="text-[11px] text-stone-500">Borda {row.crust}</div>
                        )}
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <button
                          type="button"
                          onClick={() => updateCartQty(row.key, -1)}
                          className="w-6 h-6 rounded border border-stone-300 bg-white flex items-center justify-center hover:bg-stone-100"
                        >
                          {row.quantity === 1 ? <Trash2 className="w-3 h-3 text-red-600" /> : <Minus className="w-3 h-3" />}
                        </button>
                        <span className="font-mono font-semibold w-4 text-center tabular-nums">
                          {row.quantity}
                        </span>
                        <button
                          type="button"
                          onClick={() => updateCartQty(row.key, 1)}
                          className="w-6 h-6 rounded border border-stone-300 bg-white flex items-center justify-center hover:bg-stone-100"
                        >
                          <Plus className="w-3 h-3" />
                        </button>
                        <span className="font-mono font-semibold text-stone-900 w-16 text-right tabular-nums">
                          {formatBRL(row.unitPrice * row.quantity)}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Right: Customer, Service Type, Payment */}
          <div className="p-5 space-y-3.5 overflow-y-auto">
            <div>
              <label className="block text-xs font-medium text-stone-700 mb-1">
                Tipo de Atendimento
              </label>
              <div className="grid grid-cols-3 gap-1.5 p-1 bg-stone-100 rounded-lg">
                {(
                  [
                    { id: 'entrega', label: 'Entrega' },
                    { id: 'retirada', label: 'Retirada' },
                    { id: 'mesa', label: 'Mesa / Local' },
                  ] as const
                ).map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => setServiceType(t.id)}
                    className={`py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                      serviceType === t.id
                        ? 'bg-white text-stone-900 shadow-xs font-semibold'
                        : 'text-stone-600'
                    }`}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-stone-700 mb-1">
                Cliente Cadastrado (opcional)
              </label>
              <select
                onChange={(e) => handleSelectExistingCustomer(e.target.value)}
                defaultValue=""
                className="w-full px-3 py-1.5 text-xs bg-white border border-stone-200 rounded-md"
              >
                <option value="">Selecionar cliente da base...</option>
                {snapshot.customers.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} · {c.phone}
                    {(c.cashbackBalance ?? 0) > 0 ? ` (Cashback ${formatBRL(c.cashbackBalance ?? 0)})` : ''}
                  </option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-2 gap-2.5">
              <div>
                <label className="block text-[11px] font-medium text-stone-700 mb-1">
                  Nome do Cliente
                </label>
                <input
                  type="text"
                  value={customerName}
                  onChange={(e) => setCustomerName(e.target.value)}
                  placeholder={serviceType === 'mesa' ? 'Ex: João (Mesa 04)' : 'Nome do cliente'}
                  className="w-full px-2.5 py-1.5 text-xs bg-white border border-stone-200 rounded-md"
                />
              </div>
              <div>
                <label className="block text-[11px] font-medium text-stone-700 mb-1">
                  WhatsApp / Telefone
                </label>
                <input
                  type="text"
                  value={customerPhone}
                  onChange={(e) => setCustomerPhone(e.target.value)}
                  placeholder="+55 11 9..."
                  className="w-full px-2.5 py-1.5 text-xs font-mono bg-white border border-stone-200 rounded-md"
                />
              </div>
            </div>

            {serviceType === 'mesa' && (
              <div>
                <label className="block text-[11px] font-medium text-stone-700 mb-1">
                  Número da Mesa
                </label>
                <input
                  type="text"
                  value={tableNumber}
                  onChange={(e) => setTableNumber(e.target.value)}
                  placeholder="Ex: 04"
                  className="w-full px-2.5 py-1.5 text-xs font-mono bg-white border border-stone-200 rounded-md"
                />
              </div>
            )}

            {serviceType === 'entrega' && (
              <div className="space-y-2">
                <div>
                  <label className="block text-[11px] font-medium text-stone-700 mb-1">
                    Endereço de Entrega
                  </label>
                  <input
                    type="text"
                    value={deliveryAddress}
                    onChange={(e) => setDeliveryAddress(e.target.value)}
                    placeholder="Rua e número"
                    className="w-full px-2.5 py-1.5 text-xs bg-white border border-stone-200 rounded-md"
                  />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <input
                    type="text"
                    value={neighborhood}
                    onChange={(e) => setNeighborhood(e.target.value)}
                    placeholder="Bairro"
                    className="w-full px-2.5 py-1.5 text-xs bg-white border border-stone-200 rounded-md"
                  />
                  <input
                    type="text"
                    value={complement}
                    onChange={(e) => setComplement(e.target.value)}
                    placeholder="Apto / Ref."
                    className="w-full px-2.5 py-1.5 text-xs bg-white border border-stone-200 rounded-md"
                  />
                </div>
              </div>
            )}

            <div className="grid grid-cols-2 gap-2.5">
              <div>
                <label className="block text-[11px] font-medium text-stone-700 mb-1">
                  Cupom de Desconto
                </label>
                <input
                  type="text"
                  value={couponCode}
                  onChange={(e) => setCouponCode(e.target.value.toUpperCase())}
                  placeholder="Ex: PIZZA10"
                  className="w-full px-2.5 py-1.5 text-xs font-mono bg-white border border-stone-200 rounded-md uppercase"
                />
              </div>
              <div>
                <label className="block text-[11px] font-medium text-stone-700 mb-1">
                  Observações
                </label>
                <input
                  type="text"
                  value={orderNotes}
                  onChange={(e) => setOrderNotes(e.target.value)}
                  placeholder="Sem cebola, cortar em 8..."
                  className="w-full px-2.5 py-1.5 text-xs bg-white border border-stone-200 rounded-md"
                />
              </div>
            </div>

            {pricing.availableCashback > 0 && (
              <label className="flex items-center justify-between gap-2 p-2.5 bg-emerald-50 border border-emerald-200 rounded-md text-xs text-emerald-900 cursor-pointer">
                <span className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={useCashback}
                    onChange={(e) => setUseCashback(e.target.checked)}
                    className="rounded border-emerald-400 text-emerald-700"
                  />
                  <span>Usar Cashback disponível do cliente</span>
                </span>
                <strong className="font-mono tabular-nums">{formatBRL(pricing.availableCashback)}</strong>
              </label>
            )}

            <div className="grid grid-cols-2 gap-2.5">
              <div>
                <label className="block text-[11px] font-medium text-stone-700 mb-1">
                  Forma de Pagamento
                </label>
                <select
                  value={paymentMethod}
                  onChange={(e) => setPaymentMethod(e.target.value as PaymentMethod)}
                  className="w-full px-2.5 py-1.5 text-xs bg-white border border-stone-200 rounded-md"
                >
                  <option value="pix">PIX</option>
                  <option value="cartao_entrega">Cartão (Maquininha)</option>
                  <option value="dinheiro">Dinheiro</option>
                  <option value="cartao_online">Cartão Online</option>
                </select>
              </div>
              {paymentMethod === 'dinheiro' ? (
                <div>
                  <label className="block text-[11px] font-medium text-stone-700 mb-1">
                    Troco para (R$)
                  </label>
                  <input
                    type="text"
                    value={changeFor}
                    onChange={(e) => setChangeFor(e.target.value)}
                    placeholder="Ex: 100"
                    className="w-full px-2.5 py-1.5 text-xs font-mono bg-white border border-stone-200 rounded-md"
                  />
                </div>
              ) : (
                <div className="flex items-end pb-1">
                  <label className="inline-flex items-center gap-2 text-xs text-stone-700 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={paidNow}
                      onChange={(e) => setPaidNow(e.target.checked)}
                      className="rounded border-stone-300 text-emerald-700"
                    />
                    <span>Já pago no caixa</span>
                  </label>
                </div>
              )}
            </div>

            <div className="bg-[#FAF6F0] border border-stone-200 rounded-lg p-3 space-y-1 text-xs">
              <div className="flex justify-between text-stone-600">
                <span>Subtotal</span>
                <span className="font-mono tabular-nums">{formatBRL(pricing.subtotal)}</span>
              </div>
              {pricing.deliveryFee > 0 && (
                <div className="flex justify-between text-stone-600">
                  <span>Taxa de Entrega</span>
                  <span className="font-mono tabular-nums">{formatBRL(pricing.deliveryFee)}</span>
                </div>
              )}
              {pricing.progressiveDiscount > 0 && (
                <div className="flex justify-between text-emerald-700">
                  <span>Desconto Progressivo</span>
                  <span className="font-mono tabular-nums">-{formatBRL(pricing.progressiveDiscount)}</span>
                </div>
              )}
              {pricing.couponDiscount > 0 && (
                <div className="flex justify-between text-emerald-700">
                  <span>Cupom {pricing.matchedCoupon?.code}</span>
                  <span className="font-mono tabular-nums">-{formatBRL(pricing.couponDiscount)}</span>
                </div>
              )}
              {pricing.cashbackUsed > 0 && (
                <div className="flex justify-between text-emerald-700">
                  <span>Cashback Resgatado</span>
                  <span className="font-mono tabular-nums">-{formatBRL(pricing.cashbackUsed)}</span>
                </div>
              )}
              <div className="flex justify-between text-sm font-semibold text-stone-900 pt-1 border-t border-stone-200">
                <span>Total do Pedido</span>
                <span className="font-mono tabular-nums">{formatBRL(pricing.total)}</span>
              </div>
              {pricing.changeAmount > 0 && (
                <div className="flex justify-between text-[11px] text-amber-800 font-medium">
                  <span>Troco a devolver</span>
                  <span className="font-mono tabular-nums">{formatBRL(pricing.changeAmount)}</span>
                </div>
              )}
            </div>

            {error && (
              <div className="p-2.5 text-xs text-red-800 bg-red-50 border border-red-200 rounded-md">
                {error}
              </div>
            )}

            <div className="flex items-center justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={onClose}
                className="px-3 py-2 text-xs text-stone-600 hover:text-stone-900"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={submitting || cart.length === 0}
                className="px-4 py-2 text-xs font-semibold bg-emerald-700 text-white rounded-lg hover:bg-emerald-800 disabled:opacity-50 transition-colors"
              >
                {submitting ? 'Lançando...' : 'Lançar Pedido na Cozinha'}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};
