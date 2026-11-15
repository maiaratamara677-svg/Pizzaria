import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  Bike,
  Bot,
  CheckCheck,
  ChevronRight,
  CreditCard,
  Edit3,
  Loader2,
  MapPin,
  MessageSquarePlus,
  Phone,
  Printer,
  Save,
  Search,
  Send,
  Truck,
  User,
  UserCheck,
} from 'lucide-react';
import type { AppSnapshot, Customer, Order } from '../types.ts';
import {
  formatBRL,
  formatPaymentMethod,
  formatPaymentStatus,
  formatTime,
  getOrderServiceType,
  ORDER_SERVICE_TYPE_META,
  ORDER_STAGE_META,
} from '../utils/format.ts';
import { ChatAttachmentRenderer } from './ChatAttachments.tsx';

interface WhatsAppWorkspaceProps {
  snapshot: AppSnapshot;
  selectedConversationId: string;
  onSelectConversation: (id: string) => void;
  onSendMessage: (
    conversationId: string,
    sender: 'customer' | 'agent',
    text: string
  ) => Promise<void>;
  onRetryAi: (conversationId: string) => Promise<void>;
  onToggleAi: (conversationId: string, aiEnabled: boolean) => Promise<void>;
  onConfirmPayment: (orderId: string) => Promise<void>;
  onAdvanceOrder: (orderId: string) => Promise<void>;
  onUpdateCustomer: (
    customerId: string,
    patch: Partial<Pick<Customer, 'name' | 'address' | 'neighborhood' | 'complement' | 'notes'>>
  ) => Promise<void>;
  onOpenNewChatModal: () => void;
  onOpenReceipt?: (order: Order, tab?: 'comanda' | 'motoboy') => void;
}

type InboxFilter = 'all' | 'awaiting_payment' | 'active_orders' | 'handoff';

const QUICK_CUSTOMER_PROMPTS = [
  'Quero ver o cardápio de pizzas',
  'Meu nome é Lucas Almeida, moro na Rua Augusta, 1420 apto 42 - Consolação. Quero 1 Calabresa grande no PIX',
  'Quero pagar agora por PIX',
  'Onde está meu pedido? Qual o status?',
];

export const WhatsAppWorkspace: React.FC<WhatsAppWorkspaceProps> = ({
  snapshot,
  selectedConversationId,
  onSelectConversation,
  onSendMessage,
  onRetryAi,
  onToggleAi,
  onConfirmPayment,
  onAdvanceOrder,
  onUpdateCustomer,
  onOpenNewChatModal,
  onOpenReceipt,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [filter, setFilter] = useState<InboxFilter>('all');
  const [composerText, setComposerText] = useState('');
  const [composerRole, setComposerRole] = useState<'customer' | 'agent'>('customer');
  const [sending, setSending] = useState(false);
  const [chatError, setChatError] = useState<string | null>(null);
  const [mobilePane, setMobilePane] = useState<'list' | 'chat' | 'crm'>('chat');

  const [editingCustomer, setEditingCustomer] = useState(false);
  const [customerDraft, setCustomerDraft] = useState({
    name: '',
    address: '',
    neighborhood: '',
    complement: '',
    notes: '',
  });
  const [savingCustomer, setSavingCustomer] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const composerInputRef = useRef<HTMLInputElement | null>(null);

  const selectedConversation = useMemo(
    () =>
      snapshot.conversations.find((c) => c.id === selectedConversationId) ??
      snapshot.conversations[0],
    [snapshot.conversations, selectedConversationId]
  );

  const selectedCustomer = useMemo(
    () => snapshot.customers.find((c) => c.id === selectedConversation?.customerId),
    [snapshot.customers, selectedConversation]
  );

  const conversationMessages = useMemo(
    () =>
      snapshot.messages.filter((m) => m.conversationId === selectedConversation?.id),
    [snapshot.messages, selectedConversation]
  );

  const customerOrders = useMemo(() => {
    if (!selectedCustomer) return [];
    return snapshot.orders
      .filter((o) => o.customerId === selectedCustomer.id)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }, [snapshot.orders, selectedCustomer]);

  const activeOrder: Order | undefined = customerOrders[0];

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [conversationMessages.length, selectedConversation?.id]);

  useEffect(() => {
    if (selectedCustomer) {
      setCustomerDraft({
        name: selectedCustomer.name,
        address: selectedCustomer.address,
        neighborhood: selectedCustomer.neighborhood,
        complement: selectedCustomer.complement,
        notes: selectedCustomer.notes,
      });
      setEditingCustomer(false);
    }
    setComposerRole('customer');
    setChatError(null);
    const timer = setTimeout(() => {
      composerInputRef.current?.focus();
    }, 50);
    return () => clearTimeout(timer);
  }, [selectedCustomer?.id, selectedConversation?.id]);

  const latestOrderByCustomer = useMemo(() => {
    const map = new Map<string, Order>();
    for (const order of snapshot.orders) {
      const existing = map.get(order.customerId);
      if (
        !existing ||
        new Date(order.createdAt).getTime() > new Date(existing.createdAt).getTime()
      ) {
        map.set(order.customerId, order);
      }
    }
    return map;
  }, [snapshot.orders]);

  const filteredConversations = useMemo(() => {
    return snapshot.conversations
      .filter((conv) => {
        const cust = snapshot.customers.find((c) => c.id === conv.customerId);
        const latestOrder = latestOrderByCustomer.get(conv.customerId);

        if (filter === 'awaiting_payment') {
          if (!latestOrder || latestOrder.payment.status !== 'aguardando') return false;
        } else if (filter === 'active_orders') {
          if (!latestOrder || latestOrder.stage === 'entregue' || latestOrder.stage === 'cancelado')
            return false;
        } else if (filter === 'handoff') {
          if (!conv.handoffRequested && conv.aiEnabled) return false;
        }

        if (!searchQuery.trim()) return true;
        const q = searchQuery.toLowerCase();
        return (
          cust?.name.toLowerCase().includes(q) ||
          cust?.phone.toLowerCase().includes(q) ||
          conv.lastMessagePreview.toLowerCase().includes(q)
        );
      })
      .sort(
        (a, b) =>
          new Date(b.lastMessageAt).getTime() - new Date(a.lastMessageAt).getTime()
      );
  }, [snapshot.conversations, snapshot.customers, latestOrderByCustomer, filter, searchQuery]);

  const handleSend = async (customText?: string) => {
    const textToSend = (customText ?? composerText).trim();
    if (!textToSend || !selectedConversation || sending) return;

    if (!customText) setComposerText('');
    setChatError(null);
    setSending(true);
    try {
      await onSendMessage(selectedConversation.id, composerRole, textToSend);
    } catch (err) {
      setChatError(err instanceof Error ? err.message : 'Falha ao enviar mensagem.');
    } finally {
      setSending(false);
    }
  };

  const handleSaveCustomer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCustomer) return;
    setSavingCustomer(true);
    setChatError(null);
    try {
      await onUpdateCustomer(selectedCustomer.id, customerDraft);
      setEditingCustomer(false);
    } catch (err) {
      setChatError(err instanceof Error ? err.message : 'Erro ao atualizar cliente.');
    } finally {
      setSavingCustomer(false);
    }
  };

  const handleQuickOrderFromMenu = (text: string) => {
    setComposerRole('customer');
    void handleSend(text);
  };

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Mobile pane switcher */}
      <div className="flex lg:hidden border-b border-slate-200 bg-white px-3 py-2 gap-1">
        <button
          type="button"
          onClick={() => setMobilePane('list')}
          className={`flex-1 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
            mobilePane === 'list' ? 'bg-slate-900 text-white' : 'text-slate-600'
          }`}
        >
          Conversas ({snapshot.conversations.length})
        </button>
        <button
          type="button"
          onClick={() => setMobilePane('chat')}
          className={`flex-1 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
            mobilePane === 'chat' ? 'bg-slate-900 text-white' : 'text-slate-600'
          }`}
        >
          Chat WhatsApp
        </button>
        <button
          type="button"
          onClick={() => setMobilePane('crm')}
          className={`flex-1 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
            mobilePane === 'crm' ? 'bg-slate-900 text-white' : 'text-slate-600'
          }`}
        >
          Cadastro & Pedido
        </button>
      </div>

      <div className="flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-[300px_1fr_340px]">
        {/* Left Column: Conversation Queue */}
        <aside
          className={`border-r border-stone-200 bg-[#FFFDF9]/95 flex flex-col min-h-0 ${
            mobilePane === 'list' ? 'flex' : 'hidden lg:flex'
          }`}
        >
          <div className="p-3 border-b border-stone-200 space-y-2.5">
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-sm font-semibold text-stone-900">Conversas WhatsApp</h2>
              <button
                type="button"
                onClick={onOpenNewChatModal}
                className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-emerald-800 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200/70 rounded-md transition-colors whitespace-nowrap shrink-0"
              >
                <MessageSquarePlus className="w-3.5 h-3.5" />
                Novo Chat
              </button>
            </div>

            <div className="relative">
              <Search className="w-3.5 h-3.5 text-stone-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Buscar cliente ou telefone..."
                className="w-full pl-8 pr-3 py-1.5 text-xs bg-[#FAF6F0] border border-stone-200 rounded-md focus:outline-none focus:ring-2 focus:ring-orange-600/20 focus:border-orange-600"
              />
            </div>

            <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg overflow-x-auto">
              {[
                { id: 'all', label: 'Todas' },
                { id: 'awaiting_payment', label: 'PIX/Pgto' },
                { id: 'active_orders', label: 'Ativos' },
                { id: 'handoff', label: 'Humano' },
              ].map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setFilter(tab.id as InboxFilter)}
                  className={`flex-1 px-2 py-1 text-[11px] font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                    filter === tab.id
                      ? 'bg-white text-slate-900 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>

          <div className="flex-1 overflow-y-auto divide-y divide-slate-100">
            {filteredConversations.length === 0 ? (
              <div className="p-6 text-center space-y-2">
                <p className="text-xs text-slate-500">Nenhuma conversa encontrada neste filtro.</p>
                <button
                  type="button"
                  onClick={() => {
                    setFilter('all');
                    setSearchQuery('');
                  }}
                  className="text-xs font-medium text-emerald-700 hover:underline"
                >
                  Limpar filtros
                </button>
              </div>
            ) : (
              filteredConversations.map((conv) => {
                const cust = snapshot.customers.find((c) => c.id === conv.customerId);
                const latestOrder = latestOrderByCustomer.get(conv.customerId);
                const isSelected = conv.id === selectedConversation?.id;

                return (
                  <button
                    key={conv.id}
                    type="button"
                    onClick={() => {
                      onSelectConversation(conv.id);
                      setMobilePane('chat');
                    }}
                    className={`w-full text-left px-3.5 py-3 transition-colors flex items-start gap-3 ${
                      isSelected ? 'bg-emerald-50/70' : 'hover:bg-slate-50'
                    }`}
                  >
                    <div className="w-9 h-9 rounded-full bg-slate-200 text-slate-700 font-semibold text-xs flex items-center justify-center shrink-0">
                      {(cust?.name || 'C').slice(0, 2).toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs font-semibold text-slate-900 truncate">
                          {cust?.name || 'Contato'}
                        </span>
                        <span className="text-[11px] font-mono text-slate-400 tabular-nums shrink-0">
                          {formatTime(conv.lastMessageAt)}
                        </span>
                      </div>
                      <p className="text-xs text-slate-500 truncate mt-0.5">
                        {conv.lastMessagePreview}
                      </p>
                      <div className="flex items-center gap-1.5 mt-1 text-[11px] text-slate-500">
                        <span className={conv.aiEnabled ? 'text-emerald-700 font-medium' : 'text-amber-700 font-medium'}>
                          {conv.aiEnabled ? 'IA Ativa' : 'Manual'}
                        </span>
                        {latestOrder && (
                          <>
                            <span aria-hidden="true">·</span>
                            <span className="font-mono tabular-nums">
                              {latestOrder.code} {ORDER_STAGE_META[latestOrder.stage].shortLabel}
                            </span>
                          </>
                        )}
                      </div>
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </aside>

        {/* Center Column: WhatsApp Chat Thread */}
        <section
          className={`flex flex-col min-h-0 bg-[#EFE7DA] ${
            mobilePane === 'chat' ? 'flex' : 'hidden lg:flex'
          }`}
        >
          {selectedConversation && selectedCustomer ? (
            <>
              {/* Chat Header */}
              <div className="px-4 py-2.5 bg-[#FFFDF9] border-b border-stone-200 flex items-center justify-between gap-4">
                <div className="flex items-center gap-3 min-w-0">
                  <img
                    src="/src/assets/images/pizzeria_brand_oven_1794590306689.jpg"
                    alt={snapshot.settings.pizzeriaName}
                    referrerPolicy="no-referrer"
                    className="w-9 h-9 rounded-full object-cover border border-slate-200 shrink-0"
                  />
                  <div className="min-w-0">
                    <div className="text-sm font-semibold text-slate-900 truncate">
                      {selectedCustomer.name}
                    </div>
                    <div className="flex items-center gap-2 text-xs text-slate-500 truncate">
                      <span className="font-mono tabular-nums">{selectedCustomer.phone}</span>
                      <span aria-hidden="true">·</span>
                      <span>
                        {selectedCustomer.autoRegistered
                          ? 'Cadastro automático completo'
                          : 'Aguardando cadastro no chat'}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={() =>
                      onToggleAi(selectedConversation.id, !selectedConversation.aiEnabled)
                    }
                    className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md border transition-colors whitespace-nowrap shrink-0 ${
                      selectedConversation.aiEnabled
                        ? 'bg-emerald-50 border-emerald-200 text-emerald-800 hover:bg-emerald-100'
                        : 'bg-amber-50 border-amber-200 text-amber-800 hover:bg-amber-100'
                    }`}
                  >
                    {selectedConversation.aiEnabled ? (
                      <>
                        <Bot className="w-3.5 h-3.5" />
                        IA Automática Ativa
                      </>
                    ) : (
                      <>
                        <UserCheck className="w-3.5 h-3.5" />
                        Modo Humano (Retomar IA)
                      </>
                    )}
                  </button>
                </div>
              </div>

              {/* Messages Container with Large Centered Pizza Watermark */}
              <div className="relative flex-1 min-h-0 wa-chat-bg">
                <div
                  aria-hidden="true"
                  className="pointer-events-none select-none absolute inset-0 flex items-center justify-center overflow-hidden"
                >
                  <img
                    src="/src/assets/images/pizza_margherita_napoletana_1794590306126.jpg"
                    alt=""
                    referrerPolicy="no-referrer"
                    className="w-[360px] h-[360px] sm:w-[460px] sm:h-[460px] lg:w-[520px] lg:h-[520px] rounded-full object-cover opacity-[0.18] mix-blend-multiply"
                  />
                </div>
                <div className="relative z-10 h-full overflow-y-auto px-4 py-4 space-y-3">
                {conversationMessages.map((msg) => {
                  const isCustomer = msg.sender === 'customer';
                  return (
                    <div
                      key={msg.id}
                      className={`flex flex-col ${isCustomer ? 'items-start' : 'items-end'}`}
                    >
                      <div
                        className={`max-w-[85%] md:max-w-[74%] rounded-xl px-3.5 py-2.5 shadow-xs border ${
                          isCustomer
                            ? 'bg-white border-slate-200/90 text-slate-900 rounded-tl-xs'
                            : 'bg-[#dcf8c6] border-emerald-200/80 text-slate-900 rounded-tr-xs'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-3 mb-1 text-[11px] text-slate-500">
                          <span className="font-semibold text-slate-700">
                            {isCustomer
                              ? selectedCustomer.name.split(' ')[0]
                              : msg.sender === 'ai'
                                ? `${snapshot.settings.pizzeriaName} (IA)`
                                : 'Atendente'}
                          </span>
                          {msg.aiActionLabel && (
                            <span className="text-emerald-800 font-medium truncate">
                              {msg.aiActionLabel}
                            </span>
                          )}
                        </div>

                        <div className="text-[13.5px] leading-relaxed whitespace-pre-wrap text-slate-800">
                          {msg.text}
                        </div>

                        {msg.attachment && (
                          <ChatAttachmentRenderer
                            attachment={msg.attachment}
                            orders={snapshot.orders}
                            onConfirmPayment={onConfirmPayment}
                            onQuickOrderItem={handleQuickOrderFromMenu}
                          />
                        )}

                        <div className="flex items-center justify-end gap-1 mt-1 text-[10px] font-mono text-slate-500 tabular-nums">
                          <span>{formatTime(msg.timestamp)}</span>
                          {!isCustomer && <CheckCheck className="w-3.5 h-3.5 text-sky-600" />}
                        </div>
                      </div>
                    </div>
                  );
                })}

                {conversationMessages.length === 0 && !sending && (
                  <div className="my-6 mx-auto max-w-md bg-[#FFFDF9]/95 border border-stone-200 rounded-xl p-4 text-center space-y-2 shadow-xs">
                    <div className="text-xs font-semibold text-stone-900">
                      Novo cliente simulado pronto para conversar
                    </div>
                    <p className="text-[11px] text-stone-600">
                      Digite abaixo como se fosse o cliente no WhatsApp ou clique em um dos atalhos rápidos (ex.: &ldquo;Pedir + Cadastro Auto&rdquo;) para testar a IA.
                    </p>
                  </div>
                )}

                {!sending &&
                  selectedConversation.aiEnabled &&
                  conversationMessages.length > 0 &&
                  conversationMessages[conversationMessages.length - 1].sender === 'customer' && (
                    <div className="flex justify-end">
                      <div className="bg-[#FFFDF9] border border-amber-300 rounded-xl px-3.5 py-2 flex items-center gap-3 text-xs text-stone-700 shadow-xs">
                        <span>Mensagem do cliente aguardando resposta da IA.</span>
                        <button
                          type="button"
                          onClick={async () => {
                            setChatError(null);
                            setSending(true);
                            try {
                              await onRetryAi(selectedConversation.id);
                            } catch (err) {
                              setChatError(
                                err instanceof Error
                                  ? err.message
                                  : 'Falha ao gerar resposta da IA.'
                              );
                            } finally {
                              setSending(false);
                            }
                          }}
                          className="px-2.5 py-1 text-[11px] font-semibold bg-emerald-700 text-white rounded-md hover:bg-emerald-800 whitespace-nowrap"
                        >
                          Responder com IA Agora
                        </button>
                      </div>
                    </div>
                  )}

                {sending && (
                  <div className="flex justify-end">
                    <div className="bg-[#dcf8c6] border border-emerald-200 rounded-xl px-3.5 py-2 flex items-center gap-2 text-xs text-stone-700">
                      <Loader2 className="w-3.5 h-3.5 animate-spin text-emerald-700" />
                      <span>IA analisando pedido e atualizando sistema...</span>
                    </div>
                  </div>
                )}

                {chatError && (
                  <div className="flex items-center gap-2 p-3 rounded-lg bg-red-50 border border-red-200 text-red-800 text-xs">
                    <AlertCircle className="w-4 h-4 shrink-0" />
                    <span>{chatError}</span>
                  </div>
                )}

                <div ref={messagesEndRef} />
                </div>
              </div>

              {/* Composer + Test Simulator Controls */}
              <div className="bg-[#FFFDF9] border-t border-stone-200 p-3 space-y-2.5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-1 p-0.5 bg-slate-100 rounded-lg">
                    <button
                      type="button"
                      onClick={() => setComposerRole('customer')}
                      className={`px-2.5 py-1 text-[11px] font-medium rounded-md transition-colors whitespace-nowrap ${
                        composerRole === 'customer'
                          ? 'bg-white text-slate-900 shadow-xs'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      Simular Cliente (Dispara IA)
                    </button>
                    <button
                      type="button"
                      onClick={() => setComposerRole('agent')}
                      className={`px-2.5 py-1 text-[11px] font-medium rounded-md transition-colors whitespace-nowrap ${
                        composerRole === 'agent'
                          ? 'bg-white text-slate-900 shadow-xs'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      Responder como Atendente
                    </button>
                  </div>

                  {composerRole === 'customer' && (
                    <div className="flex items-center gap-1.5 overflow-x-auto max-w-full">
                      {QUICK_CUSTOMER_PROMPTS.map((prompt, idx) => (
                        <button
                          key={idx}
                          type="button"
                          disabled={sending}
                          onClick={() => handleSend(prompt)}
                          className="px-2.5 py-1 text-[11px] text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-md transition-colors whitespace-nowrap shrink-0"
                        >
                          {idx === 0
                            ? 'Ver cardápio'
                            : idx === 1
                              ? 'Pedir + Cadastro Auto'
                              : idx === 2
                                ? 'Pagar com PIX'
                                : 'Rastrear pedido'}
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    handleSend();
                  }}
                  className="flex items-center gap-2"
                >
                  <input
                    ref={composerInputRef}
                    type="text"
                    value={composerText}
                    onChange={(e) => setComposerText(e.target.value)}
                    placeholder={
                      composerRole === 'customer'
                        ? 'Digite uma mensagem como cliente no WhatsApp (ex: Quero 1 pizza Margherita grande para Rua...) '
                        : 'Digite uma resposta manual como atendente da pizzaria...'
                    }
                    className="flex-1 px-3.5 py-2 text-sm bg-[#FAF6F0] border border-stone-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-600/20 focus:border-emerald-600"
                  />
                  <button
                    type="submit"
                    disabled={sending || !composerText.trim()}
                    className="px-4 py-2 bg-emerald-700 text-white text-xs font-semibold rounded-lg hover:bg-emerald-800 disabled:opacity-50 transition-colors flex items-center gap-1.5 whitespace-nowrap shrink-0"
                  >
                    {sending ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Send className="w-4 h-4" />
                    )}
                    Enviar
                  </button>
                </form>
              </div>
            </>
          ) : (
            <div className="flex-1 flex items-center justify-center p-8 text-center text-sm text-slate-500">
              Selecione uma conversa ao lado ou crie um novo atendimento.
            </div>
          )}
        </section>

        {/* Right Column: Auto-CRM & Live Order Tracking Inspector */}
        <aside
          className={`border-l border-stone-200 bg-[#FFFDF9]/95 overflow-y-auto ${
            mobilePane === 'crm' ? 'block' : 'hidden lg:block'
          }`}
        >
          {selectedCustomer ? (
            <div className="divide-y divide-slate-200">
              {/* Auto-Registration Inspector */}
              <div className="p-4 space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <h3 className="text-xs font-semibold text-slate-900">
                      Cadastro Automático (CRM)
                    </h3>
                    <p className="text-[11px] text-slate-500 mt-0.5">
                      {selectedCustomer.autoRegistered
                        ? 'Preenchido automaticamente pela IA'
                        : 'Aguardando dados do cliente no chat'}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setEditingCustomer(!editingCustomer)}
                    className="p-1.5 text-slate-500 hover:text-slate-900 hover:bg-slate-100 rounded-md transition-colors"
                    title="Editar cadastro"
                  >
                    <Edit3 className="w-4 h-4" />
                  </button>
                </div>

                {editingCustomer ? (
                  <form onSubmit={handleSaveCustomer} className="space-y-2.5">
                    <div>
                      <label className="block text-[11px] font-medium text-slate-600 mb-1">
                        Nome
                      </label>
                      <input
                        type="text"
                        value={customerDraft.name}
                        onChange={(e) =>
                          setCustomerDraft({ ...customerDraft, name: e.target.value })
                        }
                        className="w-full px-2.5 py-1.5 text-xs border border-slate-200 rounded-md"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-medium text-slate-600 mb-1">
                        Endereço
                      </label>
                      <input
                        type="text"
                        value={customerDraft.address}
                        onChange={(e) =>
                          setCustomerDraft({ ...customerDraft, address: e.target.value })
                        }
                        className="w-full px-2.5 py-1.5 text-xs border border-slate-200 rounded-md"
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="block text-[11px] font-medium text-slate-600 mb-1">
                          Bairro
                        </label>
                        <input
                          type="text"
                          value={customerDraft.neighborhood}
                          onChange={(e) =>
                            setCustomerDraft({ ...customerDraft, neighborhood: e.target.value })
                          }
                          className="w-full px-2.5 py-1.5 text-xs border border-slate-200 rounded-md"
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] font-medium text-slate-600 mb-1">
                          Complemento
                        </label>
                        <input
                          type="text"
                          value={customerDraft.complement}
                          onChange={(e) =>
                            setCustomerDraft({ ...customerDraft, complement: e.target.value })
                          }
                          className="w-full px-2.5 py-1.5 text-xs border border-slate-200 rounded-md"
                        />
                      </div>
                    </div>
                    <div>
                      <label className="block text-[11px] font-medium text-slate-600 mb-1">
                        Observações
                      </label>
                      <textarea
                        rows={2}
                        value={customerDraft.notes}
                        onChange={(e) =>
                          setCustomerDraft({ ...customerDraft, notes: e.target.value })
                        }
                        className="w-full px-2.5 py-1.5 text-xs border border-slate-200 rounded-md"
                      />
                    </div>
                    <div className="flex items-center justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => setEditingCustomer(false)}
                        className="px-2.5 py-1 text-xs text-slate-600 hover:text-slate-900"
                      >
                        Cancelar
                      </button>
                      <button
                        type="submit"
                        disabled={savingCustomer}
                        className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium bg-slate-900 text-white rounded-md hover:bg-slate-800"
                      >
                        <Save className="w-3.5 h-3.5" />
                        Salvar
                      </button>
                    </div>
                  </form>
                ) : (
                  <dl className="space-y-2 text-xs">
                    <div className="flex items-start gap-2">
                      <User className="w-3.5 h-3.5 text-slate-400 mt-0.5 shrink-0" />
                      <div>
                        <dt className="text-[11px] text-slate-500">Nome do Cliente</dt>
                        <dd className="font-medium text-slate-900">{selectedCustomer.name}</dd>
                      </div>
                    </div>
                    <div className="flex items-start gap-2">
                      <Phone className="w-3.5 h-3.5 text-slate-400 mt-0.5 shrink-0" />
                      <div>
                        <dt className="text-[11px] text-slate-500">WhatsApp</dt>
                        <dd className="font-mono text-slate-900 tabular-nums">
                          {selectedCustomer.phone}
                        </dd>
                      </div>
                    </div>
                    <div className="flex items-start gap-2">
                      <MapPin className="w-3.5 h-3.5 text-slate-400 mt-0.5 shrink-0" />
                      <div>
                        <dt className="text-[11px] text-slate-500">Endereço de Entrega</dt>
                        <dd className="text-slate-900">
                          {selectedCustomer.address ? (
                            <>
                              {selectedCustomer.address}
                              {selectedCustomer.neighborhood
                                ? ` · ${selectedCustomer.neighborhood}`
                                : ''}
                              {selectedCustomer.complement
                                ? ` (${selectedCustomer.complement})`
                                : ''}
                            </>
                          ) : (
                            <span className="text-slate-400">Ainda não informado</span>
                          )}
                        </dd>
                      </div>
                    </div>
                    {selectedCustomer.notes && (
                      <div className="pt-1 text-[11px] text-slate-600 bg-slate-50 border border-slate-200 rounded-md p-2">
                        Obs: {selectedCustomer.notes}
                      </div>
                    )}
                    <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-500">
                      <span>Pedidos: <strong className="text-slate-900 font-mono tabular-nums">{selectedCustomer.totalOrders}</strong></span>
                      <span>Total Gasto: <strong className="text-slate-900 font-mono tabular-nums">{formatBRL(selectedCustomer.totalSpent)}</strong></span>
                    </div>
                    {(selectedCustomer.cashbackBalance ?? 0) > 0 && (
                      <div className="pt-1.5 flex items-center justify-between text-[11px] text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-md px-2.5 py-1.5">
                        <span>Cashback Disponível</span>
                        <strong className="font-mono tabular-nums">
                          {formatBRL(selectedCustomer.cashbackBalance ?? 0)}
                        </strong>
                      </div>
                    )}
                  </dl>
                )}
              </div>

              {/* Active Order & Live Tracking Controls */}
              <div className="p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-semibold text-slate-900">
                    Pedido & Rastreio ao Vivo
                  </h3>
                  {activeOrder && (
                    <span className="text-xs font-mono font-semibold text-slate-900 tabular-nums">
                      {activeOrder.code}
                    </span>
                  )}
                </div>

                {activeOrder ? (
                  <div className="space-y-3">
                    <div className="p-3 rounded-lg border border-slate-200 bg-slate-50 space-y-2">
                      <div className="flex items-center justify-between text-xs">
                        <span className={`font-semibold ${ORDER_STAGE_META[activeOrder.stage].textColor}`}>
                          {ORDER_STAGE_META[activeOrder.stage].label}
                        </span>
                        <span className="font-mono text-slate-600 tabular-nums">
                          {ORDER_SERVICE_TYPE_META[getOrderServiceType(activeOrder)].shortLabel}
                          {activeOrder.tableNumber ? ` ${activeOrder.tableNumber}` : ''} ·{' '}
                          {activeOrder.estimatedMinutes > 0
                            ? `${activeOrder.estimatedMinutes} min`
                            : 'Finalizado'}
                        </span>
                      </div>

                      <ul className="space-y-1 text-xs text-slate-700 border-t border-slate-200/80 pt-2">
                        {activeOrder.items.map((item, idx) => (
                          <li key={idx} className="flex justify-between gap-2">
                            <span className="truncate">
                              {item.quantity}x {item.name}
                              {item.size !== 'unico' ? ` (${item.size})` : ''}
                            </span>
                            <span className="font-mono tabular-nums shrink-0">
                              {formatBRL(item.unitPrice * item.quantity)}
                            </span>
                          </li>
                        ))}
                      </ul>

                      {activeOrder.discountTotal && activeOrder.discountTotal > 0 ? (
                        <div className="flex items-center justify-between text-[11px] text-emerald-700 pt-1">
                          <span>
                            Descontos
                            {activeOrder.couponCode ? ` (${activeOrder.couponCode})` : ''}
                            {activeOrder.cashbackUsed ? ' + Cashback' : ''}
                          </span>
                          <span className="font-mono tabular-nums">
                            -{formatBRL(activeOrder.discountTotal)}
                          </span>
                        </div>
                      ) : null}

                      <div className="flex items-center justify-between pt-2 border-t border-slate-200/80 text-xs font-semibold text-slate-900">
                        <span>Total</span>
                        <span className="font-mono tabular-nums">
                          {formatBRL(activeOrder.total)}
                        </span>
                      </div>

                      {activeOrder.riderName && (
                        <div className="text-[11px] text-slate-600 pt-1">
                          Motoboy: <strong className="text-slate-800">{activeOrder.riderName}</strong>
                        </div>
                      )}
                    </div>

                    {/* Payment Status & Action */}
                    <div className="p-3 rounded-lg border border-slate-200 space-y-2">
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-slate-500 flex items-center gap-1.5">
                          <CreditCard className="w-3.5 h-3.5" />
                          {formatPaymentMethod(activeOrder.payment.method)}
                        </span>
                        <span
                          className={`font-semibold ${
                            formatPaymentStatus(activeOrder.payment.status).colorClass
                          }`}
                        >
                          {formatPaymentStatus(activeOrder.payment.status).label}
                        </span>
                      </div>

                      {activeOrder.payment.method === 'dinheiro' && activeOrder.payment.changeFor && (
                        <div className="text-[11px] font-mono text-amber-800 tabular-nums">
                          Troco para {formatBRL(activeOrder.payment.changeFor)} (levar{' '}
                          {formatBRL(
                            activeOrder.payment.changeAmount ??
                              Math.max(0, activeOrder.payment.changeFor - activeOrder.total)
                          )}
                          )
                        </div>
                      )}

                      {activeOrder.payment.status === 'aguardando' && (
                        <button
                          type="button"
                          onClick={() => onConfirmPayment(activeOrder.id)}
                          className="w-full py-1.5 px-3 text-xs font-semibold bg-emerald-700 text-white rounded-md hover:bg-emerald-800 transition-colors"
                        >
                          Confirmar Pagamento Agora
                        </button>
                      )}

                      {onOpenReceipt && (
                        <div className="flex items-center gap-2 pt-1">
                          <button
                            type="button"
                            onClick={() => onOpenReceipt(activeOrder, 'comanda')}
                            className="flex-1 py-1.5 px-2.5 text-[11px] font-medium bg-white border border-slate-200 text-slate-700 rounded-md hover:bg-slate-50 flex items-center justify-center gap-1.5"
                          >
                            <Printer className="w-3.5 h-3.5" />
                            Comanda
                          </button>
                          {getOrderServiceType(activeOrder) === 'entrega' && (
                            <button
                              type="button"
                              onClick={() => onOpenReceipt(activeOrder, 'motoboy')}
                              className="flex-1 py-1.5 px-2.5 text-[11px] font-medium bg-white border border-emerald-200 text-emerald-800 rounded-md hover:bg-emerald-50 flex items-center justify-center gap-1.5"
                            >
                              <Bike className="w-3.5 h-3.5" />
                              Motoboy
                            </button>
                          )}
                        </div>
                      )}
                    </div>

                    {/* Kitchen Stage Advance Control */}
                    {activeOrder.stage !== 'entregue' && activeOrder.stage !== 'cancelado' && (
                      <div className="space-y-1.5">
                        <button
                          type="button"
                          onClick={() => onAdvanceOrder(activeOrder.id)}
                          className="w-full py-2 px-3 text-xs font-semibold bg-slate-900 text-white rounded-md hover:bg-slate-800 transition-colors flex items-center justify-center gap-1.5"
                        >
                          <Truck className="w-3.5 h-3.5" />
                          Avançar Etapa & Notificar Chat
                          <ChevronRight className="w-3.5 h-3.5" />
                        </button>
                        <p className="text-[11px] text-slate-500 text-center">
                          Atualiza o rastreio ao vivo e envia aviso automático no WhatsApp.
                        </p>
                      </div>
                    )}

                    {/* Timeline */}
                    <div className="space-y-2 pt-2 border-t border-slate-100">
                      <div className="text-[11px] font-semibold text-slate-500">
                        Linha do Tempo
                      </div>
                      <div className="space-y-2">
                        {activeOrder.timeline
                          .slice()
                          .reverse()
                          .map((entry, idx) => (
                            <div key={idx} className="flex items-start justify-between gap-2 text-[11px]">
                              <div className="text-slate-700">
                                <span className="font-semibold">
                                  {ORDER_STAGE_META[entry.stage].shortLabel}:
                                </span>{' '}
                                {entry.note}
                              </div>
                              <span className="font-mono text-slate-400 tabular-nums shrink-0">
                                {formatTime(entry.timestamp)}
                              </span>
                            </div>
                          ))}
                      </div>
                    </div>
                  </div>
                ) : (
                  <p className="text-xs text-slate-500">
                    Nenhum pedido registrado ainda para este contato. Peça uma pizza no chat para gerar o pedido e o pagamento automaticamente.
                  </p>
                )}
              </div>
            </div>
          ) : null}
        </aside>
      </div>
    </div>
  );
};
