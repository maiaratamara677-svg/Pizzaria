import { FunctionDeclaration, GoogleGenAI, Type, Content, ThinkingLevel } from '@google/genai';
import { store } from './store.ts';
import type { MessageAttachment, OrderItem, PaymentMethod } from '../types.ts';

let cachedAiClient: { apiKey: string; client: GoogleGenAI } | null = null;

function getAiClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY não configurada nas variáveis de ambiente do servidor.');
  }
  if (!cachedAiClient || cachedAiClient.apiKey !== apiKey) {
    cachedAiClient = {
      apiKey,
      client: new GoogleGenAI({
        apiKey,
        httpOptions: {
          headers: {
            'User-Agent': 'aistudio-build',
          },
          timeout: 15_000,
        },
      }),
    };
  }
  return cachedAiClient.client;
}

const getMenuDeclaration: FunctionDeclaration = {
  name: 'get_menu',
  description:
    'Envia o cartão visual do cardápio no WhatsApp quando o cliente pedir explicitamente para ver o cardápio ou sugestões.',
  parameters: {
    type: Type.OBJECT,
    properties: {
      category: {
        type: Type.STRING,
        description: 'Categoria opcional: "Tradicionais", "Especiais", "Doces" ou "Bebidas".',
      },
      highlightVisualMenu: {
        type: Type.BOOLEAN,
        description: 'Use true para anexar o cartão visual com fotos no chat.',
      },
    },
  },
};

const registerCustomerDeclaration: FunctionDeclaration = {
  name: 'register_or_update_customer',
  description:
    'Atualiza os dados do cliente no CRM quando ele informar nome, endereço, bairro, complemento ou observação sem ainda fechar pedido.',
  parameters: {
    type: Type.OBJECT,
    properties: {
      name: { type: Type.STRING, description: 'Nome do cliente.' },
      address: { type: Type.STRING, description: 'Rua e número de entrega.' },
      neighborhood: { type: Type.STRING, description: 'Bairro de entrega.' },
      complement: { type: Type.STRING, description: 'Apartamento, bloco ou referência.' },
      notes: { type: Type.STRING, description: 'Preferências ou observações.' },
    },
  },
};

const createOrderDeclaration: FunctionDeclaration = {
  name: 'create_order',
  description:
    'Cria o pedido e gera pagamento PIX/Cartão ou rastreio na cozinha. Pode receber também os dados do cliente (nome/endereço) na mesma chamada para concluir tudo em 1 único passo.',
  parameters: {
    type: Type.OBJECT,
    properties: {
      customerName: { type: Type.STRING, description: 'Nome do cliente (se informado nesta conversa).' },
      deliveryAddress: { type: Type.STRING, description: 'Rua e número de entrega (se informado).' },
      neighborhood: { type: Type.STRING, description: 'Bairro de entrega (se informado).' },
      complement: { type: Type.STRING, description: 'Apartamento/referência (se informado).' },
      notes: { type: Type.STRING, description: 'Observação do cliente/pedido.' },
      items: {
        type: Type.ARRAY,
        description: 'Itens do pedido.',
        items: {
          type: Type.OBJECT,
          properties: {
            menuItemId: {
              type: Type.STRING,
              description: 'ID exato do item no cardápio.',
            },
            size: {
              type: Type.STRING,
              description: '"media", "grande", "gigante" ou "unico" (bebidas).',
            },
            crust: {
              type: Type.STRING,
              description: '"Tradicional", "Catupiry (+R$ 16)" ou "Cheddar (+R$ 16)".',
            },
            quantity: {
              type: Type.INTEGER,
              description: 'Quantidade.',
            },
            halfAndHalfItemName: {
              type: Type.STRING,
              description: 'Segundo sabor se meio a meio.',
            },
          },
          required: ['menuItemId', 'size', 'quantity'],
        },
      },
      paymentMethod: {
        type: Type.STRING,
        description: '"pix", "cartao_online", "cartao_entrega" ou "dinheiro".',
      },
      serviceType: {
        type: Type.STRING,
        description: '"entrega", "retirada" ou "mesa".',
      },
      tableNumber: {
        type: Type.STRING,
        description: 'Número da mesa se serviceType="mesa".',
      },
      changeFor: {
        type: Type.NUMBER,
        description: 'Valor para troco se paymentMethod="dinheiro".',
      },
      couponCode: {
        type: Type.STRING,
        description: 'Código do cupom informado.',
      },
      useCashback: {
        type: Type.BOOLEAN,
        description: 'true para resgatar saldo de cashback do cliente.',
      },
    },
    required: ['items', 'paymentMethod'],
  },
};

const getOrderStatusDeclaration: FunctionDeclaration = {
  name: 'get_order_status',
  description: 'Consulta o status ao vivo do pedido do cliente e envia o rastreio no chat.',
  parameters: {
    type: Type.OBJECT,
    properties: {
      orderCode: {
        type: Type.STRING,
        description: 'Código opcional (ex: #2048).',
      },
    },
  },
};

const requestHumanHandoffDeclaration: FunctionDeclaration = {
  name: 'request_human_handoff',
  description: 'Transfere a conversa para um atendente humano.',
  parameters: {
    type: Type.OBJECT,
    properties: {
      reason: { type: Type.STRING, description: 'Motivo resumido.' },
    },
    required: ['reason'],
  },
};

const TOOL_DECLARATIONS: FunctionDeclaration[] = [
  getMenuDeclaration,
  registerCustomerDeclaration,
  createOrderDeclaration,
  getOrderStatusDeclaration,
  requestHumanHandoffDeclaration,
];

export interface AiTurnResult {
  replyText: string;
  attachment?: MessageAttachment;
  actionLabels: string[];
}

export async function generateWhatsAppAiReply(conversationId: string): Promise<AiTurnResult> {
  const ctx = store.getConversationContext(conversationId);
  if (!ctx) {
    throw new Error('Conversa não encontrada.');
  }

  const snapshot = store.getSnapshot();
  const { customer, messages, orders } = ctx;
  const activeOrder = orders[0];

  const systemInstruction = `Você é atendente da ${snapshot.settings.pizzeriaName} no WhatsApp. Tom: ${snapshot.settings.aiPersonaTone}

CLIENTE: ${customer.name} | Tel: ${customer.phone} | Endereço: ${customer.address || 'NÃO INFORMADO'} | Bairro: ${customer.neighborhood || 'NÃO INFORMADO'} | Comp: ${customer.complement || '-'} | Cashback: R$ ${(customer.cashbackBalance ?? 0).toFixed(2)}
PEDIDO RECENTE: ${activeOrder ? `${activeOrder.code} | ${activeOrder.stage} | ${activeOrder.payment.method} (${activeOrder.payment.status}) | R$ ${activeOrder.total.toFixed(2)} | ETA ${activeOrder.estimatedMinutes}m` : 'Nenhum'}
LOJA: Entrega R$ ${snapshot.settings.deliveryFee.toFixed(2)} (grátis retirada/mesa) | Tempo ${snapshot.settings.averagePrepMinutes}m | Bordas: Tradicional, Catupiry (+16), Cheddar (+16) | Pagamentos: pix, cartao_online, cartao_entrega, dinheiro.
PROMOS: Cashback ${snapshot.promotions.cashback.enabled ? `${snapshot.promotions.cashback.percent}% (>=R$${snapshot.promotions.cashback.minOrderValue})` : 'off'} | Progressivo ${snapshot.promotions.progressiveEnabled ? snapshot.promotions.progressiveTiers.map((t) => `${t.minItems}+=${t.discountPercent}%`).join(', ') : 'off'} | Cupons: ${snapshot.coupons.filter((c) => c.active).map((c) => `${c.code}(${c.type === 'percent' ? `${c.value}%` : `R$${c.value}`})`).join(', ') || 'nenhum'}

CARDÁPIO (use estes IDs em create_order, NÃO chame get_menu só para checar preço):
${snapshot.menu
  .filter((m) => m.available)
  .map(
    (m) =>
      `${m.id}|${m.name}: ${m.prices.media ? `M=${m.prices.media} ` : ''}G=${m.prices.grande}${m.prices.gigante ? ` GG=${m.prices.gigante}` : ''}`
  )
  .join('\n')}

REGRAS:
1. Ao pedir cardápio/sabores, chame get_menu(highlightVisualMenu: true).
2. Ao informar dados sem pedir ainda, chame register_or_update_customer.
3. Ao pedir + informar dados/pagamento na mesma mensagem, chame APENAS create_order preenchendo customerName/deliveryAddress/neighborhood/complement dentro dele (1 única rodada!).
4. Antes de create_order confirme itens, tipo (entrega com endereço, retirada ou mesa) e pagamento.
5. Ao perguntar status, chame get_order_status.
6. Respostas curtas e naturais de WhatsApp (2 a 5 linhas, sem # markdown).`;

  // Keep recent history lean for fast inference
  const recentMessages = messages.slice(-8);
  const contents: Content[] = [];
  for (const msg of recentMessages) {
    if (!msg.text || !msg.text.trim()) continue;
    const role = msg.sender === 'customer' ? 'user' : 'model';
    const last = contents[contents.length - 1];
    if (last && last.role === role) {
      last.parts = [...(last.parts ?? []), { text: msg.text }];
    } else {
      contents.push({
        role,
        parts: [{ text: msg.text }],
      });
    }
  }

  while (contents.length > 0 && contents[0].role !== 'user') {
    contents.shift();
  }
  if (contents.length === 0) {
    contents.push({ role: 'user', parts: [{ text: 'Olá' }] });
  }

  const ai = getAiClient();
  let attachment: MessageAttachment | undefined;
  const actionLabels: string[] = [];

  let currentContents: Content[] = contents;

  // Prioritize ultra-low-latency flash-lite with MINIMAL thinking; fallback to hydrogen LOW if unavailable
  const modelsToTry = ['gemini-3.1-flash-lite', 'gemini-4-hydrogen'] as const;

  for (let step = 0; step < 3; step++) {
    let response;
    let lastErr: unknown;

    for (const modelName of modelsToTry) {
      try {
        response = await ai.models.generateContent({
          model: modelName,
          contents: currentContents,
          config: {
            systemInstruction,
            tools: [{ functionDeclarations: TOOL_DECLARATIONS }],
            thinkingConfig: {
              thinkingLevel:
                modelName === 'gemini-3.1-flash-lite'
                  ? ThinkingLevel.MINIMAL
                  : ThinkingLevel.LOW,
            },
          },
        });
        lastErr = undefined;
        break;
      } catch (err) {
        lastErr = err;
        const msg = err instanceof Error ? err.message : String(err);
        const isQuotaOrTransient =
          msg.includes('429') ||
          msg.includes('RESOURCE_EXHAUSTED') ||
          msg.includes('503') ||
          msg.includes('500') ||
          msg.includes('404') ||
          msg.includes('NOT_FOUND') ||
          msg.includes('timeout') ||
          msg.includes('AbortError');
        if (!isQuotaOrTransient) {
          throw err;
        }
      }
    }

    if (!response) {
      const msg = lastErr instanceof Error ? lastErr.message : String(lastErr ?? '');
      if (msg.includes('429') || msg.includes('RESOURCE_EXHAUSTED')) {
        throw new Error(
          'A cota gratuita diária da API Gemini foi atingida para esta chave. Selecione uma chave com faturamento ativo em Settings > Secrets para continuar sem limites.'
        );
      }
      throw new Error(msg || 'Não foi possível obter resposta da IA.');
    }

    const candidateContent = response.candidates?.[0]?.content;
    const functionCalls = response.functionCalls;

    if (!functionCalls || functionCalls.length === 0) {
      const finalText = (response.text ?? '').trim();
      return {
        replyText:
          finalText ||
          `Recebi sua mensagem! Como posso ajudar com o seu pedido hoje na ${snapshot.settings.pizzeriaName}?`,
        attachment,
        actionLabels,
      };
    }

    if (candidateContent) {
      currentContents = [...currentContents, candidateContent];
    }

    const functionResponseParts = [];

    for (const fc of functionCalls) {
      const args = (fc.args ?? {}) as Record<string, unknown>;
      let toolResult: Record<string, unknown> = {};

      if (fc.name === 'get_menu') {
        const category = typeof args.category === 'string' ? args.category : undefined;
        const availableMenu = snapshot.menu.filter(
          (m) => m.available && (!category || m.category.toLowerCase() === category.toLowerCase())
        );
        if (args.highlightVisualMenu && availableMenu.length > 0 && !attachment) {
          attachment = {
            type: 'menu_highlight',
            items: availableMenu.slice(0, 4),
          };
          actionLabels.push('Cardápio enviado');
        }
        toolResult = {
          deliveryFee: snapshot.settings.deliveryFee,
          items: availableMenu.map((m) => ({
            id: m.id,
            name: m.name,
            category: m.category,
            prices: m.prices,
          })),
        };
      } else if (fc.name === 'register_or_update_customer') {
        const updated = store.upsertCustomerFields(customer.id, {
          name: typeof args.name === 'string' ? args.name : undefined,
          address: typeof args.address === 'string' ? args.address : undefined,
          neighborhood: typeof args.neighborhood === 'string' ? args.neighborhood : undefined,
          complement: typeof args.complement === 'string' ? args.complement : undefined,
          notes: typeof args.notes === 'string' ? args.notes : undefined,
        });
        actionLabels.push('Cadastro automático atualizado');
        toolResult = {
          success: true,
          customer: updated,
        };
      } else if (fc.name === 'create_order') {
        // Also persist any inline customer details passed directly to create_order
        const hasCustomerPatch =
          typeof args.customerName === 'string' ||
          typeof args.deliveryAddress === 'string' ||
          typeof args.neighborhood === 'string' ||
          typeof args.complement === 'string' ||
          typeof args.notes === 'string';
        if (hasCustomerPatch) {
          store.upsertCustomerFields(customer.id, {
            name: typeof args.customerName === 'string' ? args.customerName : undefined,
            address: typeof args.deliveryAddress === 'string' ? args.deliveryAddress : undefined,
            neighborhood: typeof args.neighborhood === 'string' ? args.neighborhood : undefined,
            complement: typeof args.complement === 'string' ? args.complement : undefined,
            notes: typeof args.notes === 'string' ? args.notes : undefined,
          });
          if (!actionLabels.includes('Cadastro automático atualizado')) {
            actionLabels.push('Cadastro automático atualizado');
          }
        }

        const rawItems = Array.isArray(args.items) ? args.items : [];
        const paymentMethod = (
          ['pix', 'cartao_online', 'cartao_entrega', 'dinheiro'].includes(String(args.paymentMethod))
            ? String(args.paymentMethod)
            : 'pix'
        ) as PaymentMethod;

        const resolvedItems: OrderItem[] = [];
        const unavailableNames: string[] = [];
        for (const raw of rawItems) {
          const itemObj = raw as Record<string, unknown>;
          const menuId = String(itemObj.menuItemId ?? '').trim();
          const cleanMenuId = menuId.toLowerCase();
          const menuItem = cleanMenuId
            ? snapshot.menu.find((m) => m.id.toLowerCase() === cleanMenuId) ||
              snapshot.menu.find((m) => m.name.toLowerCase().includes(cleanMenuId))
            : undefined;
          if (!menuItem) continue;
          if (!menuItem.available) {
            unavailableNames.push(menuItem.name);
            continue;
          }

          const sizeRaw = String(itemObj.size ?? 'grande').toLowerCase();
          const size: OrderItem['size'] =
            sizeRaw === 'media' || sizeRaw === 'média'
              ? 'media'
              : sizeRaw === 'gigante'
                ? 'gigante'
                : menuItem.category === 'Bebidas'
                  ? 'unico'
                  : 'grande';

          const getPriceForSize = (item: typeof menuItem) =>
            size === 'media'
              ? (item.prices.media ?? item.prices.grande)
              : size === 'gigante'
                ? (item.prices.gigante ?? item.prices.grande)
                : item.prices.grande;

          let basePrice = getPriceForSize(menuItem);

          const halfName =
            typeof itemObj.halfAndHalfItemName === 'string'
              ? itemObj.halfAndHalfItemName.trim()
              : undefined;
          if (halfName) {
            const halfItem = snapshot.menu.find(
              (m) =>
                m.available &&
                (m.id.toLowerCase() === halfName.toLowerCase() ||
                  m.name.toLowerCase().includes(halfName.toLowerCase()))
            );
            if (halfItem) {
              basePrice = Math.max(basePrice, getPriceForSize(halfItem));
            }
          }

          const crustStr = typeof itemObj.crust === 'string' ? itemObj.crust : undefined;
          const crustExtra =
            crustStr && /catupiry|cheddar/i.test(crustStr) && menuItem.category !== 'Bebidas' ? 16 : 0;

          resolvedItems.push({
            menuItemId: menuItem.id,
            name: menuItem.name,
            size,
            crust: menuItem.category !== 'Bebidas' ? crustStr || 'Tradicional' : undefined,
            quantity: Math.max(1, Number(itemObj.quantity) || 1),
            unitPrice: basePrice + crustExtra,
            halfAndHalf: halfName || undefined,
          });
        }

        if (resolvedItems.length === 0) {
          toolResult = {
            success: false,
            error:
              unavailableNames.length > 0
                ? `Os seguintes itens estão esgotados no momento: ${unavailableNames.join(', ')}. Sugira outro sabor disponível.`
                : 'Nenhum item válido do cardápio foi identificado.',
          };
        } else {
          const serviceTypeRaw = String(args.serviceType ?? 'entrega').toLowerCase();
          const serviceType =
            serviceTypeRaw === 'retirada' || serviceTypeRaw === 'mesa'
              ? serviceTypeRaw
              : 'entrega';
          const createdOrder = store.createOrder({
            customerId: customer.id,
            conversationId,
            serviceType,
            tableNumber: typeof args.tableNumber === 'string' ? args.tableNumber : undefined,
            items: resolvedItems,
            paymentMethod,
            changeFor: typeof args.changeFor === 'number' ? args.changeFor : undefined,
            couponCode: typeof args.couponCode === 'string' ? args.couponCode : undefined,
            useCashback: Boolean(args.useCashback),
          });

          if (paymentMethod === 'pix' || paymentMethod === 'cartao_online') {
            attachment = {
              type: 'payment',
              orderId: createdOrder.id,
              orderCode: createdOrder.code,
              payment: createdOrder.payment,
            };
            actionLabels.push(`Pedido ${createdOrder.code} · Pagamento gerado`);
          } else {
            attachment = {
              type: 'tracking',
              orderId: createdOrder.id,
            };
            actionLabels.push(`Pedido ${createdOrder.code} · Rastreio ativo`);
          }

          toolResult = {
            success: true,
            orderCode: createdOrder.code,
            orderId: createdOrder.id,
            serviceType: createdOrder.serviceType,
            subtotal: createdOrder.subtotal,
            deliveryFee: createdOrder.deliveryFee,
            discountTotal: createdOrder.discountTotal ?? 0,
            couponCode: createdOrder.couponCode ?? null,
            cashbackUsed: createdOrder.cashbackUsed ?? 0,
            progressiveDiscount: createdOrder.progressiveDiscount ?? 0,
            total: createdOrder.total,
            paymentMethod: createdOrder.payment.method,
            paymentStatus: createdOrder.payment.status,
            changeFor: createdOrder.payment.changeFor ?? null,
            changeAmount: createdOrder.payment.changeAmount ?? null,
            pixGenerated: Boolean(createdOrder.payment.pixCode),
            estimatedMinutes: createdOrder.estimatedMinutes,
          };
        }
      } else if (fc.name === 'get_order_status') {
        const latestCtx = store.getConversationContext(conversationId);
        const requestedCode = typeof args.orderCode === 'string' ? args.orderCode.trim() : '';
        const targetOrder =
          latestCtx?.orders.find((o) => o.code === requestedCode) ?? latestCtx?.orders[0];

        if (!targetOrder) {
          toolResult = { found: false, message: 'Cliente ainda não possui pedidos registrados.' };
        } else {
          attachment = {
            type: 'tracking',
            orderId: targetOrder.id,
          };
          actionLabels.push(`Rastreio ao vivo ${targetOrder.code}`);
          toolResult = {
            found: true,
            orderCode: targetOrder.code,
            stage: targetOrder.stage,
            paymentStatus: targetOrder.payment.status,
            estimatedMinutes: targetOrder.estimatedMinutes,
            riderName: targetOrder.riderName ?? null,
            deliveryAddress: targetOrder.deliveryAddress,
            timeline: targetOrder.timeline,
          };
        }
      } else if (fc.name === 'request_human_handoff') {
        store.updateConversation(conversationId, {
          handoffRequested: true,
          aiEnabled: false,
        });
        actionLabels.push('Transferido para atendente');
        toolResult = {
          success: true,
          handoffActive: true,
          reason: args.reason ?? 'Solicitado pelo cliente',
        };
      }

      functionResponseParts.push({
        functionResponse: {
          id: fc.id,
          name: fc.name ?? 'tool',
          response: toolResult,
        },
      });
    }

    currentContents = [
      ...currentContents,
      {
        role: 'user',
        parts: functionResponseParts,
      },
    ];
  }

  return {
    replyText: 'Tudo certo por aqui! Me avise se precisar de mais alguma informação sobre seu pedido.',
    attachment,
    actionLabels,
  };
}
