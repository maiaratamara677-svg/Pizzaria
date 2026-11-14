import crypto from 'node:crypto';
import type { MenuItem, OrderItem, PaymentMethod, PaymentStatus } from '../types.ts';

export interface NormalizedMarketplaceOrder {
  action: 'create' | 'cancel' | 'ignore';
  externalOrderId: string;
  externalDisplayId?: string;
  reason?: string;
  customerName: string;
  customerPhone?: string;
  deliveryAddress: string;
  neighborhood?: string;
  complement?: string;
  items: {
    menuItemId?: string;
    name: string;
    size?: OrderItem['size'];
    crust?: string;
    quantity: number;
    unitPrice: number;
    notes?: string;
  }[];
  deliveryFee?: number;
  paymentMethod: PaymentMethod;
  paymentStatus: PaymentStatus;
  pickupCode?: string;
  deliveryBy?: 'loja' | 'marketplace';
  orderNotes?: string;
}

function asRecord(val: unknown): Record<string, unknown> {
  return val && typeof val === 'object' && !Array.isArray(val)
    ? (val as Record<string, unknown>)
    : {};
}

function asString(val: unknown): string {
  return typeof val === 'string' ? val.trim() : typeof val === 'number' ? String(val) : '';
}

function asNumber(val: unknown): number | undefined {
  if (typeof val === 'number' && Number.isFinite(val)) return val;
  if (typeof val === 'string' && val.trim()) {
    const parsed = Number(val.replace(',', '.'));
    if (Number.isFinite(parsed)) return parsed;
  }
  return undefined;
}

function parseItemSize(raw: unknown): OrderItem['size'] | undefined {
  const s = asString(raw).toLowerCase();
  if (!s) return undefined;
  if (s.includes('med') || s === 'm') return 'media';
  if (s.includes('gig') || s === 'gg') return 'gigante';
  if (s.includes('uni') || s === '2l') return 'unico';
  if (s.includes('gran') || s === 'g') return 'grande';
  return undefined;
}

export function verifyMarketplaceWebhookSecret(params: {
  expectedSecret: string;
  headers: Record<string, string | string[] | undefined>;
  querySecret?: unknown;
  rawBody?: string;
}): boolean {
  const expected = params.expectedSecret.trim();
  if (!expected) return true;

  const headerCandidates = [
    params.headers['x-webhook-secret'],
    params.headers['x-ifood-signature'],
    params.headers['x-99food-signature'],
    params.headers['authorization'],
    params.querySecret,
  ]
    .flatMap((v) => (Array.isArray(v) ? v : [v]))
    .map((v) => (typeof v === 'string' ? v.trim() : ''))
    .filter(Boolean);

  for (const candidate of headerCandidates) {
    const clean = candidate.replace(/^Bearer\s+/i, '').trim();
    if (clean === expected) return true;

    if (params.rawBody) {
      const hmac = crypto
        .createHmac('sha256', expected)
        .update(params.rawBody, 'utf8')
        .digest('hex');
      if (clean.toLowerCase() === hmac.toLowerCase()) {
        return true;
      }
    }
  }

  return false;
}

export function normalizeIfoodPayload(rawBody: unknown): NormalizedMarketplaceOrder {
  const root = asRecord(rawBody);
  const eventCode = asString(root.fullCode || root.code || root.eventType || root.event).toUpperCase();
  const order = Object.keys(asRecord(root.order)).length > 0 ? asRecord(root.order) : root;

  const externalOrderId =
    asString(order.id || root.orderId || root.id) || `ifood-${crypto.randomUUID().slice(0, 8)}`;
  const externalDisplayId =
    asString(order.displayId || root.displayId || order.shortReference) ||
    externalOrderId.slice(-4).toUpperCase();

  if (eventCode === 'CANCELLED' || eventCode === 'CANCELLATION_REQUESTED' || asString(order.status).toUpperCase() === 'CANCELLED') {
    return {
      action: 'cancel',
      externalOrderId,
      externalDisplayId,
      reason: asString(root.reason || order.cancellationReason) || 'Pedido cancelado pelo cliente/iFood',
      customerName: 'Cliente iFood',
      deliveryAddress: '',
      items: [],
      paymentMethod: 'ifood_online',
      paymentStatus: 'pago',
    };
  }

  const customer = asRecord(order.customer);
  const phoneObj = asRecord(customer.phone);
  const customerPhone =
    asString(phoneObj.number || customer.phone || order.customerPhone) || undefined;
  const customerName = asString(customer.name || order.customerName) || 'Cliente iFood';

  const delivery = asRecord(order.delivery);
  const deliveryAddressObj = asRecord(delivery.deliveryAddress);
  const streetPart = [
    asString(deliveryAddressObj.streetName || deliveryAddressObj.street),
    asString(deliveryAddressObj.streetNumber || deliveryAddressObj.number),
  ]
    .filter(Boolean)
    .join(', ');
  const deliveryAddress =
    asString(deliveryAddressObj.formattedAddress || order.deliveryAddress) ||
    streetPart ||
    'Retirada no balcão (iFood)';
  const neighborhood = asString(deliveryAddressObj.neighborhood) || undefined;
  const complement =
    asString(deliveryAddressObj.complement || deliveryAddressObj.reference) || undefined;

  const deliveredByRaw = asString(delivery.deliveredBy || order.deliveryBy).toUpperCase();
  const deliveryBy: 'loja' | 'marketplace' =
    deliveredByRaw === 'MERCHANT' || deliveredByRaw === 'LOJA' ? 'loja' : 'marketplace';
  const pickupCode = asString(delivery.pickupCode || order.pickupCode) || undefined;

  const rawItems = Array.isArray(order.items) ? order.items : [];
  const items = rawItems
    .map((entry) => {
      const it = asRecord(entry);
      const quantity = Math.max(1, Math.round(asNumber(it.quantity) ?? 1));
      const totalPrice = asNumber(it.totalPrice);
      const unitPrice =
        asNumber(it.unitPrice) ??
        asNumber(it.price) ??
        (totalPrice !== undefined ? totalPrice / quantity : 0);
      const options = Array.isArray(it.options)
        ? it.options
            .map((o) => asString(asRecord(o).name))
            .filter(Boolean)
            .join(', ')
        : '';
      const obs = [asString(it.observations || it.notes), options].filter(Boolean).join(' · ');

      return {
        menuItemId: asString(it.externalCode || it.menuItemId || it.id) || undefined,
        name: asString(it.name) || 'Item iFood',
        size: parseItemSize(it.size || it.name),
        quantity,
        unitPrice,
        notes: obs || undefined,
      };
    })
    .filter((i) => i.name);

  if (items.length === 0) {
    throw new Error('Payload iFood inválido: lista de itens vazia.');
  }

  const totalObj = asRecord(order.total);
  const deliveryFee = asNumber(totalObj.deliveryFee ?? order.deliveryFee ?? delivery.fee);

  const payments = asRecord(order.payments);
  const methods = Array.isArray(payments.methods) ? payments.methods : [];
  const primaryPay = asRecord(methods[0] ?? order.payment);
  const payMethodRaw = asString(primaryPay.method || primaryPay.type).toUpperCase();
  const isPrepaid =
    primaryPay.prepaid === true ||
    asString(primaryPay.type).toUpperCase() === 'ONLINE' ||
    asString(primaryPay.status).toLowerCase() === 'paid';

  let paymentMethod: PaymentMethod = 'ifood_online';
  let paymentStatus: PaymentStatus = 'pago';

  if (isPrepaid || payMethodRaw === 'ONLINE' || payMethodRaw === 'IFOOD') {
    paymentMethod = 'ifood_online';
    paymentStatus = 'pago';
  } else if (payMethodRaw === 'PIX') {
    paymentMethod = 'pix';
    paymentStatus = primaryPay.prepaid === false ? 'aguardando' : 'pago';
  } else if (payMethodRaw === 'CASH' || payMethodRaw === 'DINHEIRO') {
    paymentMethod = 'dinheiro';
    paymentStatus = 'pagamento_na_entrega';
  } else if (payMethodRaw === 'CREDIT' || payMethodRaw === 'DEBIT' || payMethodRaw.includes('CARD') || payMethodRaw.includes('CARTAO')) {
    paymentMethod = 'cartao_entrega';
    paymentStatus = 'pagamento_na_entrega';
  }

  const orderNotes =
    asString(order.extraInfo || delivery.observations || order.notes) || undefined;

  return {
    action: 'create',
    externalOrderId,
    externalDisplayId,
    customerName,
    customerPhone,
    deliveryAddress,
    neighborhood,
    complement,
    items,
    deliveryFee,
    paymentMethod,
    paymentStatus,
    pickupCode,
    deliveryBy,
    orderNotes,
  };
}

export function normalize99FoodPayload(rawBody: unknown): NormalizedMarketplaceOrder {
  const root = asRecord(rawBody);
  const event = asString(root.event || root.eventType || root.type).toLowerCase();
  const order = Object.keys(asRecord(root.order)).length > 0 ? asRecord(root.order) : root;

  const externalOrderId =
    asString(order.order_id || order.id || root.order_id || root.orderId) ||
    `99food-${crypto.randomUUID().slice(0, 8)}`;
  const externalDisplayId =
    asString(order.display_id || order.short_code || order.code) ||
    externalOrderId.slice(-4).toUpperCase();

  if (event.includes('cancel') || asString(order.status).toLowerCase() === 'cancelled') {
    return {
      action: 'cancel',
      externalOrderId,
      externalDisplayId,
      reason: asString(root.reason || order.cancel_reason) || 'Pedido cancelado no 99Food',
      customerName: 'Cliente 99Food',
      deliveryAddress: '',
      items: [],
      paymentMethod: '99food_online',
      paymentStatus: 'pago',
    };
  }

  const customer = asRecord(order.customer);
  const customerName = asString(customer.name || order.customer_name) || 'Cliente 99Food';
  const customerPhone =
    asString(customer.phone || order.customer_phone) || undefined;

  const addressObj = asRecord(order.address || order.delivery_address);
  const streetPart = [
    asString(addressObj.street || addressObj.logradouro),
    asString(addressObj.number || addressObj.numero),
  ]
    .filter(Boolean)
    .join(', ');
  const deliveryAddress =
    asString(addressObj.formatted || order.delivery_address || order.address) ||
    streetPart ||
    'Retirada no balcão (99Food)';
  const neighborhood = asString(addressObj.neighborhood || addressObj.bairro) || undefined;
  const complement = asString(addressObj.complement || addressObj.complemento) || undefined;

  const deliveryByRaw = asString(order.delivery_by || order.delivery_mode).toLowerCase();
  const deliveryBy: 'loja' | 'marketplace' =
    deliveryByRaw === 'loja' || deliveryByRaw === 'merchant' || deliveryByRaw === 'own'
      ? 'loja'
      : 'marketplace';
  const pickupCode = asString(order.pickup_code || order.collect_code) || undefined;

  const rawItems = Array.isArray(order.items) ? order.items : [];
  const items = rawItems
    .map((entry) => {
      const it = asRecord(entry);
      const quantity = Math.max(1, Math.round(asNumber(it.quantity ?? it.qty) ?? 1));
      const unitPrice = asNumber(it.unit_price ?? it.unitPrice ?? it.price) ?? 0;
      return {
        menuItemId: asString(it.sku || it.menu_item_id || it.menuItemId) || undefined,
        name: asString(it.name || it.title) || 'Item 99Food',
        size: parseItemSize(it.size || it.variant),
        crust: asString(it.crust || it.borda) || undefined,
        quantity,
        unitPrice,
        notes: asString(it.notes || it.observation) || undefined,
      };
    })
    .filter((i) => i.name);

  if (items.length === 0) {
    throw new Error('Payload 99Food inválido: lista de itens vazia.');
  }

  const deliveryFee = asNumber(order.delivery_fee ?? order.deliveryFee);

  const payObj = asRecord(order.payment);
  const payMethodRaw = asString(payObj.method || order.payment_method).toLowerCase();
  const payStatusRaw = asString(payObj.status || order.payment_status).toLowerCase();
  const isPaid = payObj.paid === true || payStatusRaw === 'paid' || payStatusRaw === 'pago';

  let paymentMethod: PaymentMethod = '99food_online';
  let paymentStatus: PaymentStatus = isPaid ? 'pago' : 'aguardando';

  if (payMethodRaw === 'pix') {
    paymentMethod = 'pix';
    paymentStatus = isPaid ? 'pago' : 'aguardando';
  } else if (payMethodRaw === 'cash' || payMethodRaw === 'dinheiro') {
    paymentMethod = 'dinheiro';
    paymentStatus = 'pagamento_na_entrega';
  } else if (payMethodRaw.includes('card_delivery') || payMethodRaw === 'cartao_entrega') {
    paymentMethod = 'cartao_entrega';
    paymentStatus = 'pagamento_na_entrega';
  } else {
    paymentMethod = '99food_online';
    paymentStatus = 'pago';
  }

  const orderNotes = asString(order.notes || order.observations) || undefined;

  return {
    action: 'create',
    externalOrderId,
    externalDisplayId,
    customerName,
    customerPhone,
    deliveryAddress,
    neighborhood,
    complement,
    items,
    deliveryFee,
    paymentMethod,
    paymentStatus,
    pickupCode,
    deliveryBy,
    orderNotes,
  };
}

export function createSimulatedMarketplaceInput(
  channel: 'ifood' | '99food',
  menu: MenuItem[]
) {
  const availablePizzas = menu.filter((m) => m.available && m.category !== 'Bebidas');
  const availableDrinks = menu.filter((m) => m.available && m.category === 'Bebidas');
  const pizza = availablePizzas[Math.floor(Math.random() * Math.max(1, availablePizzas.length))] ?? menu[0];
  const drink = availableDrinks[0];

  const shortNum = Math.floor(1000 + Math.random() * 8999);
  const pickupCode = String(Math.floor(1000 + Math.random() * 8999));

  if (channel === 'ifood') {
    const names = ['Camila Ferreira', 'Bruno Nogueira', 'Juliana Azevedo', 'Thiago Barros'];
    const addresses = [
      { street: 'Rua Haddock Lobo, 1120', neighborhood: 'Cerqueira César', complement: 'Apto 94' },
      { street: 'Alameda Santos, 745', neighborhood: 'Paraíso', complement: 'Bloco A · Portaria' },
      { street: 'Rua da Consolação, 2380', neighborhood: 'Consolação', complement: 'Casa 2' },
    ];
    const addr = addresses[Math.floor(Math.random() * addresses.length)];
    const items = [
      {
        externalCode: pizza?.id,
        name: pizza?.name ?? 'Margherita Napoletana',
        size: 'grande',
        quantity: 1,
        unitPrice: pizza?.prices.grande ?? 68,
        observations: 'Cortar em 8 pedaços, enviar sachês de orégano',
      },
      ...(drink
        ? [
            {
              externalCode: drink.id,
              name: drink.name,
              size: 'unico',
              quantity: 1,
              unitPrice: drink.prices.grande,
            },
          ]
        : []),
    ];

    return {
      eventType: 'PLACED',
      orderId: `ifd-${crypto.randomUUID().slice(0, 8)}`,
      displayId: `#IFD-${shortNum}`,
      customer: {
        name: names[Math.floor(Math.random() * names.length)],
        phone: { number: `+55 11 9${Math.floor(1000 + Math.random() * 8999)}-${Math.floor(1000 + Math.random() * 8999)}` },
      },
      delivery: {
        deliveredBy: 'IFOOD',
        pickupCode,
        deliveryAddress: {
          formattedAddress: addr.street,
          neighborhood: addr.neighborhood,
          complement: addr.complement,
        },
      },
      items,
      total: {
        deliveryFee: 9.9,
      },
      payments: {
        methods: [
          {
            method: 'ONLINE',
            type: 'ONLINE',
            prepaid: true,
          },
        ],
      },
      extraInfo: 'Entregador parceiro iFood · Código de coleta informado',
    };
  }

  const names = ['Fernanda Duarte', 'Gustavo Peixoto', 'Larissa Vieira', 'Eduardo Martins'];
  const addresses = [
    { street: 'Av. Angélica, 1650', neighborhood: 'Higienópolis', complement: 'Apto 121' },
    { street: 'Rua Bela Cintra, 890', neighborhood: 'Consolação', complement: 'Térreo' },
    { street: 'Rua Pamplona, 512', neighborhood: 'Jardim Paulista', complement: 'Conjunto 32' },
  ];
  const addr = addresses[Math.floor(Math.random() * addresses.length)];

  return {
    event: 'order.created',
    order_id: `99f-${crypto.randomUUID().slice(0, 8)}`,
    display_id: `#99F-${shortNum}`,
    customer: {
      name: names[Math.floor(Math.random() * names.length)],
      phone: `+55 11 9${Math.floor(1000 + Math.random() * 8999)}-${Math.floor(1000 + Math.random() * 8999)}`,
    },
    address: {
      formatted: addr.street,
      neighborhood: addr.neighborhood,
      complement: addr.complement,
    },
    delivery_by: 'marketplace',
    pickup_code: pickupCode,
    delivery_fee: 7.5,
    items: [
      {
        sku: pizza?.id,
        name: pizza?.name ?? 'Calabresa Artesanal',
        size: 'grande',
        quantity: 1,
        unit_price: pizza?.prices.grande ?? 64,
        notes: 'Massa bem assada',
      },
    ],
    payment: {
      method: 'online',
      paid: true,
      status: 'paid',
    },
    notes: 'Pedido recebido via 99Food',
  };
}
