import { store } from './store.ts';
import { sendTelegramBackup } from './telegram.ts';

let schedulerTimer: NodeJS.Timeout | null = null;
let isRunningBackup = false;

function getSaoPauloDateAndTime(date: Date): { dateKey: string; timeHm: string } {
  const dateKey = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);

  const timeHm = new Intl.DateTimeFormat('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(date);

  return { dateKey, timeHm };
}

export async function runScheduledBackup(mode: 'hourly' | 'daily'): Promise<void> {
  if (isRunningBackup) return;
  isRunningBackup = true;

  const nowIso = new Date().toISOString();
  const label = mode === 'hourly' ? 'Backup automático (a cada hora)' : 'Backup automático diário';

  try {
    const filename = store.saveLocalBackupFile(mode === 'hourly' ? 'hora' : 'diario');
    const snapshot = store.getSnapshot();
    const hasTelegram = Boolean(
      (snapshot.settings.telegramBotToken?.trim() || process.env.TELEGRAM_BOT_TOKEN?.trim()) &&
        (snapshot.settings.telegramChatId?.trim() || process.env.TELEGRAM_CHAT_ID?.trim())
    );

    if (hasTelegram) {
      try {
        const tgResult = await sendTelegramBackup(snapshot, label);
        store.recordTelegramBackupResult(`Agendado (${mode === 'hourly' ? 'hora' : 'dia'}): ${tgResult.summary}`, tgResult.sentAt);
        store.recordScheduledBackupResult(
          `Salvo em ${filename} e enviado ao Telegram`,
          nowIso
        );
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'erro desconhecido';
        store.recordTelegramBackupResult(`Falha no envio agendado: ${msg}`);
        store.recordScheduledBackupResult(
          `Salvo localmente (${filename}); falha no Telegram: ${msg}`,
          nowIso
        );
      }
    } else {
      store.recordScheduledBackupResult(
        `Salvo localmente (${filename}) · configure o Telegram para envio automático`,
        nowIso
      );
    }
  } finally {
    isRunningBackup = false;
  }
}

export async function checkScheduledBackupDue(): Promise<void> {
  const { settings } = store.getSnapshot();
  const schedule = settings.backupSchedule ?? 'manual';
  if (schedule === 'manual') return;

  const now = new Date();

  if (schedule === 'hourly') {
    const lastMs = settings.lastScheduledBackupAt
      ? Date.parse(settings.lastScheduledBackupAt)
      : NaN;
    if (!Number.isFinite(lastMs) || now.getTime() - lastMs >= 60 * 60_000) {
      await runScheduledBackup('hourly');
    }
    return;
  }

  if (schedule === 'daily') {
    const targetHm = /^([01]\d|2[0-3]):[0-5]\d$/.test(settings.backupDailyTime || '')
      ? settings.backupDailyTime
      : '23:55';
    const current = getSaoPauloDateAndTime(now);
    const lastDateKey = settings.lastScheduledBackupAt
      ? getSaoPauloDateAndTime(new Date(settings.lastScheduledBackupAt)).dateKey
      : '';

    if (current.dateKey !== lastDateKey && current.timeHm >= targetHm) {
      await runScheduledBackup('daily');
    }
  }
}

export function startBackupScheduler(): void {
  if (schedulerTimer) {
    clearInterval(schedulerTimer);
  }
  schedulerTimer = setInterval(() => {
    void checkScheduledBackupDue().catch((err) => {
      console.error('Erro no agendador de backup:', err);
    });
  }, 60_000);
}
