export type OrderChannel = 'whatsapp' | 'ifood' | '99food' | 'pdv';

export type OrderServiceType = 'entrega' | 'retirada' | 'mesa';

export type OrderStage =
  | 'recebido'
  | 'em_preparo'
  | 'no_forno'
  | 'saiu_entrega'
  | 'entregue'
  | 'cancelado';

export type PaymentMethod =
  | 'pix'
  | 'cartao_online'
  | 'cartao_entrega'
  | 'dinheiro'
  | 'ifood_online'
  | '99food_online';

export type PaymentStatus = 'aguardando' | 'pago' | 'pagamento_na_entrega';

export type PaymentSoundType = 'cozinha' | 'hotel' | 'caixa_eletronico' | 'dinheiro';

export interface MenuItem {
  id: string;
  name: string;
  category: 'Tradicionais' | 'Especiais' | 'Doces' | 'Bebidas';
  description: string;
  prices: {
    media?: number;
    grande: number;
    gigante?: number;
  };
  imageUrl?: string;
  available: boolean;
}

export interface Customer {
  id: string;
  phone: string;
  name: string;
  address: string;
  neighborhood: string;
  complement: string;
  notes: string;
  channel?: OrderChannel;
  autoRegistered: boolean;
  registeredAt: string;
  totalOrders: number;
  totalSpent: number;
  cashbackBalance?: number;
  cashbackExpiresAt?: string;
}

export interface OrderItem {
  menuItemId: string;
  name: string;
  size: 'media' | 'grande' | 'gigante' | 'unico';
  crust?: string;
  quantity: number;
  unitPrice: number;
  halfAndHalf?: string;
  notes?: string;
}

export interface PaymentPayload {
  method: PaymentMethod;
  status: PaymentStatus;
  amount: number;
  pixCode?: string;
  checkoutUrl?: string;
  transactionId: string;
  paidAt?: string;
  expiresAt?: string;
  changeFor?: number;
  changeAmount?: number;
}

export interface Order {
  id: string;
  code: string;
  channel?: OrderChannel;
  serviceType?: OrderServiceType;
  tableNumber?: string;
  externalOrderId?: string;
  externalDisplayId?: string;
  pickupCode?: string;
  deliveryBy?: 'loja' | 'marketplace';
  orderNotes?: string;
  customerId: string;
  conversationId?: string;
  customerName: string;
  customerPhone: string;
  deliveryAddress: string;
  items: OrderItem[];
  subtotal: number;
  deliveryFee: number;
  discountTotal?: number;
  couponCode?: string;
  cashbackUsed?: number;
  cashbackEarned?: number;
  progressiveDiscount?: number;
  total: number;
  stage: OrderStage;
  payment: PaymentPayload;
  estimatedMinutes: number;
  driverId?: string;
  riderName?: string;
  riderPhone?: string;
  dispatchedToDriverAt?: string;
  createdAt: string;
  updatedAt: string;
  timeline: {
    stage: OrderStage;
    timestamp: string;
    note: string;
  }[];
}

export interface DeliveryDriver {
  id: string;
  name: string;
  phone: string;
  vehicle: string;
  active: boolean;
  createdAt: string;
}

export interface Coupon {
  id: string;
  code: string;
  type: 'percent' | 'fixed';
  value: number;
  minOrder?: number;
  active: boolean;
  usageCount: number;
  createdAt: string;
}

export interface ProgressiveTier {
  id: string;
  minItems: number;
  discountPercent: number;
}

export interface CashbackConfig {
  enabled: boolean;
  percent: number;
  validityDays: number;
  minOrderValue: number;
}

export interface PromotionsConfig {
  cashback: CashbackConfig;
  progressiveEnabled: boolean;
  progressiveTiers: ProgressiveTier[];
}

export type MessageAttachment =
  | {
      type: 'menu_highlight';
      items: MenuItem[];
    }
  | {
      type: 'payment';
      orderId: string;
      orderCode: string;
      payment: PaymentPayload;
    }
  | {
      type: 'tracking';
      orderId: string;
    };

export interface ChatMessage {
  id: string;
  conversationId: string;
  sender: 'customer' | 'ai' | 'agent' | 'system';
  text: string;
  timestamp: string;
  status?: 'sent' | 'delivered' | 'read';
  attachment?: MessageAttachment;
  aiActionLabel?: string;
}

export interface Conversation {
  id: string;
  customerId: string;
  aiEnabled: boolean;
  unreadCount: number;
  lastMessageAt: string;
  lastMessagePreview: string;
  handoffRequested: boolean;
}

export type BackupSchedule = 'manual' | 'hourly' | 'daily';

export interface StoreSettings {
  pizzeriaName: string;
  whatsappPhoneDisplay: string;
  pixKey: string;
  deliveryFee: number;
  averagePrepMinutes: number;
  aiPersonaTone: string;
  autoNotifyOrderUpdates: boolean;
  whatsappVerifyToken: string;
  whatsappPhoneNumberId: string;
  ifoodEnabled: boolean;
  ifoodMerchantId: string;
  ifoodWebhookSecret: string;
  ifoodAutoAccept: boolean;
  food99Enabled: boolean;
  food99StoreId: string;
  food99WebhookSecret: string;
  food99AutoAccept: boolean;
  telegramBotToken: string;
  telegramChatId: string;
  telegramAutoBackupOnPayment: boolean;
  lastTelegramBackupAt?: string;
  lastTelegramBackupStatus?: string;
  backupSchedule: BackupSchedule;
  backupDailyTime: string;
  lastScheduledBackupAt?: string;
  lastScheduledBackupStatus?: string;
  paymentSound: PaymentSoundType;
}

export interface AppSnapshot {
  settings: StoreSettings;
  menu: MenuItem[];
  customers: Customer[];
  conversations: Conversation[];
  messages: ChatMessage[];
  orders: Order[];
  drivers: DeliveryDriver[];
  coupons: Coupon[];
  promotions: PromotionsConfig;
}
