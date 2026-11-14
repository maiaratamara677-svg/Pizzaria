export type OrderStage =
  | 'recebido'
  | 'em_preparo'
  | 'no_forno'
  | 'saiu_entrega'
  | 'entregue'
  | 'cancelado';

export type PaymentMethod = 'pix' | 'cartao_online' | 'cartao_entrega' | 'dinheiro';

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
  autoRegistered: boolean;
  registeredAt: string;
  totalOrders: number;
  totalSpent: number;
}

export interface OrderItem {
  menuItemId: string;
  name: string;
  size: 'media' | 'grande' | 'gigante' | 'unico';
  crust?: string;
  quantity: number;
  unitPrice: number;
  halfAndHalf?: string;
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
}

export interface Order {
  id: string;
  code: string;
  customerId: string;
  conversationId: string;
  customerName: string;
  customerPhone: string;
  deliveryAddress: string;
  items: OrderItem[];
  subtotal: number;
  deliveryFee: number;
  total: number;
  stage: OrderStage;
  payment: PaymentPayload;
  estimatedMinutes: number;
  riderName?: string;
  createdAt: string;
  updatedAt: string;
  timeline: {
    stage: OrderStage;
    timestamp: string;
    note: string;
  }[];
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
  telegramBotToken: string;
  telegramChatId: string;
  telegramAutoBackupOnPayment: boolean;
  lastTelegramBackupAt?: string;
  lastTelegramBackupStatus?: string;
  paymentSound: PaymentSoundType;
}

export interface AppSnapshot {
  settings: StoreSettings;
  menu: MenuItem[];
  customers: Customer[];
  conversations: Conversation[];
  messages: ChatMessage[];
  orders: Order[];
}
