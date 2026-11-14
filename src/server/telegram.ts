import type { AppSnapshot } from '../types.ts';

export class TelegramConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TelegramConfigError';
  }
}

function formatBrlPlain(value: number): string {
  return `R$ ${value.toFixed(2).replace('.', ',')}`;
}

function toSaoPauloDateKey(date: Date): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

function formatDateTimeBr(date: Date): string {
  return new Intl.DateTimeFormat('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

export interface TelegramBackupResult {
  sentAt: string;
  filename: string;
  summary: string;
}

export async function sendTelegramBackup(
  snapshot: AppSnapshot,
  reason: string
): Promise<TelegramBackupResult> {
  const token =
    snapshot.settings.telegramBotToken?.trim() || process.env.TELEGRAM_BOT_TOKEN?.trim() || '';
  const chatId =
    snapshot.settings.telegramChatId?.trim() || process.env.TELEGRAM_CHAT_ID?.trim() || '';

  if (!token) {
    throw new TelegramConfigError(
      'Bot Token do Telegram não configurado. Informe o token do @BotFather em Integração & IA.'
    );
  }
  if (!chatId) {
    throw new TelegramConfigError(
      'Chat ID do Telegram não configurado. Informe seu Chat ID ou ID do canal em Integração & IA.'
    );
  }

  const now = new Date();
  const todayKey = toSaoPauloDateKey(now);

  const todaysOrders = snapshot.orders.filter((order) => {
    if (order.stage === 'cancelado') return false;
    return toSaoPauloDateKey(new Date(order.createdAt)) === todayKey;
  });

  const todayTotal = todaysOrders.reduce((acc, o) => acc + o.total, 0);
  const todayPaid = todaysOrders
    .filter((o) => o.payment.status === 'pago')
    .reduce((acc, o) => acc + o.total, 0);

  const captionLines = [
    `FornoDesk · Backup Completo`,
    `Pizzaria: ${snapshot.settings.pizzeriaName}`,
    `Motivo: ${reason}`,
    `Data/Hora: ${formatDateTimeBr(now)}`,
    ``,
    `Resumo de Hoje (${todayKey.split('-').reverse().join('/')}):`,
    `- Pedidos válidos hoje: ${todaysOrders.length}`,
    `- Faturamento do dia: ${formatBrlPlain(todayTotal)} (Pago: ${formatBrlPlain(todayPaid)})`,
    ``,
    `Base Completa no Arquivo JSON:`,
    `- ${snapshot.orders.length} pedidos | ${snapshot.customers.length} clientes`,
    `- ${snapshot.conversations.length} conversas | ${snapshot.menu.length} itens no cardápio`,
  ];
  const caption = captionLines.join('\n').slice(0, 1020);

  const stamp = [
    todayKey,
    String(now.getHours()).padStart(2, '0') + String(now.getMinutes()).padStart(2, '0'),
  ].join('-');
  const filename = `fornodesk-backup-${stamp}.json`;

  const jsonPayload = JSON.stringify(snapshot, null, 2);
  const formData = new FormData();
  formData.append('chat_id', chatId);
  formData.append('caption', caption);
  formData.append(
    'document',
    new Blob([jsonPayload], { type: 'application/json' }),
    filename
  );

  const endpoint = `https://api.telegram.org/bot${encodeURIComponent(token)}/sendDocument`;

  let response: Response;
  try {
    response = await fetch(endpoint, {
      method: 'POST',
      body: formData,
      signal: AbortSignal.timeout(20_000),
    });
  } catch (err) {
    const detail = err instanceof Error ? err.message : 'Falha de rede';
    throw new Error(`Não foi possível conectar à API do Telegram (${detail}).`);
  }

  const tgBody = (await response.json().catch(() => ({}))) as {
    ok?: boolean;
    description?: string;
    error_code?: number;
  };

  if (!response.ok || !tgBody.ok) {
    const desc = tgBody.description || `HTTP ${response.status}`;
    if (response.status === 401 || /unauthorized/i.test(desc)) {
      throw new Error(
        'Bot Token do Telegram inválido ou revogado. Confira o token criado no @BotFather.'
      );
    }
    if (/chat not found/i.test(desc)) {
      throw new Error(
        'Chat ID não encontrado. Abra seu bot no Telegram, envie /start e verifique o Chat ID informado.'
      );
    }
    if (/bot was blocked/i.test(desc)) {
      throw new Error('O bot foi bloqueado pelo usuário/grupo no Telegram.');
    }
    throw new Error(`Erro da API do Telegram: ${desc}`);
  }

  const sentAt = now.toISOString();
  const summary = `Enviado com sucesso (${snapshot.orders.length} pedidos · ${snapshot.customers.length} clientes)`;
  return { sentAt, filename, summary };
}
