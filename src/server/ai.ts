import { FunctionDeclaration, GoogleGenAI, Type, Content, ThinkingLevel } from '@google/genai';
import { store } from './store.ts';
import type { MessageAttachment, OrderItem, PaymentMethod } from '../types.ts';

function getAiClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY não configurada nas variáveis de ambiente do servidor.');
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

const getMenuDeclaration: FunctionDeclaration = {
  name: 'get_menu',
  description:
    'Consulta o cardápio atualizado da pizzaria com pizzas disponíveis, descrições, tamanhos (média, grande, gigante), bebidas e taxa de entrega.',
  parameters: {
    type: Type.OBJECT,
    properties: {
      category: {
        type: Type.STRING,
        description:
          'Opcional: filtrar por categoria ("Tradicionais", "Especiais", "Doces", "Bebidas") ou omitir para retornar tudo.',
      },
      highlightVisualMenu: {
        type: Type.BOOLEAN,
        description:
          'Defina como true quando o cliente pedir para ver o cardápio ou sugestões de sabores, para exibir o cartão visual com fotos no WhatsApp.',
      },
    },
  },
};

const registerCustomerDeclaration: FunctionDeclaration = {
  name: 'register_or_update_customer',
  description:
    'Salva ou atualiza automaticamente os dados cadastrais do cliente (nome, endereço, bairro, complemento, preferências) assim que ele informar qualquer dado na conversa.',
  parameters: {
    type: Type.OBJECT,
    properties: {
      name: {
        type: Type.STRING,
        description: 'Nome completo ou primeiro nome do cliente.',
      },
      address: {
        type: Type.STRING,
        description: 'Logradouro e número de entrega (ex: Rua Augusta, 1420).',
      },
      neighborhood: {
        type: Type.STRING,
        description: 'Bairro de entrega (ex: Consolação, Jardins).',
      },
      complement: {
        type: Type.STRING,
        description: 'Apartamento, bloco, casa ou ponto de referência.',
      },
      notes: {
        type: Type.STRING,
        description: 'Observações ou preferências do cliente (ex: sem cebola, interfone).',
      },
    },
  },
};

const createOrderDeclaration: FunctionDeclaration = {
  name: 'create_order',
  description:
    'Cria um novo pedido oficial na pizzaria e gera automaticamente o pagamento integrado (PIX Copia e Cola + QR Code ou link de cartão) além do rastreio no chat. Só chame após confirmar os itens, endereço de entrega e forma de pagamento.',
  parameters: {
    type: Type.OBJECT,
    properties: {
      items: {
        type: Type.ARRAY,
        description: 'Lista de itens do pedido.',
        items: {
          type: Type.OBJECT,
          properties: {
            menuItemId: {
              type: Type.STRING,
              description: 'ID exato do item no cardápio (ex: pizza-margherita, pizza-calabresa).',
            },
            size: {
              type: Type.STRING,
              description: 'Tamanho: "media", "grande", "gigante" ou "unico" (para bebidas).',
            },
            crust: {
              type: Type.STRING,
              description: 'Borda opcional: "Tradicional", "Catupiry (+R$ 16)", "Cheddar (+R$ 16)".',
            },
            quantity: {
              type: Type.INTEGER,
              description: 'Quantidade do item.',
            },
            halfAndHalfItemName: {
              type: Type.STRING,
              description: 'Se for pizza meio a meio, nome do segundo sabor.',
            },
          },
          required: ['menuItemId', 'size', 'quantity'],
        },
      },
      paymentMethod: {
        type: Type.STRING,
        description: 'Forma de pagamento escolhida: "pix", "cartao_online", "cartao_entrega" ou "dinheiro".',
      },
    },
    required: ['items', 'paymentMethod'],
  },
};

const getOrderStatusDeclaration: FunctionDeclaration = {
  name: 'get_order_status',
  description:
    'Consulta o status em tempo real do pedido ativo ou mais recente do cliente (etapa na cozinha/forno/entrega, previsão de chegada, pagamento e entregador) e anexa o rastreio ao vivo no chat.',
  parameters: {
    type: Type.OBJECT,
    properties: {
      orderCode: {
        type: Type.STRING,
        description: 'Código opcional do pedido (ex: #2048). Se omitido, retorna o pedido mais recente do cliente.',
      },
    },
  },
};

const requestHumanHandoffDeclaration: FunctionDeclaration = {
  name: 'request_human_handoff',
  description:
    'Transfere o atendimento para um atendente humano quando o cliente solicitar explicitamente ou houver reclamação complexa.',
  parameters: {
    type: Type.OBJECT,
    properties: {
      reason: {
        type: Type.STRING,
        description: 'Motivo resumido da transferência para a equipe.',
      },
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

  const systemInstruction = `Você é o atendente virtual inteligente oficial da ${snapshot.settings.pizzeriaName} no WhatsApp.
Tom de voz: ${snapshot.settings.aiPersonaTone}

DADOS ATUAIS DO CLIENTE NO CRM:
- ID: ${customer.id}
- Nome: ${customer.name}
- Telefone WhatsApp: ${customer.phone}
- Endereço cadastrado: ${customer.address || 'NÃO INFORMADO'}
- Bairro: ${customer.neighborhood || 'NÃO INFORMADO'}
- Complemento: ${customer.complement || 'Nenhum'}
- Observações: ${customer.notes || 'Nenhuma'}

PEDIDO MAIS RECENTE DO CLIENTE:
${
  activeOrder
    ? `- Código: ${activeOrder.code} | Etapa atual: ${activeOrder.stage} | Pagamento: ${activeOrder.payment.method} (${activeOrder.payment.status}) | Total: R$ ${activeOrder.total.toFixed(2)} | ETA: ${activeOrder.estimatedMinutes} min`
    : '- Nenhum pedido ativo ainda.'
}

INFORMAÇÕES DA PIZZARIA:
- Taxa de entrega padrão: R$ ${snapshot.settings.deliveryFee.toFixed(2)}
- Tempo médio de entrega: ${snapshot.settings.averagePrepMinutes} minutos
- Bordas recheadas disponíveis: Tradicional (grátis), Catupiry (+R$ 16,00), Cheddar (+R$ 16,00).
- Formas de pagamento: PIX instantâneo (gerado direto no chat), Cartão Online (link direto no chat), Cartão na Entrega, Dinheiro.

CARDÁPIO DISPONÍVEL AGORA (IDs exatos para usar em create_order):
${snapshot.menu
  .filter((m) => m.available)
  .map(
    (m) =>
      `- ${m.id} | ${m.name} (${m.category}): ${
        m.prices.media ? `M R$${m.prices.media}, ` : ''
      }G R$${m.prices.grande}${m.prices.gigante ? `, GG R$${m.prices.gigante}` : ''}`
  )
  .join('\n')}

REGRAS OPERACIONAIS OBRIGATÓRIAS:
1. Sempre que o cliente informar nome, endereço, bairro, complemento ou preferência, chame IMEDIATAMENTE a ferramenta \`register_or_update_customer\` para manter o cadastro automático atualizado.
2. Quando o cliente pedir explicitamente para ver o cardápio ou sugestões, chame \`get_menu\` com \`highlightVisualMenu: true\`.
3. Quando o cliente já disser o sabor, tamanho, endereço e forma de pagamento, você pode chamar \`register_or_update_customer\` e \`create_order\` diretamente na mesma rodada usando os IDs do cardápio acima!
4. Antes de chamar \`create_order\`, garanta que você já sabe: (a) quais itens e tamanhos o cliente quer, (b) endereço completo de entrega (se ainda não estiver no CRM, peça antes de fechar!), e (c) forma de pagamento preferida.
5. Ao criar um pedido com \`create_order\`:
   - Se for PIX ou Cartão Online, informe o valor exato e diga que o cartão de pagamento já foi enviado logo abaixo no chat para pagamento com 1 clique / Copia e Cola.
   - Se for pagamento na entrega, informe que o pedido foi enviado direto para a cozinha e o rastreio já está ativo.
6. Se o cliente perguntar "onde está meu pedido", "status", "já saiu?", "quanto falta?", chame \`get_order_status\` e responda com precisão usando os dados retornados.
7. Escreva mensagens concisas, bem formatadas para leitura rápida no WhatsApp (use quebras de linha curtas, sem markdown pesado como # títulos). Nunca invente preços fora do cardápio acima.`;

  // Build conversation history for Gemini
  const recentMessages = messages.slice(-14);
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

  // Ensure history starts with a user turn and is non-empty
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

  const modelsToTry = ['gemini-4-hydrogen', 'gemini-3.1-flash-lite'] as const;

  for (let step = 0; step < 5; step++) {
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
                modelName === 'gemini-4-hydrogen'
                  ? ThinkingLevel.LOW
                  : ThinkingLevel.MINIMAL,
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
          msg.includes('500');
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
          'Recebi sua mensagem! Como posso ajudar com o seu pedido hoje na Pizzaria Bella Fornalha?',
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
            description: m.description,
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
                : 'Nenhum item válido do cardápio foi identificado. Consulte get_menu e tente novamente.',
          };
        } else {
          const createdOrder = store.createOrder({
            customerId: customer.id,
            conversationId,
            items: resolvedItems,
            paymentMethod,
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
            total: createdOrder.total,
            paymentMethod: createdOrder.payment.method,
            paymentStatus: createdOrder.payment.status,
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
