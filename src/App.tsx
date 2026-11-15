import React, { useEffect, useRef, useState } from 'react';
import {
  Bell,
  Bike,
  Flame,
  MessageSquare,
  MessageSquarePlus,
  Percent,
  Pizza,
  Receipt,
  Settings,
  Users,
  UtensilsCrossed,
  Volume2,
  VolumeX,
  X,
} from 'lucide-react';
import type {
  AppSnapshot,
  Customer,
  DeliveryDriver,
  MenuItem,
  Order,
  OrderStage,
  PaymentSoundType,
  PromotionsConfig,
  StoreSettings,
} from './types.ts';
import { WhatsAppWorkspace } from './components/WhatsAppWorkspace.tsx';
import { KitchenOrdersView } from './components/KitchenOrdersView.tsx';
import { DailySalesView } from './components/DailySalesView.tsx';
import { CustomersView } from './components/CustomersView.tsx';
import { MenuView } from './components/MenuView.tsx';
import { SettingsView } from './components/SettingsView.tsx';
import { DriversView } from './components/DriversView.tsx';
import { PromotionsView } from './components/PromotionsView.tsx';
import { PdvOrderModal, type PdvOrderPayload } from './components/PdvOrderModal.tsx';
import { OrderReceiptModal } from './components/OrderReceiptModal.tsx';
import {
  PAYMENT_SOUND_OPTIONS,
  playPaymentSound,
  unlockKitchenBellAudio,
} from './utils/sound.ts';
import { formatBRL } from './utils/format.ts';

type NavTab =
  | 'whatsapp'
  | 'kitchen'
  | 'sales'
  | 'drivers'
  | 'promotions'
  | 'customers'
  | 'menu'
  | 'settings';

export default function App() {
  const [snapshot, setSnapshot] = useState<AppSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<NavTab>('whatsapp');
  const [selectedConversationId, setSelectedConversationId] = useState<string>('conv-2');

  const [showNewChatModal, setShowNewChatModal] = useState(false);
  const [newChatPhone, setNewChatPhone] = useState('+55 11 99812-3344');
  const [newChatName, setNewChatName] = useState('');
  const [newChatFirstMessage, setNewChatFirstMessage] = useState('');
  const [newChatError, setNewChatError] = useState<string | null>(null);
  const [creatingChat, setCreatingChat] = useState(false);

  const [showPdvModal, setShowPdvModal] = useState(false);
  const [receiptModal, setReceiptModal] = useState<{
    orderId: string;
    tab: 'comanda' | 'motoboy';
  } | null>(null);

  const openNewChatModal = () => {
    const part1 = Math.floor(1000 + Math.random() * 9000);
    const part2 = Math.floor(1000 + Math.random() * 9000);
    setNewChatPhone(`+55 11 9${part1}-${part2}`);
    setNewChatName('');
    setNewChatFirstMessage('');
    setNewChatError(null);
    setShowNewChatModal(true);
  };

  const [bellEnabled, setBellEnabled] = useState(true);
  const [paymentToast, setPaymentToast] = useState<{
    title: string;
    orderCode: string;
    customerName: string;
    amount: number;
  } | null>(null);

  const selectedPaymentSound: PaymentSoundType = snapshot?.settings.paymentSound ?? 'cozinha';
  const bellEnabledRef = useRef(bellEnabled);
  bellEnabledRef.current = bellEnabled;
  const paymentSoundRef = useRef<PaymentSoundType>(selectedPaymentSound);
  paymentSoundRef.current = selectedPaymentSound;
  const lastBellOrderIdRef = useRef<string | null>(null);

  const triggerPaymentBell = (payload: {
    orderId: string;
    orderCode: string;
    customerName: string;
    amount: number;
    title?: string;
  }) => {
    if (lastBellOrderIdRef.current === payload.orderId) return;
    lastBellOrderIdRef.current = payload.orderId;

    if (bellEnabledRef.current) {
      playPaymentSound(paymentSoundRef.current);
    }
    setPaymentToast({
      title: payload.title ?? 'Pagamento Confirmado',
      orderCode: payload.orderCode,
      customerName: payload.customerName,
      amount: payload.amount,
    });
    setTimeout(() => {
      setPaymentToast((prev) =>
        prev?.orderCode === payload.orderCode ? null : prev
      );
    }, 6500);
  };

  useEffect(() => {
    const unlock = () => unlockKitchenBellAudio();
    window.addEventListener('pointerdown', unlock, { once: true });
    window.addEventListener('keydown', unlock, { once: true });
    return () => {
      window.removeEventListener('pointerdown', unlock);
      window.removeEventListener('keydown', unlock);
    };
  }, []);

  useEffect(() => {
    let active = true;

    fetch('/api/snapshot')
      .then((res) => {
        if (!res.ok) throw new Error('Falha ao carregar dados iniciais.');
        return res.json();
      })
      .then((data: AppSnapshot) => {
        if (!active) return;
        setSnapshot(data);
        if (data.conversations.length > 0) {
          setSelectedConversationId((prev) =>
            data.conversations.some((c) => c.id === prev) ? prev : data.conversations[0].id
          );
        }
        setLoading(false);
      })
      .catch((err) => {
        if (!active) return;
        setError(err instanceof Error ? err.message : 'Erro ao conectar ao servidor.');
        setLoading(false);
      });

    const eventSource = new EventSource('/api/events');
    eventSource.addEventListener('snapshot_update', (evt) => {
      try {
        const updated = JSON.parse((evt as MessageEvent).data) as AppSnapshot;
        if (active) setSnapshot(updated);
      } catch {
        // Ignore malformed SSE payload
      }
    });

    eventSource.addEventListener('payment_confirmed', (evt) => {
      try {
        const payload = JSON.parse((evt as MessageEvent).data) as {
          orderId: string;
          orderCode: string;
          customerName: string;
          amount: number;
        };
        if (active) {
          triggerPaymentBell(payload);
        }
      } catch {
        // Ignore malformed SSE payload
      }
    });

    eventSource.addEventListener('marketplace_order', (evt) => {
      try {
        const payload = JSON.parse((evt as MessageEvent).data) as {
          orderId: string;
          orderCode: string;
          externalDisplayId?: string;
          channel: 'ifood' | '99food';
          customerName: string;
          amount: number;
        };
        if (active) {
          const channelLabel = payload.channel === 'ifood' ? 'iFood' : '99Food';
          triggerPaymentBell({
            orderId: payload.orderId,
            orderCode: payload.externalDisplayId
              ? `${payload.orderCode} (${payload.externalDisplayId})`
              : payload.orderCode,
            customerName: payload.customerName,
            amount: payload.amount,
            title: `Novo Pedido ${channelLabel}`,
          });
        }
      } catch {
        // Ignore malformed SSE payload
      }
    });

    return () => {
      active = false;
      eventSource.close();
    };
  }, []);

  const handleSendMessage = async (
    conversationId: string,
    sender: 'customer' | 'agent',
    text: string
  ) => {
    const res = await fetch(`/api/conversations/${conversationId}/messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sender, text }),
    });
    const data = await res.json().catch(() => ({}));
    if (data.snapshot) setSnapshot(data.snapshot);
    if (!res.ok) {
      throw new Error(data.error || 'Erro ao enviar mensagem.');
    }
  };

  const handleRetryAi = async (conversationId: string) => {
    const res = await fetch(`/api/conversations/${conversationId}/retry-ai`, {
      method: 'POST',
    });
    const data = await res.json().catch(() => ({}));
    if (data.snapshot) setSnapshot(data.snapshot);
    if (!res.ok) {
      throw new Error(data.error || 'Erro ao gerar resposta da IA.');
    }
  };

  const handleToggleAi = async (conversationId: string, aiEnabled: boolean) => {
    const res = await fetch(`/api/conversations/${conversationId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ aiEnabled, handoffRequested: false }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error || 'Não foi possível alternar o modo da IA.');
    }
    const snapRes = await fetch('/api/snapshot');
    if (snapRes.ok) setSnapshot(await snapRes.json());
  };

  const handleConfirmPayment = async (orderId: string) => {
    unlockKitchenBellAudio();
    const res = await fetch(`/api/orders/${orderId}/pay`, { method: 'POST' });
    const data = await res.json().catch(() => ({}));
    if (data.snapshot) setSnapshot(data.snapshot);
    if (!res.ok) {
      throw new Error(data.error || 'Erro ao confirmar pagamento.');
    }
    if (data.order) {
      triggerPaymentBell({
        orderId: data.order.id,
        orderCode: data.order.code,
        customerName: data.order.customerName,
        amount: data.order.total,
      });
    }
  };

  const handleAdvanceOrder = async (orderId: string, targetStage?: OrderStage) => {
    const res = await fetch(`/api/orders/${orderId}/advance`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(targetStage ? { stage: targetStage } : {}),
    });
    const data = await res.json().catch(() => ({}));
    if (data.snapshot) setSnapshot(data.snapshot);
    if (!res.ok) {
      throw new Error(data.error || 'Erro ao avançar etapa do pedido.');
    }
  };

  const handleUpdateCustomer = async (
    customerId: string,
    patch: Partial<Pick<Customer, 'name' | 'address' | 'neighborhood' | 'complement' | 'notes'>>
  ) => {
    const res = await fetch(`/api/customers/${customerId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error || 'Erro ao salvar cadastro do cliente.');
    }
  };

  const handleCreateNewChat = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newChatPhone.trim()) {
      setNewChatError('Informe um número de WhatsApp válido.');
      return;
    }
    setCreatingChat(true);
    setNewChatError(null);
    try {
      const res = await fetch('/api/conversations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phone: newChatPhone.trim(),
          name: newChatName.trim(),
          firstMessage: newChatFirstMessage.trim(),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (data.snapshot) setSnapshot(data.snapshot);
      if (!res.ok) {
        setNewChatError(data.error || 'Não foi possível iniciar o atendimento.');
        return;
      }
      if (data.conversation?.id) {
        setSelectedConversationId(data.conversation.id);
      }
      setActiveTab('whatsapp');
      setShowNewChatModal(false);
      setNewChatName('');
      setNewChatFirstMessage('');
    } catch (err) {
      setNewChatError(
        err instanceof Error ? err.message : 'Erro de conexão ao criar conversa.'
      );
    } finally {
      setCreatingChat(false);
    }
  };

  const handleToggleMenuAvailability = async (id: string, available: boolean) => {
    const res = await fetch(`/api/menu/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ available }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error || 'Erro ao atualizar disponibilidade.');
    }
  };

  const handleUpdateMenuPrices = async (
    id: string,
    prices: { media?: number; grande: number; gigante?: number }
  ) => {
    const res = await fetch(`/api/menu/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prices }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error || 'Erro ao atualizar preços.');
    }
  };

  const handleUpdateMenuPhoto = async (id: string, imageUrl: string) => {
    const res = await fetch(`/api/menu/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ imageUrl }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error || 'Não foi possível salvar a foto do produto.');
    }
  };

  const handleAddMenuItem = async (item: Omit<MenuItem, 'id'>) => {
    const res = await fetch('/api/menu', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(item),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error || 'Não foi possível adicionar item ao cardápio.');
    }
  };

  const handleSaveSettings = async (patch: Partial<StoreSettings>) => {
    const res = await fetch('/api/settings', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error || 'Erro ao salvar configurações.');
    }
    const updatedSettings = (await res.json()) as StoreSettings;
    setSnapshot((prev) => (prev ? { ...prev, settings: updatedSettings } : prev));
  };

  const handleSendTelegramBackup = async (overrideConfig?: {
    telegramBotToken?: string;
    telegramChatId?: string;
    telegramAutoBackupOnPayment?: boolean;
  }): Promise<{ summary: string; sentAt: string }> => {
    const res = await fetch('/api/backup/telegram', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(overrideConfig ?? {}),
    });
    const data = await res.json().catch(() => ({}));
    if (data.snapshot) setSnapshot(data.snapshot);
    if (!res.ok) {
      throw new Error(data.error || 'Falha ao enviar backup para o Telegram.');
    }
    return { summary: data.summary, sentAt: data.sentAt };
  };

  const handleRestoreBackup = async (parsedSnapshot: unknown) => {
    const res = await fetch('/api/backup/restore', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ snapshot: parsedSnapshot }),
    });
    const data = await res.json().catch(() => ({}));
    if (data.snapshot) setSnapshot(data.snapshot);
    if (!res.ok) {
      throw new Error(data.error || 'Falha ao restaurar arquivo de backup.');
    }
  };

  const handleSimulateMarketplaceOrder = async (channel: 'ifood' | '99food') => {
    unlockKitchenBellAudio();
    const res = await fetch('/api/integrations/simulate-order', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ channel }),
    });
    const data = await res.json().catch(() => ({}));
    if (data.snapshot) setSnapshot(data.snapshot);
    if (!res.ok) {
      throw new Error(data.error || 'Não foi possível simular o pedido.');
    }
    if (data.order) {
      const channelLabel = channel === 'ifood' ? 'iFood' : '99Food';
      triggerPaymentBell({
        orderId: data.order.id,
        orderCode: data.order.externalDisplayId
          ? `${data.order.code} (${data.order.externalDisplayId})`
          : data.order.code,
        customerName: data.order.customerName,
        amount: data.order.total,
        title: `Novo Pedido ${channelLabel}`,
      });
    }
  };

  const handleCreatePdvOrder = async (payload: PdvOrderPayload) => {
    unlockKitchenBellAudio();
    const res = await fetch('/api/orders', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await res.json().catch(() => ({}));
    if (data.snapshot) setSnapshot(data.snapshot);
    if (!res.ok) {
      throw new Error(data.error || 'Erro ao lançar pedido no PDV.');
    }
    if (data.order) {
      triggerPaymentBell({
        orderId: data.order.id,
        orderCode: data.order.code,
        customerName: data.order.customerName,
        amount: data.order.total,
        title: 'Novo Pedido PDV',
      });
    }
  };

  const handleAssignDriver = async (orderId: string, driverId: string | null) => {
    const res = await fetch(`/api/orders/${orderId}/driver`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ driverId }),
    });
    const data = await res.json().catch(() => ({}));
    if (data.snapshot) setSnapshot(data.snapshot);
    if (!res.ok) {
      throw new Error(data.error || 'Erro ao atribuir entregador.');
    }
  };

  const handleMarkDispatchedToDriver = async (orderId: string) => {
    const res = await fetch(`/api/orders/${orderId}/dispatch-driver`, {
      method: 'POST',
    });
    const data = await res.json().catch(() => ({}));
    if (data.snapshot) setSnapshot(data.snapshot);
  };

  const handleAddDriver = async (input: { name: string; phone: string; vehicle?: string }) => {
    const res = await fetch('/api/drivers', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    });
    const data = await res.json().catch(() => ({}));
    if (data.snapshot) setSnapshot(data.snapshot);
    if (!res.ok) {
      throw new Error(data.error || 'Erro ao cadastrar entregador.');
    }
  };

  const handleUpdateDriver = async (
    id: string,
    patch: Partial<Omit<DeliveryDriver, 'id' | 'createdAt'>>
  ) => {
    const res = await fetch(`/api/drivers/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    });
    const data = await res.json().catch(() => ({}));
    if (data.snapshot) setSnapshot(data.snapshot);
    if (!res.ok) {
      throw new Error(data.error || 'Erro ao atualizar entregador.');
    }
  };

  const handleDeleteDriver = async (id: string) => {
    const res = await fetch(`/api/drivers/${id}`, { method: 'DELETE' });
    const data = await res.json().catch(() => ({}));
    if (data.snapshot) setSnapshot(data.snapshot);
  };

  const handleAddCoupon = async (input: {
    code: string;
    type: 'percent' | 'fixed';
    value: number;
    minOrder?: number;
  }) => {
    const res = await fetch('/api/coupons', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    });
    const data = await res.json().catch(() => ({}));
    if (data.snapshot) setSnapshot(data.snapshot);
    if (!res.ok) {
      throw new Error(data.error || 'Erro ao criar cupom.');
    }
  };

  const handleToggleCoupon = async (id: string, active: boolean) => {
    const res = await fetch(`/api/coupons/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ active }),
    });
    const data = await res.json().catch(() => ({}));
    if (data.snapshot) setSnapshot(data.snapshot);
  };

  const handleDeleteCoupon = async (id: string) => {
    const res = await fetch(`/api/coupons/${id}`, { method: 'DELETE' });
    const data = await res.json().catch(() => ({}));
    if (data.snapshot) setSnapshot(data.snapshot);
  };

  const handleSavePromotions = async (patch: Partial<PromotionsConfig>) => {
    const res = await fetch('/api/promotions', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    });
    const data = await res.json().catch(() => ({}));
    if (data.snapshot) setSnapshot(data.snapshot);
    if (!res.ok) {
      throw new Error(data.error || 'Erro ao salvar regras de promoções.');
    }
  };

  const openOrderReceipt = (order: Order, tab: 'comanda' | 'motoboy' = 'comanda') => {
    setReceiptModal({ orderId: order.id, tab });
  };

  if (loading) {
    return (
      <div className="h-screen flex items-center justify-center bg-slate-50 text-xs text-slate-500">
        Carregando central de atendimento FornoDesk...
      </div>
    );
  }

  if (error || !snapshot) {
    return (
      <div className="h-screen flex items-center justify-center bg-slate-50 p-6">
        <div className="bg-white border border-red-200 rounded-lg p-5 max-w-md text-center space-y-2">
          <div className="text-sm font-semibold text-red-700">Erro ao carregar aplicação</div>
          <p className="text-xs text-slate-600">{error || 'Resposta inválida do servidor.'}</p>
        </div>
      </div>
    );
  }

  const activeOrdersCount = snapshot.orders.filter(
    (o) => o.stage !== 'entregue' && o.stage !== 'cancelado'
  ).length;

  const navItems: {
    id: NavTab;
    label: string;
    icon: React.ComponentType<{ className?: string }>;
    count?: number;
  }[] = [
    {
      id: 'whatsapp',
      label: 'WhatsApp IA',
      icon: MessageSquare,
      count: snapshot.conversations.length,
    },
    {
      id: 'kitchen',
      label: 'Pedidos & Cozinha',
      icon: Flame,
      count: activeOrdersCount,
    },
    {
      id: 'sales',
      label: 'Vendas do Dia',
      icon: Receipt,
    },
    {
      id: 'drivers',
      label: 'Entregadores',
      icon: Bike,
      count: (snapshot.drivers ?? []).filter((d) => d.active).length,
    },
    {
      id: 'promotions',
      label: 'Fidelidade & Cupons',
      icon: Percent,
    },
    {
      id: 'customers',
      label: 'Clientes (Auto-CRM)',
      icon: Users,
      count: snapshot.customers.length,
    },
    {
      id: 'menu',
      label: 'Cardápio & Preços',
      icon: UtensilsCrossed,
    },
    {
      id: 'settings',
      label: 'Integração & IA',
      icon: Settings,
    },
  ];

  const activeNavTitle = navItems.find((n) => n.id === activeTab)?.label ?? 'WhatsApp IA';
  const activeReceiptOrder = receiptModal
    ? snapshot.orders.find((o) => o.id === receiptModal.orderId)
    : undefined;

  return (
    <div className="h-screen flex flex-col bg-[#FAF6F0] text-stone-900 overflow-hidden">
      {/* Top Bar Contract: Brand | Context Breadcrumb | 1 Primary CTA */}
      <header className="h-14 bg-[#FFFDF9] border-b border-stone-200 px-4 lg:px-6 flex items-center justify-between gap-8 shrink-0">
        <div className="flex items-center gap-3 min-w-0">
          <span className="text-base font-bold tracking-tight text-stone-900 whitespace-nowrap shrink-0 flex items-center gap-2">
            <span className="w-7 h-7 rounded-lg bg-orange-700 text-white flex items-center justify-center">
              <Pizza className="w-4 h-4" />
            </span>
            FornoDesk
          </span>
          <span className="hidden sm:inline text-stone-300" aria-hidden="true">/</span>
          <span className="hidden sm:inline text-xs text-stone-500 truncate">
            {snapshot.settings.pizzeriaName} · {activeNavTitle}
          </span>
        </div>

        <nav className="hidden md:flex items-center gap-6 text-xs font-medium text-stone-600">
          {navItems.slice(0, 5).map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setActiveTab(item.id)}
              className={`py-1 transition-colors whitespace-nowrap shrink-0 ${
                activeTab === item.id
                  ? 'text-orange-800 font-semibold border-b-2 border-orange-700'
                  : 'hover:text-stone-900'
              }`}
            >
              {item.label}
            </button>
          ))}
        </nav>

        <div className="flex items-center shrink-0">
          <button
            type="button"
            onClick={openNewChatModal}
            className="px-3.5 py-2 text-xs font-semibold bg-emerald-700 text-white rounded-lg hover:bg-emerald-800 transition-colors flex items-center gap-1.5 whitespace-nowrap shrink-0"
          >
            <MessageSquarePlus className="w-3.5 h-3.5" />
            Simular Cliente
          </button>
        </div>
      </header>

      {/* Main Workspace: Wood-Fired Espresso Sidebar + Pizza Backdrop Content Viewport */}
      <div className="flex-1 min-h-0 flex">
        <aside className="hidden lg:flex w-60 bg-[#1F1A17] text-stone-200 border-r border-stone-800 flex-col justify-between shrink-0">
          <div className="p-3 space-y-1">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setActiveTab(item.id)}
                  className={`w-full flex items-center justify-between gap-2 px-3 py-2.5 text-xs font-medium rounded-lg transition-colors ${
                    isActive
                      ? 'bg-orange-700/25 text-orange-100 border border-orange-600/40 font-semibold'
                      : 'text-stone-300 hover:bg-stone-800/80 hover:text-white border border-transparent'
                  }`}
                >
                  <span className="flex items-center gap-2.5 truncate">
                    <Icon
                      className={`w-4 h-4 shrink-0 ${
                        isActive ? 'text-orange-400' : 'text-stone-400'
                      }`}
                    />
                    <span className="truncate">{item.label}</span>
                  </span>
                  {typeof item.count === 'number' && (
                    <span className="font-mono text-[11px] text-stone-400 tabular-nums">
                      {item.count}
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          <div className="p-4 border-t border-stone-800 space-y-3">
            <div className="space-y-2 pb-3 border-b border-stone-800">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-semibold text-stone-200">
                  Som de Pagamento
                </span>
                <button
                  type="button"
                  onClick={() => {
                    unlockKitchenBellAudio();
                    setBellEnabled(!bellEnabled);
                  }}
                  className={`flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded border transition-colors ${
                    bellEnabled
                      ? 'bg-emerald-900/60 border-emerald-700/60 text-emerald-200'
                      : 'bg-stone-800 border-stone-700 text-stone-400'
                  }`}
                >
                  {bellEnabled ? (
                    <>
                      <Volume2 className="w-3 h-3" />
                      Ativo
                    </>
                  ) : (
                    <>
                      <VolumeX className="w-3 h-3" />
                      Mudo
                    </>
                  )}
                </button>
              </div>
              <select
                aria-label="Tipo de som de pagamento"
                value={selectedPaymentSound}
                onChange={(e) => {
                  const nextSound = e.target.value as PaymentSoundType;
                  unlockKitchenBellAudio();
                  playPaymentSound(nextSound);
                  void handleSaveSettings({ paymentSound: nextSound });
                }}
                className="w-full py-1.5 px-2 text-[11px] text-stone-100 bg-stone-900 border border-stone-700 rounded-md focus:outline-none focus:border-orange-500"
              >
                {PAYMENT_SOUND_OPTIONS.map((opt) => (
                  <option key={opt.id} value={opt.id}>
                    {opt.label}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={() => {
                  unlockKitchenBellAudio();
                  playPaymentSound(selectedPaymentSound);
                }}
                className="w-full py-1.5 px-2.5 text-[11px] font-medium text-stone-200 bg-stone-800 hover:bg-stone-700 border border-stone-700 rounded-md transition-colors flex items-center justify-center gap-1.5"
              >
                <Bell className="w-3.5 h-3.5 text-amber-400" />
                Testar Som
              </button>
            </div>

            <div className="space-y-1">
              <div className="text-[11px] font-semibold text-stone-100 truncate">
                {snapshot.settings.pizzeriaName}
              </div>
              <div className="text-[11px] font-mono text-stone-400 tabular-nums">
                {snapshot.settings.whatsappPhoneDisplay}
              </div>
              <div className="text-[11px] text-stone-400">
                Entrega padrão:{' '}
                <span className="font-mono tabular-nums text-stone-200">
                  R$ {Number(snapshot.settings.deliveryFee ?? 0).toFixed(2)}
                </span>
              </div>
            </div>
          </div>
        </aside>

        {/* Mobile bottom nav */}
        <div className="md:hidden fixed bottom-0 inset-x-0 z-30 bg-[#1F1A17] border-t border-stone-800 flex items-center gap-1 overflow-x-auto py-1.5 px-2">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setActiveTab(item.id)}
                className={`flex flex-col items-center gap-0.5 px-2.5 py-1 rounded text-[10px] font-medium shrink-0 ${
                  isActive ? 'text-orange-400' : 'text-stone-400'
                }`}
              >
                <Icon className="w-4 h-4" />
                <span>{item.label.split(' ')[0]}</span>
              </button>
            );
          })}
        </div>

        <main className="flex-1 min-w-0 min-h-0 overflow-y-auto pb-14 md:pb-0 app-pizza-backdrop">
          {activeTab === 'whatsapp' && (
            <WhatsAppWorkspace
              snapshot={snapshot}
              selectedConversationId={selectedConversationId}
              onSelectConversation={setSelectedConversationId}
              onSendMessage={handleSendMessage}
              onRetryAi={handleRetryAi}
              onToggleAi={handleToggleAi}
              onConfirmPayment={handleConfirmPayment}
              onAdvanceOrder={handleAdvanceOrder}
              onUpdateCustomer={handleUpdateCustomer}
              onOpenNewChatModal={openNewChatModal}
              onOpenReceipt={openOrderReceipt}
            />
          )}

          {activeTab === 'kitchen' && (
            <KitchenOrdersView
              snapshot={snapshot}
              onAdvanceOrder={handleAdvanceOrder}
              onConfirmPayment={handleConfirmPayment}
              onSimulateMarketplaceOrder={handleSimulateMarketplaceOrder}
              onOpenChat={(convId) => {
                setSelectedConversationId(convId);
                setActiveTab('whatsapp');
              }}
              onOpenPdvModal={() => setShowPdvModal(true)}
              onOpenReceipt={openOrderReceipt}
              onAssignDriver={handleAssignDriver}
            />
          )}

          {activeTab === 'sales' && (
            <DailySalesView
              snapshot={snapshot}
              onOpenChat={(convId) => {
                setSelectedConversationId(convId);
                setActiveTab('whatsapp');
              }}
              onSendTelegramBackup={() => handleSendTelegramBackup()}
              onOpenSettings={() => setActiveTab('settings')}
            />
          )}

          {activeTab === 'drivers' && (
            <DriversView
              snapshot={snapshot}
              onAddDriver={handleAddDriver}
              onUpdateDriver={handleUpdateDriver}
              onDeleteDriver={handleDeleteDriver}
              onOpenDriverDispatch={(order) => openOrderReceipt(order, 'motoboy')}
            />
          )}

          {activeTab === 'promotions' && (
            <PromotionsView
              snapshot={snapshot}
              onAddCoupon={handleAddCoupon}
              onToggleCoupon={handleToggleCoupon}
              onDeleteCoupon={handleDeleteCoupon}
              onSavePromotions={handleSavePromotions}
            />
          )}

          {activeTab === 'customers' && (
            <CustomersView
              snapshot={snapshot}
              onOpenChat={(convId) => {
                setSelectedConversationId(convId);
                setActiveTab('whatsapp');
              }}
            />
          )}

          {activeTab === 'menu' && (
            <MenuView
              snapshot={snapshot}
              onToggleAvailability={handleToggleMenuAvailability}
              onUpdatePrices={handleUpdateMenuPrices}
              onUpdatePhoto={handleUpdateMenuPhoto}
              onAddMenuItem={handleAddMenuItem}
            />
          )}

          {activeTab === 'settings' && (
            <SettingsView
              snapshot={snapshot}
              onSaveSettings={handleSaveSettings}
              onSendTelegramBackup={handleSendTelegramBackup}
              onRestoreBackup={handleRestoreBackup}
              onSimulateMarketplaceOrder={handleSimulateMarketplaceOrder}
            />
          )}
        </main>
      </div>

      {/* Modal: Novo Pedido PDV */}
      {showPdvModal && (
        <PdvOrderModal
          snapshot={snapshot}
          onClose={() => setShowPdvModal(false)}
          onCreateOrder={handleCreatePdvOrder}
        />
      )}

      {/* Modal: Comanda Térmica & Despacho Motoboy WhatsApp */}
      {activeReceiptOrder && receiptModal && (
        <OrderReceiptModal
          order={activeReceiptOrder}
          settings={snapshot.settings}
          drivers={snapshot.drivers ?? []}
          initialTab={receiptModal.tab}
          onClose={() => setReceiptModal(null)}
          onAssignDriver={handleAssignDriver}
          onMarkDispatched={handleMarkDispatchedToDriver}
        />
      )}

      {/* Modal: Simular Novo Cliente WhatsApp */}
      {showNewChatModal && (
        <div className="fixed inset-0 z-50 bg-stone-950/55 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-[#FFFDF9] border border-stone-200 rounded-xl w-full max-w-md p-5 space-y-4 shadow-xl">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-stone-900">
                Simular Novo Cliente no WhatsApp
              </h3>
              <button
                type="button"
                onClick={() => setShowNewChatModal(false)}
                className="p-1 text-stone-400 hover:text-stone-700"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <p className="text-xs text-stone-600">
              Inicie uma nova conversa como cliente para testar a IA respondendo, fazendo o cadastro automático e gerando pagamento PIX.
            </p>
            <form onSubmit={handleCreateNewChat} className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-stone-700 mb-1">
                  Número WhatsApp
                </label>
                <input
                  type="text"
                  required
                  value={newChatPhone}
                  onChange={(e) => setNewChatPhone(e.target.value)}
                  placeholder="+55 11 99999-0000"
                  className="w-full px-3 py-2 text-xs font-mono bg-white border border-stone-200 rounded-md focus:outline-none focus:border-orange-600"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-stone-700 mb-1">
                  Nome Inicial (opcional — a IA preenche sozinha)
                </label>
                <input
                  type="text"
                  value={newChatName}
                  onChange={(e) => setNewChatName(e.target.value)}
                  placeholder="Deixar vazio para testar auto-cadastro"
                  className="w-full px-3 py-2 text-xs bg-white border border-stone-200 rounded-md focus:outline-none focus:border-orange-600"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-stone-700 mb-1">
                  Primeira Mensagem do Cliente (opcional)
                </label>
                <input
                  type="text"
                  value={newChatFirstMessage}
                  onChange={(e) => setNewChatFirstMessage(e.target.value)}
                  placeholder="Ex: Oi boa noite! Quero pedir uma pizza grande"
                  className="w-full px-3 py-2 text-xs bg-white border border-stone-200 rounded-md focus:outline-none focus:border-orange-600"
                />
              </div>
              {newChatError && (
                <div className="p-2.5 text-xs text-red-800 bg-red-50 border border-red-200 rounded-md">
                  {newChatError}
                </div>
              )}
              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowNewChatModal(false)}
                  className="px-3 py-1.5 text-xs text-stone-600 hover:text-stone-900"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={creatingChat}
                  className="px-4 py-2 text-xs font-semibold bg-emerald-700 text-white rounded-md hover:bg-emerald-800 disabled:opacity-60"
                >
                  {creatingChat ? 'Iniciando...' : 'Iniciar Conversa'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      {/* Payment Bell Toast Notification */}
      {paymentToast && (
        <div className="fixed bottom-16 md:bottom-5 right-5 z-50 bg-slate-900 text-white border border-slate-700 rounded-xl shadow-lg p-3.5 max-w-sm flex items-start gap-3">
          <div className="w-8 h-8 rounded-lg bg-emerald-600 flex items-center justify-center shrink-0">
            <Bell className="w-4 h-4 text-white" />
          </div>
          <div className="flex-1 min-w-0 space-y-1">
            <div className="text-xs font-semibold">
              {paymentToast.title} · {paymentToast.orderCode}
            </div>
            <div className="text-[11px] text-slate-300 truncate">
              {paymentToast.customerName} ·{' '}
              <span className="font-mono tabular-nums">{formatBRL(paymentToast.amount)}</span>
            </div>
            <button
              type="button"
              onClick={() => {
                setActiveTab('kitchen');
                setPaymentToast(null);
              }}
              className="text-[11px] font-semibold text-emerald-400 hover:text-emerald-300 underline"
            >
              Ver na Cozinha
            </button>
          </div>
          <button
            type="button"
            onClick={() => setPaymentToast(null)}
            className="text-slate-400 hover:text-white p-0.5"
            aria-label="Fechar aviso"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}
    </div>
  );
}
