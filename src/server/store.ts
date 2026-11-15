import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import type { Response as ExpressResponse } from 'express';
import type {
  AppSnapshot,
  CashbackConfig,
  ChatMessage,
  Conversation,
  Coupon,
  Customer,
  DeliveryDriver,
  MenuItem,
  Order,
  OrderChannel,
  OrderItem,
  OrderServiceType,
  OrderStage,
  PaymentMethod,
  PaymentStatus,
  PromotionsConfig,
  StoreSettings,
} from '../types.ts';

const DATA_DIR = path.resolve(process.cwd(), 'data');
const STORE_FILE = path.join(DATA_DIR, 'store.json');

const sseClients = new Set<ExpressResponse>();

export function registerSseClient(res: ExpressResponse) {
  sseClients.add(res);
  res.on('close', () => {
    sseClients.delete(res);
  });
}

export function broadcastEvent(event: string, payload: unknown) {
  const data = `event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`;
  for (const client of sseClients) {
    try {
      client.write(data);
    } catch {
      sseClients.delete(client);
    }
  }
}

export function generatePixBrCode(params: {
  pixKey: string;
  merchantName: string;
  city: string;
  amount: number;
  txid: string;
}): string {
  const cleanName =
    params.merchantName
      .trim()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toUpperCase()
      .slice(0, 25) || 'PIZZARIA';
  const safePixKey = params.pixKey.trim() || 'pix@pizzaria.com.br';
  const amountStr = Math.max(0.01, params.amount).toFixed(2);
  const keyField = `0014br.gov.bcb.pix01${String(safePixKey.length).padStart(2, '0')}${safePixKey}`;
  const merchantAccount = `26${String(keyField.length).padStart(2, '0')}${keyField}`;
  const txidField = `05${String(params.txid.length).padStart(2, '0')}${params.txid}`;
  const additionalData = `62${String(txidField.length).padStart(2, '0')}${txidField}`;

  const raw =
    `000201` +
    merchantAccount +
    `52040000` +
    `5303986` +
    `54${String(amountStr.length).padStart(2, '0')}${amountStr}` +
    `5802BR` +
    `59${String(cleanName.length).padStart(2, '0')}${cleanName}` +
    `6009SAO PAULO` +
    additionalData +
    `6304`;

  // Simple CRC16-CCITT checksum for realistic EMV BR Code
  let crc = 0xffff;
  for (let i = 0; i < raw.length; i++) {
    crc ^= raw.charCodeAt(i) << 8;
    for (let j = 0; j < 8; j++) {
      if ((crc & 0x8000) !== 0) {
        crc = ((crc << 1) ^ 0x1021) & 0xffff;
      } else {
        crc = (crc << 1) & 0xffff;
      }
    }
  }
  return raw + crc.toString(16).toUpperCase().padStart(4, '0');
}

function createInitialData(): AppSnapshot {
  const now = Date.now();
  const iso = (offsetMin: number) => new Date(now + offsetMin * 60_000).toISOString();

  const settings: StoreSettings = {
    pizzeriaName: 'Pizzaria Bella Fornalha',
    whatsappPhoneDisplay: '+55 (11) 98420-1100',
    pixKey: 'pagamentos@bellafornalha.com.br',
    deliveryFee: 8.0,
    averagePrepMinutes: 35,
    aiPersonaTone:
      'Cordial, ágil, objetivo e acolhedor, usando português brasileiro natural como um atendente experiente de pizzaria artesanal.',
    autoNotifyOrderUpdates: true,
    whatsappVerifyToken: 'fornodesk_verify_2026',
    whatsappPhoneNumberId: '104829301928374',
    ifoodEnabled: true,
    ifoodMerchantId: '',
    ifoodWebhookSecret: 'fornodesk_ifood_2026',
    ifoodAutoAccept: true,
    food99Enabled: true,
    food99StoreId: '',
    food99WebhookSecret: 'fornodesk_99food_2026',
    food99AutoAccept: true,
    telegramBotToken: '',
    telegramChatId: '',
    telegramAutoBackupOnPayment: false,
    backupSchedule: 'manual',
    backupDailyTime: '23:55',
    paymentSound: 'cozinha',
  };

  const menu: MenuItem[] = [
    {
      id: 'pizza-margherita',
      name: 'Margherita Napoletana',
      category: 'Tradicionais',
      description: 'Molho de tomate San Marzano, fior di latte fresca, manjericão e azeite extravirgem.',
      prices: { media: 54, grande: 68, gigante: 84 },
      imageUrl: '/src/assets/images/pizza_margherita_napoletana_1794590306126.jpg',
      available: true,
    },
    {
      id: 'pizza-calabresa',
      name: 'Calabresa Artesanal',
      category: 'Tradicionais',
      description: 'Calabresa defumada fatiada fina, cebola roxa caramelizada, azeitonas pretas e orégano.',
      prices: { media: 52, grande: 64, gigante: 79 },
      imageUrl: '/src/assets/images/pizza_calabresa_artesanal_1794590305648.jpg',
      available: true,
    },
    {
      id: 'pizza-quatro-queijos',
      name: 'Quatro Queijos da Casa',
      category: 'Especiais',
      description: 'Mozzarella artesanal, Catupiry original, gorgonzola doce e parmesão gratinado.',
      prices: { media: 58, grande: 74, gigante: 89 },
      imageUrl: '/src/assets/images/pizza_quatro_queijos_1794590306727.jpg',
      available: true,
    },
    {
      id: 'pizza-frango-catupiry',
      name: 'Frango com Catupiry',
      category: 'Tradicionais',
      description: 'Peito de frango desfiado temperado no alho-poró coberto com Catupiry original.',
      prices: { media: 55, grande: 69, gigante: 85 },
      available: true,
    },
    {
      id: 'pizza-pepperoni',
      name: 'Pepperoni Crocante & Mel Picante',
      category: 'Especiais',
      description: 'Pepperoni italiano curado, mozzarella de búfala e fio opcional de mel picante.',
      prices: { media: 62, grande: 78, gigante: 94 },
      available: true,
    },
    {
      id: 'pizza-portuguesa',
      name: 'Portuguesa Clássica',
      category: 'Tradicionais',
      description: 'Presunto cozido, ovos caipiras, cebola, ervilhas frescas, azeitonas e mozzarella.',
      prices: { media: 56, grande: 70, gigante: 86 },
      available: true,
    },
    {
      id: 'pizza-chocolate-morango',
      name: 'Chocolate Belga com Morangos',
      category: 'Doces',
      description: 'Ganache de chocolate meio amargo 54% com morangos frescos fatiados.',
      prices: { media: 49, grande: 62 },
      available: true,
    },
    {
      id: 'bebida-coca-2l',
      name: 'Coca-Cola Original 2L',
      category: 'Bebidas',
      description: 'Garrafa 2 litros bem gelada.',
      prices: { grande: 16 },
      available: true,
    },
    {
      id: 'bebida-guarana-2l',
      name: 'Guaraná Antarctica 2L',
      category: 'Bebidas',
      description: 'Garrafa 2 litros bem gelada.',
      prices: { grande: 14 },
      available: true,
    },
  ];

  const customers: Customer[] = [
    {
      id: 'cust-1',
      phone: '+55 11 99124-8820',
      name: 'Mariana Costa',
      address: 'Rua Oscar Freire, 845',
      neighborhood: 'Jardins',
      complement: 'Apto 72, Bloco B',
      notes: 'Sem cebola na pizza de calabresa quando pedir meio a meio.',
      autoRegistered: true,
      registeredAt: iso(-180),
      totalOrders: 4,
      totalSpent: 342.0,
      cashbackBalance: 12.5,
      cashbackExpiresAt: iso(15 * 24 * 60),
    },
    {
      id: 'cust-2',
      phone: '+55 11 98741-5509',
      name: 'Rafael Mendes',
      address: 'Av. Paulista, 1910',
      neighborhood: 'Bela Vista',
      complement: 'Portaria 2 - Interfone 114',
      notes: 'Prefere pagamento via PIX.',
      autoRegistered: true,
      registeredAt: iso(-45),
      totalOrders: 1,
      totalSpent: 98.0,
    },
    {
      id: 'cust-3',
      phone: '+55 11 97330-2190',
      name: 'Contato Novo (+55 11 97330-2190)',
      address: '',
      neighborhood: '',
      complement: '',
      notes: '',
      autoRegistered: false,
      registeredAt: iso(-5),
      totalOrders: 0,
      totalSpent: 0,
    },
  ];

  const pixCodeRafael = generatePixBrCode({
    pixKey: settings.pixKey,
    merchantName: settings.pizzeriaName,
    city: 'SAO PAULO',
    amount: 98.0,
    txid: 'BF2049',
  });

  const orders: Order[] = [
    {
      id: 'ord-2048',
      code: '#2048',
      channel: 'whatsapp',
      serviceType: 'entrega',
      customerId: 'cust-1',
      conversationId: 'conv-1',
      customerName: 'Mariana Costa',
      customerPhone: '+55 11 99124-8820',
      deliveryAddress: 'Rua Oscar Freire, 845 - Jardins (Apto 72, Bloco B)',
      items: [
        {
          menuItemId: 'pizza-margherita',
          name: 'Margherita Napoletana',
          size: 'grande',
          crust: 'Tradicional',
          quantity: 1,
          unitPrice: 68,
        },
        {
          menuItemId: 'bebida-coca-2l',
          name: 'Coca-Cola Original 2L',
          size: 'unico',
          quantity: 1,
          unitPrice: 16,
        },
      ],
      subtotal: 84,
      deliveryFee: 8,
      total: 92,
      stage: 'no_forno',
      payment: {
        method: 'pix',
        status: 'pago',
        amount: 92,
        transactionId: 'PIX-BF2048',
        paidAt: iso(-12),
      },
      estimatedMinutes: 18,
      createdAt: iso(-15),
      updatedAt: iso(-3),
      timeline: [
        { stage: 'recebido', timestamp: iso(-15), note: 'Pedido confirmado automaticamente via WhatsApp' },
        { stage: 'em_preparo', timestamp: iso(-10), note: 'Massa aberta e montada na bancada' },
        { stage: 'no_forno', timestamp: iso(-3), note: 'Assando no forno a lenha a 430°C' },
      ],
    },
    {
      id: 'ord-2049',
      code: '#2049',
      channel: 'whatsapp',
      serviceType: 'entrega',
      customerId: 'cust-2',
      conversationId: 'conv-2',
      customerName: 'Rafael Mendes',
      customerPhone: '+55 11 98741-5509',
      deliveryAddress: 'Av. Paulista, 1910 - Bela Vista (Portaria 2 - Interfone 114)',
      items: [
        {
          menuItemId: 'pizza-quatro-queijos',
          name: 'Quatro Queijos da Casa',
          size: 'grande',
          crust: 'Catupiry (+R$ 16)',
          quantity: 1,
          unitPrice: 90,
        },
      ],
      subtotal: 90,
      deliveryFee: 8,
      total: 98,
      stage: 'recebido',
      payment: {
        method: 'pix',
        status: 'aguardando',
        amount: 98,
        pixCode: pixCodeRafael,
        transactionId: 'PIX-BF2049',
        expiresAt: iso(15),
      },
      estimatedMinutes: 35,
      createdAt: iso(-4),
      updatedAt: iso(-4),
      timeline: [
        { stage: 'recebido', timestamp: iso(-4), note: 'Aguardando confirmação do pagamento PIX' },
      ],
    },
  ];

  const conversations: Conversation[] = [
    {
      id: 'conv-1',
      customerId: 'cust-1',
      aiEnabled: true,
      unreadCount: 0,
      lastMessageAt: iso(-3),
      lastMessagePreview: 'Sua Margherita já entrou no forno a lenha!',
      handoffRequested: false,
    },
    {
      id: 'conv-2',
      customerId: 'cust-2',
      aiEnabled: true,
      unreadCount: 1,
      lastMessageAt: iso(-4),
      lastMessagePreview: 'PIX gerado! Assim que pagar, iniciamos o preparo.',
      handoffRequested: false,
    },
    {
      id: 'conv-3',
      customerId: 'cust-3',
      aiEnabled: true,
      unreadCount: 1,
      lastMessageAt: iso(-1),
      lastMessagePreview: 'Oi! Boa noite, vocês estão entregando agora?',
      handoffRequested: false,
    },
  ];

  const messages: ChatMessage[] = [
    {
      id: 'msg-101',
      conversationId: 'conv-1',
      sender: 'customer',
      text: 'Oi! Quero pedir uma Margherita grande e uma Coca 2L para entregar no meu endereço de sempre.',
      timestamp: iso(-16),
      status: 'read',
    },
    {
      id: 'msg-102',
      conversationId: 'conv-1',
      sender: 'ai',
      text: 'Olá, Mariana! Tudo ótimo por aqui. Já localizei seu cadastro na Rua Oscar Freire, 845 (Apto 72, Bloco B).\n\nFicou 1x Pizza Grande Margherita Napoletana (R$ 68,00) + 1x Coca-Cola 2L (R$ 16,00) + entrega (R$ 8,00) = R$ 92,00. Segue o código PIX:',
      timestamp: iso(-15),
      status: 'read',
      aiActionLabel: 'Pedido #2048 criado · PIX gerado',
    },
    {
      id: 'msg-103',
      conversationId: 'conv-1',
      sender: 'ai',
      text: 'Pagamento PIX de R$ 92,00 confirmado com sucesso! Já enviamos seu pedido #2048 para a cozinha. Acompanhe o rastreio ao vivo aqui no chat:',
      timestamp: iso(-12),
      status: 'read',
      aiActionLabel: 'Pagamento confirmado · Rastreio ativo',
      attachment: {
        type: 'tracking',
        orderId: 'ord-2048',
      },
    },
    {
      id: 'msg-104',
      conversationId: 'conv-1',
      sender: 'ai',
      text: 'Atualização do seu pedido #2048: Sua Margherita já entrou no forno a lenha! Previsão de chegada em cerca de 18 minutos.',
      timestamp: iso(-3),
      status: 'read',
      aiActionLabel: 'Rastreio atualizado: No Forno',
    },
    {
      id: 'msg-201',
      conversationId: 'conv-2',
      sender: 'customer',
      text: 'Boa noite! Me chamo Rafael Mendes. Quero uma Quatro Queijos grande com borda de Catupiry para Av. Paulista, 1910 - Bela Vista, portaria 2 interfone 114. Vou pagar no PIX.',
      timestamp: iso(-5),
      status: 'read',
    },
    {
      id: 'msg-202',
      conversationId: 'conv-2',
      sender: 'ai',
      text: 'Boa noite, Rafael! Seja muito bem-vindo à Pizzaria Bella Fornalha. Já realizei seu cadastro automático com o endereço da Av. Paulista, 1910.\n\nTotal do pedido #2049: R$ 98,00 (Pizza Grande Quatro Queijos R$ 74,00 + Borda Catupiry R$ 16,00 + Entrega R$ 8,00). Segue seu PIX para pagamento instantâneo:',
      timestamp: iso(-4),
      status: 'delivered',
      aiActionLabel: 'Cadastro automático + PIX gerado',
      attachment: {
        type: 'payment',
        orderId: 'ord-2049',
        orderCode: '#2049',
        payment: orders[1].payment,
      },
    },
    {
      id: 'msg-301',
      conversationId: 'conv-3',
      sender: 'customer',
      text: 'Oi! Boa noite, vocês estão entregando agora? Queria ver o cardápio.',
      timestamp: iso(-1),
      status: 'read',
    },
  ];

  const drivers: DeliveryDriver[] = [
    {
      id: 'drv-1',
      name: 'Thiago Santos',
      phone: '+55 11 99412-7780',
      vehicle: 'Moto Honda CG 160 · ABC-4D21',
      active: true,
      createdAt: iso(-4320),
    },
    {
      id: 'drv-2',
      name: 'Lucas Ferreira',
      phone: '+55 11 98205-3319',
      vehicle: 'Moto Yamaha Factor · XYZ-9B10',
      active: true,
      createdAt: iso(-2880),
    },
  ];

  const coupons: Coupon[] = [
    {
      id: 'cpn-1',
      code: 'PIZZA10',
      type: 'percent',
      value: 10,
      minOrder: 50,
      active: true,
      usageCount: 3,
      createdAt: iso(-4320),
    },
    {
      id: 'cpn-2',
      code: 'BEMVINDO15',
      type: 'fixed',
      value: 15,
      minOrder: 80,
      active: true,
      usageCount: 1,
      createdAt: iso(-2880),
    },
  ];

  const promotions: PromotionsConfig = {
    cashback: {
      enabled: true,
      percent: 5,
      validityDays: 15,
      minOrderValue: 40,
    },
    progressiveEnabled: true,
    progressiveTiers: [
      { id: 'prog-1', minItems: 2, discountPercent: 5 },
      { id: 'prog-2', minItems: 3, discountPercent: 10 },
    ],
  };

  return {
    settings,
    menu,
    customers,
    conversations,
    messages,
    orders,
    drivers,
    coupons,
    promotions,
  };
}

class PizzeriaStore {
  private data: AppSnapshot;

  constructor() {
    this.data = this.load();
  }

  private load(): AppSnapshot {
    const initial = createInitialData();
    try {
      if (fs.existsSync(STORE_FILE)) {
        const raw = fs.readFileSync(STORE_FILE, 'utf-8');
        const parsed = JSON.parse(raw) as AppSnapshot;
        if (parsed && parsed.menu && parsed.conversations) {
          return {
            ...initial,
            ...parsed,
            settings: {
              ...initial.settings,
              ...(parsed.settings ?? {}),
            },
            drivers: Array.isArray(parsed.drivers) ? parsed.drivers : initial.drivers,
            coupons: Array.isArray(parsed.coupons) ? parsed.coupons : initial.coupons,
            promotions: parsed.promotions
              ? {
                  cashback: {
                    ...initial.promotions.cashback,
                    ...(parsed.promotions.cashback ?? {}),
                  },
                  progressiveEnabled:
                    typeof parsed.promotions.progressiveEnabled === 'boolean'
                      ? parsed.promotions.progressiveEnabled
                      : initial.promotions.progressiveEnabled,
                  progressiveTiers: Array.isArray(parsed.promotions.progressiveTiers)
                    ? parsed.promotions.progressiveTiers
                    : initial.promotions.progressiveTiers,
                }
              : initial.promotions,
          };
        }
      }
    } catch (err) {
      console.error('Erro ao carregar store.json, recriando estado inicial:', err);
    }
    this.save(initial);
    return initial;
  }

  private save(snapshot: AppSnapshot = this.data) {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    const tmpFile = `${STORE_FILE}.tmp`;
    fs.writeFileSync(tmpFile, JSON.stringify(snapshot, null, 2), 'utf-8');
    fs.renameSync(tmpFile, STORE_FILE);
  }

  getSnapshot(): AppSnapshot {
    return this.data;
  }

  getConversationContext(conversationId: string) {
    const conversation = this.data.conversations.find((c) => c.id === conversationId);
    if (!conversation) return null;
    const customer = this.data.customers.find((c) => c.id === conversation.customerId);
    if (!customer) return null;
    const messages = this.data.messages.filter((m) => m.conversationId === conversationId);
    const customerOrders = this.data.orders
      .filter((o) => o.customerId === customer.id)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    return { conversation, customer, messages, orders: customerOrders };
  }

  createConversation(params: { phone: string; name?: string }): {
    conversation: Conversation;
    customer: Customer;
  } {
    const cleanPhone = params.phone.trim();
    let customer = this.data.customers.find(
      (c) => c.phone.replace(/\D/g, '') === cleanPhone.replace(/\D/g, '')
    );

    if (!customer) {
      customer = {
        id: `cust-${crypto.randomUUID().slice(0, 8)}`,
        phone: cleanPhone,
        name: params.name?.trim() || `Contato Novo (${cleanPhone})`,
        address: '',
        neighborhood: '',
        complement: '',
        notes: '',
        autoRegistered: Boolean(params.name?.trim()),
        registeredAt: new Date().toISOString(),
        totalOrders: 0,
        totalSpent: 0,
      };
      this.data.customers.unshift(customer);
    }

    let conversation = this.data.conversations.find((c) => c.customerId === customer!.id);
    if (!conversation) {
      conversation = {
        id: `conv-${crypto.randomUUID().slice(0, 8)}`,
        customerId: customer.id,
        aiEnabled: true,
        unreadCount: 0,
        lastMessageAt: new Date().toISOString(),
        lastMessagePreview: 'Nova conversa iniciada',
        handoffRequested: false,
      };
      this.data.conversations.unshift(conversation);
    }

    this.save();
    broadcastEvent('snapshot_update', this.data);
    return { conversation, customer };
  }

  addMessage(msg: Omit<ChatMessage, 'id' | 'timestamp'>): ChatMessage {
    const created: ChatMessage = {
      ...msg,
      id: `msg-${crypto.randomUUID().slice(0, 8)}`,
      timestamp: new Date().toISOString(),
    };
    this.data.messages.push(created);

    const conv = this.data.conversations.find((c) => c.id === msg.conversationId);
    if (conv) {
      conv.lastMessageAt = created.timestamp;
      conv.lastMessagePreview = created.text.split('\n')[0].slice(0, 90);
      if (msg.sender === 'customer') {
        conv.unreadCount = 0;
      }
    }

    this.save();
    broadcastEvent('snapshot_update', this.data);
    return created;
  }

  updateConversation(
    conversationId: string,
    patch: Partial<Pick<Conversation, 'aiEnabled' | 'unreadCount' | 'handoffRequested'>>
  ): Conversation | null {
    const conv = this.data.conversations.find((c) => c.id === conversationId);
    if (!conv) return null;
    Object.assign(conv, patch);
    this.save();
    broadcastEvent('snapshot_update', this.data);
    return conv;
  }

  upsertCustomerFields(
    customerId: string,
    fields: Partial<
      Pick<Customer, 'name' | 'phone' | 'address' | 'neighborhood' | 'complement' | 'notes'>
    >
  ): Customer | null {
    const customer = this.data.customers.find((c) => c.id === customerId);
    if (!customer) return null;

    if (fields.name && fields.name.trim()) customer.name = fields.name.trim();
    if (fields.phone && fields.phone.trim()) customer.phone = fields.phone.trim();
    if (fields.address !== undefined && fields.address.trim()) customer.address = fields.address.trim();
    if (fields.neighborhood !== undefined && fields.neighborhood.trim())
      customer.neighborhood = fields.neighborhood.trim();
    if (fields.complement !== undefined) customer.complement = fields.complement.trim();
    if (fields.notes !== undefined) customer.notes = fields.notes.trim();

    if (customer.name && !customer.name.startsWith('Contato Novo') && customer.address) {
      customer.autoRegistered = true;
    }

    this.save();
    broadcastEvent('snapshot_update', this.data);
    return customer;
  }

  private getActiveCashbackBalance(customer: Customer): number {
    const raw = Number(customer.cashbackBalance ?? 0);
    if (!Number.isFinite(raw) || raw <= 0) return 0;
    if (customer.cashbackExpiresAt) {
      const exp = Date.parse(customer.cashbackExpiresAt);
      if (Number.isFinite(exp) && exp < Date.now()) {
        return 0;
      }
    }
    return Math.round(raw * 100) / 100;
  }

  private awardCashbackForOrder(order: Order) {
    const cfg = this.data.promotions.cashback;
    if (!cfg.enabled || cfg.percent <= 0) return;
    if (order.cashbackEarned && order.cashbackEarned > 0) return;
    if (order.total < (cfg.minOrderValue ?? 0)) return;

    const customer = this.data.customers.find((c) => c.id === order.customerId);
    if (!customer) return;

    const earned = Math.round(order.total * (cfg.percent / 100) * 100) / 100;
    if (earned <= 0) return;

    const currentValid = this.getActiveCashbackBalance(customer);
    customer.cashbackBalance = Math.round((currentValid + earned) * 100) / 100;
    const days = Math.max(1, Math.round(cfg.validityDays || 15));
    customer.cashbackExpiresAt = new Date(Date.now() + days * 24 * 60 * 60_000).toISOString();
    order.cashbackEarned = earned;
  }

  createOrder(params: {
    customerId: string;
    conversationId?: string;
    channel?: OrderChannel;
    serviceType?: OrderServiceType;
    tableNumber?: string;
    items: OrderItem[];
    paymentMethod: PaymentMethod;
    paymentStatusOverride?: PaymentStatus;
    changeFor?: number;
    couponCode?: string;
    useCashback?: boolean;
    orderNotes?: string;
    deliveryAddressOverride?: string;
  }): Order {
    const customer = this.data.customers.find((c) => c.id === params.customerId);
    if (!customer) throw new Error('Cliente não encontrado');

    const serviceType: OrderServiceType = params.serviceType ?? 'entrega';
    const subtotal = params.items.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0);
    const deliveryFee = serviceType === 'entrega' ? this.data.settings.deliveryFee : 0;

    // 1. Progressive discount based on total non-drink items (pizzas)
    let progressiveDiscount = 0;
    if (this.data.promotions.progressiveEnabled && this.data.promotions.progressiveTiers.length > 0) {
      const pizzaQty = params.items.reduce((sum, item) => {
        const menuEntry = this.data.menu.find((m) => m.id === item.menuItemId);
        const isDrink = menuEntry?.category === 'Bebidas' || item.size === 'unico';
        return isDrink ? sum : sum + item.quantity;
      }, 0);
      const matchingTier = this.data.promotions.progressiveTiers
        .filter((t) => pizzaQty >= t.minItems && t.discountPercent > 0)
        .sort((a, b) => b.discountPercent - a.discountPercent)[0];
      if (matchingTier) {
        progressiveDiscount = Math.round(subtotal * (matchingTier.discountPercent / 100) * 100) / 100;
      }
    }

    // 2. Coupon discount
    let couponDiscount = 0;
    let appliedCouponCode: string | undefined;
    if (params.couponCode && params.couponCode.trim()) {
      const normalizedCode = params.couponCode.trim().toUpperCase();
      const coupon = this.data.coupons.find(
        (c) => c.active && c.code.toUpperCase() === normalizedCode
      );
      if (coupon && subtotal >= (coupon.minOrder ?? 0)) {
        if (coupon.type === 'percent') {
          couponDiscount = Math.round(subtotal * (coupon.value / 100) * 100) / 100;
        } else {
          couponDiscount = Math.min(subtotal, coupon.value);
        }
        if (couponDiscount > 0) {
          appliedCouponCode = coupon.code;
          coupon.usageCount += 1;
        }
      }
    }

    // 3. Cashback redemption
    let cashbackUsed = 0;
    const afterPromo = Math.max(0, subtotal + deliveryFee - progressiveDiscount - couponDiscount);
    if (params.useCashback) {
      const availableCashback = this.getActiveCashbackBalance(customer);
      if (availableCashback > 0 && afterPromo > 0) {
        cashbackUsed = Math.round(Math.min(availableCashback, afterPromo) * 100) / 100;
        customer.cashbackBalance = Math.max(
          0,
          Math.round((availableCashback - cashbackUsed) * 100) / 100
        );
      }
    }

    const discountTotal = Math.round((progressiveDiscount + couponDiscount + cashbackUsed) * 100) / 100;
    const total = Math.max(0, Math.round((subtotal + deliveryFee - discountTotal) * 100) / 100);

    const maxOrderNum = this.data.orders.reduce((max, o) => {
      const num = Number(o.id.replace(/\D/g, ''));
      return Number.isFinite(num) && num > max ? num : max;
    }, 2049);
    const orderNum = maxOrderNum + 1;
    const code = `#${orderNum}`;
    const id = `ord-${orderNum}`;
    const txid = `BF${orderNum}`;
    const nowIso = new Date().toISOString();

    let fullAddress = '';
    if (serviceType === 'mesa') {
      fullAddress = params.tableNumber?.trim()
        ? `Mesa ${params.tableNumber.trim()}`
        : 'Consumo no Local';
    } else if (serviceType === 'retirada') {
      fullAddress = 'Retirada no balcão';
    } else {
      fullAddress =
        params.deliveryAddressOverride ||
        [customer.address, customer.neighborhood, customer.complement ? `(${customer.complement})` : '']
          .filter(Boolean)
          .join(' - ') ||
        'Retirada no balcão';
    }

    let payment: Order['payment'];
    if (params.paymentMethod === 'pix') {
      const isPaid = params.paymentStatusOverride === 'pago';
      payment = {
        method: 'pix',
        status: isPaid ? 'pago' : 'aguardando',
        amount: total,
        pixCode: generatePixBrCode({
          pixKey: this.data.settings.pixKey,
          merchantName: this.data.settings.pizzeriaName,
          city: 'SAO PAULO',
          amount: total,
          txid,
        }),
        transactionId: `PIX-${txid}`,
        paidAt: isPaid ? nowIso : undefined,
        expiresAt: isPaid ? undefined : new Date(Date.now() + 20 * 60_000).toISOString(),
      };
    } else if (params.paymentMethod === 'cartao_online') {
      const isPaid = params.paymentStatusOverride === 'pago';
      payment = {
        method: 'cartao_online',
        status: isPaid ? 'pago' : 'aguardando',
        amount: total,
        checkoutUrl: `https://pay.fornodesk.app/checkout/${txid}`,
        transactionId: `CARD-${txid}`,
        paidAt: isPaid ? nowIso : undefined,
        expiresAt: isPaid ? undefined : new Date(Date.now() + 20 * 60_000).toISOString(),
      };
    } else {
      const changeFor =
        params.paymentMethod === 'dinheiro' &&
        typeof params.changeFor === 'number' &&
        Number.isFinite(params.changeFor) &&
        params.changeFor > total
          ? Math.round(params.changeFor * 100) / 100
          : undefined;
      const changeAmount =
        changeFor !== undefined ? Math.round((changeFor - total) * 100) / 100 : undefined;

      payment = {
        method: params.paymentMethod,
        status: params.paymentStatusOverride ?? 'pagamento_na_entrega',
        amount: total,
        transactionId: `ENT-${txid}`,
        paidAt: params.paymentStatusOverride === 'pago' ? nowIso : undefined,
        changeFor,
        changeAmount,
      };
    }

    const channel: OrderChannel = params.channel ?? 'whatsapp';
    const order: Order = {
      id,
      code,
      channel,
      serviceType,
      tableNumber: serviceType === 'mesa' ? params.tableNumber?.trim() || undefined : undefined,
      orderNotes: params.orderNotes?.trim() || undefined,
      customerId: customer.id,
      conversationId: params.conversationId,
      customerName: customer.name,
      customerPhone: customer.phone,
      deliveryAddress: fullAddress,
      items: params.items,
      subtotal,
      deliveryFee,
      discountTotal: discountTotal > 0 ? discountTotal : undefined,
      couponCode: appliedCouponCode,
      cashbackUsed: cashbackUsed > 0 ? cashbackUsed : undefined,
      progressiveDiscount: progressiveDiscount > 0 ? progressiveDiscount : undefined,
      total,
      stage: channel === 'pdv' || payment.status === 'pago' ? 'em_preparo' : 'recebido',
      payment,
      estimatedMinutes: this.data.settings.averagePrepMinutes,
      createdAt: nowIso,
      updatedAt: nowIso,
      timeline: [
        {
          stage: 'recebido',
          timestamp: nowIso,
          note:
            channel === 'pdv'
              ? `Pedido registrado no PDV (${serviceType === 'mesa' ? fullAddress : serviceType === 'retirada' ? 'Retirada' : 'Entrega'})`
              : payment.status === 'aguardando'
                ? 'Pedido registrado. Aguardando confirmação de pagamento.'
                : 'Pedido confirmado e enviado para a cozinha.',
        },
        ...(channel === 'pdv' || payment.status === 'pago'
          ? [
              {
                stage: 'em_preparo' as OrderStage,
                timestamp: nowIso,
                note: 'Enviado automaticamente para preparo na cozinha.',
              },
            ]
          : []),
      ],
    };

    if (order.payment.status === 'pago') {
      this.awardCashbackForOrder(order);
    }

    this.data.orders.unshift(order);
    customer.totalOrders += 1;
    customer.totalSpent += total;

    this.save();
    broadcastEvent('snapshot_update', this.data);
    return order;
  }

  createMarketplaceOrder(params: {
    channel: Extract<OrderChannel, 'ifood' | '99food'>;
    externalOrderId: string;
    externalDisplayId?: string;
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
    autoAccept?: boolean;
  }): { order: Order; deduplicated: boolean } {
    const existing = this.data.orders.find(
      (o) => o.channel === params.channel && o.externalOrderId === params.externalOrderId
    );
    if (existing) {
      return { order: existing, deduplicated: true };
    }

    const channelLabel = params.channel === 'ifood' ? 'iFood' : '99Food';
    const rawPhone = (params.customerPhone ?? '').trim();
    const digits = rawPhone.replace(/\D/g, '');
    const displayPhone = rawPhone || `${channelLabel} #${params.externalDisplayId || params.externalOrderId.slice(0, 8)}`;

    let customer = digits
      ? this.data.customers.find((c) => c.phone.replace(/\D/g, '') === digits)
      : undefined;

    if (!customer) {
      customer = {
        id: `cust-${crypto.randomUUID().slice(0, 8)}`,
        phone: displayPhone,
        name: params.customerName.trim() || `Cliente ${channelLabel}`,
        address: params.deliveryAddress.trim(),
        neighborhood: params.neighborhood?.trim() ?? '',
        complement: params.complement?.trim() ?? '',
        notes: params.orderNotes?.trim() ? `[${channelLabel}] ${params.orderNotes.trim()}` : `Cliente via ${channelLabel}`,
        channel: params.channel,
        autoRegistered: true,
        registeredAt: new Date().toISOString(),
        totalOrders: 0,
        totalSpent: 0,
      };
      this.data.customers.unshift(customer);
    } else {
      if (params.customerName.trim() && customer.name.startsWith('Contato Novo')) {
        customer.name = params.customerName.trim();
      }
      if (params.deliveryAddress.trim() && !customer.address) {
        customer.address = params.deliveryAddress.trim();
      }
    }

    const resolvedItems: OrderItem[] = params.items.map((item) => {
      const cleanId = (item.menuItemId ?? '').trim().toLowerCase();
      const cleanName = item.name.trim().toLowerCase();
      const matched = this.data.menu.find(
        (m) =>
          (cleanId && m.id.toLowerCase() === cleanId) ||
          m.name.toLowerCase() === cleanName ||
          (cleanName.length >= 4 && m.name.toLowerCase().includes(cleanName))
      );

      return {
        menuItemId: matched?.id ?? (item.menuItemId || `ext-${crypto.randomUUID().slice(0, 6)}`),
        name: matched?.name ?? item.name.trim(),
        size: item.size ?? (matched?.category === 'Bebidas' ? 'unico' : 'grande'),
        crust: item.crust,
        quantity: Math.max(1, Math.round(Number(item.quantity) || 1)),
        unitPrice: Math.max(0, Number(item.unitPrice) || matched?.prices.grande || 0),
        notes: item.notes?.trim() || undefined,
      };
    });

    const subtotal = resolvedItems.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0);
    const deliveryFee =
      typeof params.deliveryFee === 'number' && Number.isFinite(params.deliveryFee) && params.deliveryFee >= 0
        ? params.deliveryFee
        : this.data.settings.deliveryFee;
    const total = subtotal + deliveryFee;

    const maxOrderNum = this.data.orders.reduce((max, o) => {
      const num = Number(o.id.replace(/\D/g, ''));
      return Number.isFinite(num) && num > max ? num : max;
    }, 2049);
    const orderNum = maxOrderNum + 1;
    const code = `#${orderNum}`;
    const id = `ord-${orderNum}`;
    const nowIso = new Date().toISOString();

    const shouldAutoAccept = Boolean(params.autoAccept);
    const stage: OrderStage = shouldAutoAccept ? 'em_preparo' : 'recebido';

    const timeline: Order['timeline'] = [
      {
        stage: 'recebido',
        timestamp: nowIso,
        note: `Pedido recebido automaticamente via ${channelLabel}${
          params.externalDisplayId ? ` (${params.externalDisplayId})` : ''
        }`,
      },
    ];
    if (shouldAutoAccept) {
      timeline.push({
        stage: 'em_preparo',
        timestamp: nowIso,
        note: `Aceite automático ${channelLabel} ativo · enviado para a cozinha`,
      });
    }

    const prefix = params.channel === 'ifood' ? 'IFD' : '99F';
    const fullAddress = [
      params.deliveryAddress.trim(),
      params.neighborhood?.trim(),
      params.complement?.trim() ? `(${params.complement.trim()})` : '',
    ]
      .filter(Boolean)
      .join(' - ') || 'Retirada no balcão';

    const order: Order = {
      id,
      code,
      channel: params.channel,
      externalOrderId: params.externalOrderId,
      externalDisplayId: params.externalDisplayId,
      pickupCode: params.pickupCode?.trim() || undefined,
      deliveryBy: params.deliveryBy ?? 'marketplace',
      orderNotes: params.orderNotes?.trim() || undefined,
      customerId: customer.id,
      customerName: customer.name,
      customerPhone: customer.phone,
      deliveryAddress: fullAddress,
      items: resolvedItems,
      subtotal,
      deliveryFee,
      total,
      stage,
      payment: {
        method: params.paymentMethod,
        status: params.paymentStatus,
        amount: total,
        transactionId: `${prefix}-${params.externalDisplayId || orderNum}`,
        paidAt: params.paymentStatus === 'pago' ? nowIso : undefined,
      },
      estimatedMinutes: shouldAutoAccept ? 28 : this.data.settings.averagePrepMinutes,
      createdAt: nowIso,
      updatedAt: nowIso,
      timeline,
    };

    this.data.orders.unshift(order);
    customer.totalOrders += 1;
    customer.totalSpent += total;

    this.save();
    broadcastEvent('marketplace_order', {
      orderId: order.id,
      orderCode: order.code,
      externalDisplayId: order.externalDisplayId,
      channel: params.channel,
      customerName: order.customerName,
      amount: order.total,
      paid: order.payment.status === 'pago',
    });
    broadcastEvent('snapshot_update', this.data);
    return { order, deduplicated: false };
  }

  cancelMarketplaceOrder(
    channel: Extract<OrderChannel, 'ifood' | '99food'>,
    externalOrderId: string,
    reason?: string
  ): Order | null {
    const order = this.data.orders.find(
      (o) => o.channel === channel && o.externalOrderId === externalOrderId
    );
    if (!order) return null;
    if (order.stage === 'cancelado') return order;

    const nowIso = new Date().toISOString();
    order.stage = 'cancelado';
    order.updatedAt = nowIso;
    order.estimatedMinutes = 0;
    order.timeline.push({
      stage: 'cancelado',
      timestamp: nowIso,
      note: reason?.trim() || `Cancelado via webhook ${channel === 'ifood' ? 'iFood' : '99Food'}`,
    });

    this.save();
    broadcastEvent('snapshot_update', this.data);
    return order;
  }

  confirmOrderPayment(orderId: string): Order | null {
    const order = this.data.orders.find((o) => o.id === orderId);
    if (!order) return null;

    if (order.payment.status === 'pago') return order;

    const nowIso = new Date().toISOString();
    order.payment.status = 'pago';
    order.payment.paidAt = nowIso;
    order.updatedAt = nowIso;

    this.awardCashbackForOrder(order);

    if (order.stage === 'recebido') {
      order.stage = 'em_preparo';
      order.estimatedMinutes = 28;
      order.timeline.push({
        stage: 'em_preparo',
        timestamp: nowIso,
        note: 'Pagamento confirmado! Massa em abertura na cozinha.',
      });
    }

    // Update any attached payment card inside messages so it reflects paid status live
    for (const msg of this.data.messages) {
      if (msg.attachment?.type === 'payment' && msg.attachment.orderId === order.id) {
        msg.attachment.payment = { ...order.payment };
      }
    }

    // Automatically push WhatsApp confirmation + live tracking card into chat when linked
    if (order.conversationId) {
      const cashbackNote =
        order.cashbackEarned && order.cashbackEarned > 0
          ? ` Você ganhou R$ ${order.cashbackEarned.toFixed(2).replace('.', ',')} de cashback para seu próximo pedido!`
          : '';
      this.addMessage({
        conversationId: order.conversationId,
        sender: 'ai',
        text: `Pagamento de R$ ${order.total.toFixed(2).replace('.', ',')} confirmado! Seu pedido ${order.code} já entrou em preparo na cozinha.${cashbackNote} Acompanhe o rastreio em tempo real abaixo:`,
        status: 'read',
        aiActionLabel: `Pagamento aprovado · Rastreio ${order.code}`,
        attachment: {
          type: 'tracking',
          orderId: order.id,
        },
      });
    }

    this.save();
    broadcastEvent('payment_confirmed', {
      orderId: order.id,
      orderCode: order.code,
      customerName: order.customerName,
      amount: order.total,
      method: order.payment.method,
    });
    broadcastEvent('snapshot_update', this.data);
    return order;
  }

  advanceOrderStage(orderId: string, targetStage?: OrderStage): Order | null {
    const order = this.data.orders.find((o) => o.id === orderId);
    if (!order) return null;

    const sequence: OrderStage[] = ['recebido', 'em_preparo', 'no_forno', 'saiu_entrega', 'entregue'];
    const currentIndex = sequence.indexOf(order.stage);
    const nextStage =
      targetStage ?? (currentIndex >= 0 && currentIndex < sequence.length - 1 ? sequence[currentIndex + 1] : null);

    if (!nextStage || nextStage === order.stage) return order;

    const nowIso = new Date().toISOString();
    order.stage = nextStage;
    order.updatedAt = nowIso;

    const driverLabel = order.riderName || 'Thiago Santos';
    const stageNotes: Record<OrderStage, { note: string; eta: number; chatMsg: string }> = {
      recebido: {
        note: 'Pedido recebido na fila',
        eta: 35,
        chatMsg: `Seu pedido ${order.code} foi recebido pela equipe!`,
      },
      em_preparo: {
        note: 'Pizzaiolo abrindo a massa e montando os ingredientes',
        eta: 28,
        chatMsg: `Atualização ${order.code}: Sua pizza já está sendo montada com massa fresca na bancada.`,
      },
      no_forno: {
        note: 'Assando no forno a lenha a 430°C',
        eta: 18,
        chatMsg: `Atualização ${order.code}: Sua pizza acabou de entrar no forno a lenha! Previsão de entrega em ~18 min.`,
      },
      saiu_entrega: {
        note:
          order.serviceType === 'retirada'
            ? 'Pronto para retirada no balcão'
            : order.serviceType === 'mesa'
              ? 'Servido na mesa'
              : `Saiu para entrega com o entregador ${driverLabel}`,
        eta: order.serviceType === 'entrega' || !order.serviceType ? 10 : 0,
        chatMsg:
          order.serviceType === 'retirada'
            ? `Boa notícia! Seu pedido ${order.code} está prontinho para retirada no balcão.`
            : order.serviceType === 'mesa'
              ? `Seu pedido ${order.code} acabou de sair do forno e está sendo levado à sua mesa!`
              : `Boa notícia! O pedido ${order.code} foi produzido e saiu em rota com nosso entregador ${driverLabel} (chegada prevista em ~10 min).`,
      },
      entregue: {
        note: 'Pedido finalizado e entregue ao cliente',
        eta: 0,
        chatMsg: `Pedido ${order.code} entregue! Bom apetite e obrigado por pedir na ${this.data.settings.pizzeriaName}.`,
      },
      cancelado: {
        note: 'Pedido cancelado pelo operador',
        eta: 0,
        chatMsg: `O pedido ${order.code} foi cancelado. Se precisar de ajuda, responda por aqui.`,
      },
    };

    const meta = stageNotes[nextStage];
    order.estimatedMinutes = meta.eta;
    if (nextStage === 'saiu_entrega' && !order.riderName && (order.serviceType ?? 'entrega') === 'entrega') {
      const defaultDriver = this.data.drivers.find((d) => d.active) ?? this.data.drivers[0];
      if (defaultDriver) {
        order.driverId = defaultDriver.id;
        order.riderName = `${defaultDriver.name}${defaultDriver.vehicle ? ` (${defaultDriver.vehicle})` : ''}`;
        order.riderPhone = defaultDriver.phone;
      } else {
        order.riderName = 'Thiago Santos (Moto Honda CG)';
      }
    }

    if (nextStage === 'entregue' && order.payment.status === 'pagamento_na_entrega') {
      order.payment.status = 'pago';
      order.payment.paidAt = nowIso;
      this.awardCashbackForOrder(order);
    }

    order.timeline.push({
      stage: nextStage,
      timestamp: nowIso,
      note: meta.note,
    });

    if (this.data.settings.autoNotifyOrderUpdates && order.conversationId) {
      this.addMessage({
        conversationId: order.conversationId,
        sender: 'ai',
        text: meta.chatMsg,
        status: 'read',
        aiActionLabel: `Rastreio em tempo real · ${order.code}`,
      });
    } else {
      this.save();
      broadcastEvent('snapshot_update', this.data);
    }

    return order;
  }

  assignOrderDriver(orderId: string, driverId: string | null): Order | null {
    const order = this.data.orders.find((o) => o.id === orderId);
    if (!order) return null;

    if (!driverId) {
      order.driverId = undefined;
      order.riderName = undefined;
      order.riderPhone = undefined;
      order.updatedAt = new Date().toISOString();
      this.save();
      broadcastEvent('snapshot_update', this.data);
      return order;
    }

    const driver = this.data.drivers.find((d) => d.id === driverId);
    if (!driver) return null;

    order.driverId = driver.id;
    order.riderName = driver.vehicle ? `${driver.name} (${driver.vehicle})` : driver.name;
    order.riderPhone = driver.phone;
    order.updatedAt = new Date().toISOString();
    this.save();
    broadcastEvent('snapshot_update', this.data);
    return order;
  }

  markOrderDispatchedToDriver(orderId: string): Order | null {
    const order = this.data.orders.find((o) => o.id === orderId);
    if (!order) return null;
    const nowIso = new Date().toISOString();
    order.dispatchedToDriverAt = nowIso;
    order.updatedAt = nowIso;
    if (order.riderName) {
      order.timeline.push({
        stage: order.stage,
        timestamp: nowIso,
        note: `Rota enviada no WhatsApp do entregador ${order.riderName}`,
      });
    }
    this.save();
    broadcastEvent('snapshot_update', this.data);
    return order;
  }

  addDriver(input: { name: string; phone: string; vehicle?: string }): DeliveryDriver {
    if (!input.name?.trim() || !input.phone?.trim()) {
      throw new Error('Nome e WhatsApp do entregador são obrigatórios.');
    }
    const created: DeliveryDriver = {
      id: `drv-${crypto.randomUUID().slice(0, 8)}`,
      name: input.name.trim(),
      phone: input.phone.trim(),
      vehicle: input.vehicle?.trim() || 'Moto',
      active: true,
      createdAt: new Date().toISOString(),
    };
    this.data.drivers.push(created);
    this.save();
    broadcastEvent('snapshot_update', this.data);
    return created;
  }

  updateDriver(id: string, patch: Partial<Omit<DeliveryDriver, 'id' | 'createdAt'>>): DeliveryDriver | null {
    const driver = this.data.drivers.find((d) => d.id === id);
    if (!driver) return null;
    if (typeof patch.name === 'string' && patch.name.trim()) driver.name = patch.name.trim();
    if (typeof patch.phone === 'string' && patch.phone.trim()) driver.phone = patch.phone.trim();
    if (typeof patch.vehicle === 'string') driver.vehicle = patch.vehicle.trim();
    if (typeof patch.active === 'boolean') driver.active = patch.active;
    this.save();
    broadcastEvent('snapshot_update', this.data);
    return driver;
  }

  deleteDriver(id: string): boolean {
    const idx = this.data.drivers.findIndex((d) => d.id === id);
    if (idx === -1) return false;
    this.data.drivers.splice(idx, 1);
    this.save();
    broadcastEvent('snapshot_update', this.data);
    return true;
  }

  addCoupon(input: { code: string; type: 'percent' | 'fixed'; value: number; minOrder?: number }): Coupon {
    const code = input.code?.trim().toUpperCase().replace(/\s+/g, '');
    const value = Number(input.value);
    if (!code || !Number.isFinite(value) || value <= 0) {
      throw new Error('Informe um código de cupom e valor de desconto válidos.');
    }
    if (this.data.coupons.some((c) => c.code.toUpperCase() === code)) {
      throw new Error(`O cupom ${code} já existe.`);
    }
    const created: Coupon = {
      id: `cpn-${crypto.randomUUID().slice(0, 8)}`,
      code,
      type: input.type === 'fixed' ? 'fixed' : 'percent',
      value: input.type === 'percent' ? Math.min(90, value) : value,
      minOrder:
        typeof input.minOrder === 'number' && Number.isFinite(input.minOrder) && input.minOrder > 0
          ? input.minOrder
          : undefined,
      active: true,
      usageCount: 0,
      createdAt: new Date().toISOString(),
    };
    this.data.coupons.unshift(created);
    this.save();
    broadcastEvent('snapshot_update', this.data);
    return created;
  }

  updateCoupon(id: string, patch: Partial<Pick<Coupon, 'active' | 'value' | 'minOrder'>>): Coupon | null {
    const coupon = this.data.coupons.find((c) => c.id === id);
    if (!coupon) return null;
    if (typeof patch.active === 'boolean') coupon.active = patch.active;
    if (typeof patch.value === 'number' && Number.isFinite(patch.value) && patch.value > 0) {
      coupon.value = coupon.type === 'percent' ? Math.min(90, patch.value) : patch.value;
    }
    if (patch.minOrder !== undefined) {
      coupon.minOrder = patch.minOrder > 0 ? patch.minOrder : undefined;
    }
    this.save();
    broadcastEvent('snapshot_update', this.data);
    return coupon;
  }

  deleteCoupon(id: string): boolean {
    const idx = this.data.coupons.findIndex((c) => c.id === id);
    if (idx === -1) return false;
    this.data.coupons.splice(idx, 1);
    this.save();
    broadcastEvent('snapshot_update', this.data);
    return true;
  }

  updatePromotions(patch: {
    cashback?: Partial<CashbackConfig>;
    progressiveEnabled?: boolean;
    progressiveTiers?: { id?: string; minItems: number; discountPercent: number }[];
  }): PromotionsConfig {
    if (patch.cashback) {
      const cb = patch.cashback;
      if (typeof cb.enabled === 'boolean') this.data.promotions.cashback.enabled = cb.enabled;
      if (typeof cb.percent === 'number' && Number.isFinite(cb.percent) && cb.percent >= 0) {
        this.data.promotions.cashback.percent = Math.min(50, cb.percent);
      }
      if (typeof cb.validityDays === 'number' && Number.isFinite(cb.validityDays) && cb.validityDays >= 1) {
        this.data.promotions.cashback.validityDays = Math.round(cb.validityDays);
      }
      if (typeof cb.minOrderValue === 'number' && Number.isFinite(cb.minOrderValue) && cb.minOrderValue >= 0) {
        this.data.promotions.cashback.minOrderValue = cb.minOrderValue;
      }
    }
    if (typeof patch.progressiveEnabled === 'boolean') {
      this.data.promotions.progressiveEnabled = patch.progressiveEnabled;
    }
    if (Array.isArray(patch.progressiveTiers)) {
      this.data.promotions.progressiveTiers = patch.progressiveTiers
        .filter((t) => Number(t.minItems) >= 2 && Number(t.discountPercent) > 0)
        .map((t, idx) => ({
          id: t.id || `prog-${idx + 1}`,
          minItems: Math.round(Number(t.minItems)),
          discountPercent: Math.min(50, Number(t.discountPercent)),
        }))
        .sort((a, b) => a.minItems - b.minItems);
    }
    this.save();
    broadcastEvent('snapshot_update', this.data);
    return this.data.promotions;
  }

  createPdvOrder(input: {
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
  }): Order {
    if (!input.items || input.items.length === 0) {
      throw new Error('Adicione ao menos 1 item ao pedido.');
    }

    const phone = input.customerPhone?.trim() || 'Balcão';
    const digits = phone.replace(/\D/g, '');
    let customer = digits
      ? this.data.customers.find((c) => c.phone.replace(/\D/g, '') === digits)
      : undefined;

    if (!customer) {
      customer = {
        id: `cust-${crypto.randomUUID().slice(0, 8)}`,
        phone,
        name: input.customerName.trim() || (input.serviceType === 'mesa' ? `Mesa ${input.tableNumber || 'Local'}` : 'Cliente Balcão'),
        address: input.deliveryAddress?.trim() || '',
        neighborhood: input.neighborhood?.trim() || '',
        complement: input.complement?.trim() || '',
        notes: '',
        channel: 'pdv',
        autoRegistered: Boolean(input.customerName.trim()),
        registeredAt: new Date().toISOString(),
        totalOrders: 0,
        totalSpent: 0,
      };
      this.data.customers.unshift(customer);
    } else if (input.deliveryAddress?.trim() && !customer.address) {
      customer.address = input.deliveryAddress.trim();
      if (input.neighborhood?.trim()) customer.neighborhood = input.neighborhood.trim();
    }

    const resolvedItems: OrderItem[] = [];
    for (const raw of input.items) {
      const menuItem = this.data.menu.find((m) => m.id === raw.menuItemId);
      if (!menuItem) continue;
      const size: OrderItem['size'] =
        menuItem.category === 'Bebidas' ? 'unico' : raw.size || 'grande';
      const basePrice =
        size === 'media'
          ? (menuItem.prices.media ?? menuItem.prices.grande)
          : size === 'gigante'
            ? (menuItem.prices.gigante ?? menuItem.prices.grande)
            : menuItem.prices.grande;
      const crustExtra =
        raw.crust && /catupiry|cheddar/i.test(raw.crust) && menuItem.category !== 'Bebidas' ? 16 : 0;

      resolvedItems.push({
        menuItemId: menuItem.id,
        name: menuItem.name,
        size,
        crust: menuItem.category !== 'Bebidas' ? raw.crust || 'Tradicional' : undefined,
        quantity: Math.max(1, Math.round(raw.quantity || 1)),
        unitPrice: basePrice + crustExtra,
        notes: raw.notes?.trim() || undefined,
      });
    }

    if (resolvedItems.length === 0) {
      throw new Error('Nenhum item válido encontrado no cardápio.');
    }

    const deliveryAddressOverride =
      input.serviceType === 'entrega'
        ? [input.deliveryAddress?.trim(), input.neighborhood?.trim(), input.complement?.trim() ? `(${input.complement.trim()})` : '']
            .filter(Boolean)
            .join(' - ')
        : undefined;

    return this.createOrder({
      customerId: customer.id,
      channel: 'pdv',
      serviceType: input.serviceType,
      tableNumber: input.tableNumber,
      items: resolvedItems,
      paymentMethod: input.paymentMethod,
      paymentStatusOverride: input.paidNow ? 'pago' : undefined,
      changeFor: input.changeFor,
      couponCode: input.couponCode,
      useCashback: input.useCashback,
      orderNotes: input.orderNotes,
      deliveryAddressOverride,
    });
  }

  updateMenuItem(id: string, patch: Partial<MenuItem>): MenuItem | null {
    const item = this.data.menu.find((m) => m.id === id);
    if (!item) return null;
    if (typeof patch.name === 'string' && patch.name.trim()) {
      item.name = patch.name.trim();
    }
    if (typeof patch.description === 'string') {
      item.description = patch.description.trim();
    }
    if (typeof patch.available === 'boolean') {
      item.available = patch.available;
    }
    if (patch.category) {
      item.category = patch.category;
    }
    if (patch.prices && typeof patch.prices === 'object') {
      const grande = Number(patch.prices.grande);
      if (Number.isFinite(grande) && grande > 0) {
        const nextPrices: MenuItem['prices'] = { grande };
        const media = Number(patch.prices.media);
        if (Number.isFinite(media) && media > 0) nextPrices.media = media;
        const gigante = Number(patch.prices.gigante);
        if (Number.isFinite(gigante) && gigante > 0) nextPrices.gigante = gigante;
        item.prices = nextPrices;
      }
    }
    if (patch.imageUrl !== undefined) {
      const cleaned = typeof patch.imageUrl === 'string' ? patch.imageUrl.trim() : '';
      item.imageUrl = cleaned || undefined;
    }
    this.save();
    broadcastEvent('snapshot_update', this.data);
    return item;
  }

  addMenuItem(item: Omit<MenuItem, 'id'>): MenuItem {
    const grande = Number(item.prices?.grande);
    if (!item.name?.trim() || !Number.isFinite(grande) || grande <= 0) {
      throw new Error('Nome do produto e preço válido são obrigatórios.');
    }
    const created: MenuItem = {
      id: `item-${crypto.randomUUID().slice(0, 8)}`,
      name: item.name.trim(),
      category: item.category || 'Especiais',
      description: item.description?.trim() || 'Preparo artesanal em forno a lenha.',
      prices: {
        grande,
        ...(Number.isFinite(Number(item.prices?.media)) && Number(item.prices?.media) > 0
          ? { media: Number(item.prices.media) }
          : {}),
        ...(Number.isFinite(Number(item.prices?.gigante)) && Number(item.prices?.gigante) > 0
          ? { gigante: Number(item.prices.gigante) }
          : {}),
      },
      imageUrl: item.imageUrl?.trim() || undefined,
      available: item.available ?? true,
    };
    this.data.menu.push(created);
    this.save();
    broadcastEvent('snapshot_update', this.data);
    return created;
  }

  updateSettings(patch: Partial<StoreSettings>): StoreSettings {
    const cleanPatch: Partial<StoreSettings> = { ...patch };
    if (cleanPatch.deliveryFee !== undefined) {
      const raw = cleanPatch.deliveryFee as unknown;
      const fee = typeof raw === 'number' ? raw : typeof raw === 'string' && raw.trim() ? Number(raw) : NaN;
      if (Number.isFinite(fee) && fee >= 0) {
        cleanPatch.deliveryFee = fee;
      } else {
        delete cleanPatch.deliveryFee;
      }
    }
    if (cleanPatch.averagePrepMinutes !== undefined) {
      const raw = cleanPatch.averagePrepMinutes as unknown;
      const mins = typeof raw === 'number' ? raw : typeof raw === 'string' && raw.trim() ? Number(raw) : NaN;
      if (Number.isFinite(mins) && mins >= 1) {
        cleanPatch.averagePrepMinutes = Math.round(mins);
      } else {
        delete cleanPatch.averagePrepMinutes;
      }
    }
    if (cleanPatch.backupSchedule !== undefined) {
      if (!['manual', 'hourly', 'daily'].includes(String(cleanPatch.backupSchedule))) {
        delete cleanPatch.backupSchedule;
      }
    }
    if (cleanPatch.backupDailyTime !== undefined) {
      if (
        typeof cleanPatch.backupDailyTime !== 'string' ||
        !/^([01]\d|2[0-3]):[0-5]\d$/.test(cleanPatch.backupDailyTime.trim())
      ) {
        delete cleanPatch.backupDailyTime;
      } else {
        cleanPatch.backupDailyTime = cleanPatch.backupDailyTime.trim();
      }
    }
    Object.assign(this.data.settings, cleanPatch);
    this.save();
    broadcastEvent('snapshot_update', this.data);
    return this.data.settings;
  }

  saveLocalBackupFile(tag: string): string {
    const backupsDir = path.join(DATA_DIR, 'backups');
    if (!fs.existsSync(backupsDir)) {
      fs.mkdirSync(backupsDir, { recursive: true });
    }
    const now = new Date();
    const stamp = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/Sao_Paulo',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    })
      .format(now)
      .replace(', ', '-')
      .replace(/:/g, '');
    const safeTag = tag.replace(/[^a-z0-9_-]/gi, '').toLowerCase() || 'auto';
    const filename = `fornodesk-backup-${safeTag}-${stamp}.json`;
    const filePath = path.join(backupsDir, filename);
    fs.writeFileSync(filePath, JSON.stringify(this.data, null, 2), 'utf-8');

    // Keep at most 30 recent local backups
    const files = fs
      .readdirSync(backupsDir)
      .filter((f) => f.endsWith('.json'))
      .sort();
    while (files.length > 30) {
      const oldest = files.shift();
      if (oldest) {
        try {
          fs.unlinkSync(path.join(backupsDir, oldest));
        } catch {
          // Ignore cleanup errors
        }
      }
    }

    return filename;
  }

  recordTelegramBackupResult(status: string, sentAt?: string): StoreSettings {
    this.data.settings.lastTelegramBackupStatus = status;
    if (sentAt) {
      this.data.settings.lastTelegramBackupAt = sentAt;
    }
    this.save();
    broadcastEvent('snapshot_update', this.data);
    return this.data.settings;
  }

  recordScheduledBackupResult(status: string, ranAt?: string): StoreSettings {
    this.data.settings.lastScheduledBackupStatus = status;
    if (ranAt) {
      this.data.settings.lastScheduledBackupAt = ranAt;
    }
    this.save();
    broadcastEvent('snapshot_update', this.data);
    return this.data.settings;
  }

  restoreSnapshot(raw: unknown): AppSnapshot {
    if (!raw || typeof raw !== 'object') {
      throw new Error('Arquivo de backup inválido: formato JSON esperado.');
    }
    const candidate = raw as Partial<AppSnapshot>;
    if (
      !Array.isArray(candidate.menu) ||
      !Array.isArray(candidate.customers) ||
      !Array.isArray(candidate.conversations) ||
      !Array.isArray(candidate.messages) ||
      !Array.isArray(candidate.orders) ||
      !candidate.settings ||
      typeof candidate.settings !== 'object'
    ) {
      throw new Error(
        'Arquivo de backup incompleto. Verifique se o JSON foi exportado pelo FornoDesk.'
      );
    }

    const defaults = createInitialData();
    const restored: AppSnapshot = {
      settings: {
        ...defaults.settings,
        ...candidate.settings,
      },
      menu: candidate.menu,
      customers: candidate.customers,
      conversations: candidate.conversations,
      messages: candidate.messages,
      orders: candidate.orders,
      drivers: Array.isArray(candidate.drivers) ? candidate.drivers : defaults.drivers,
      coupons: Array.isArray(candidate.coupons) ? candidate.coupons : defaults.coupons,
      promotions: candidate.promotions ?? defaults.promotions,
    };

    this.data = restored;
    this.save(this.data);
    broadcastEvent('snapshot_update', this.data);
    return this.data;
  }
}

export const store = new PizzeriaStore();
