import React, { useEffect, useRef, useState } from 'react';
import {
  Bell,
  Check,
  Copy,
  Download,
  Eye,
  EyeOff,
  Loader2,
  Save,
  Send,
  Upload,
  Volume2,
  Webhook,
} from 'lucide-react';
import type { AppSnapshot, PaymentSoundType, StoreSettings } from '../types.ts';
import { formatTime } from '../utils/format.ts';
import {
  PAYMENT_SOUND_OPTIONS,
  playPaymentSound,
  unlockKitchenBellAudio,
} from '../utils/sound.ts';

interface SettingsViewProps {
  snapshot: AppSnapshot;
  onSaveSettings: (patch: Partial<StoreSettings>) => Promise<void>;
  onSendTelegramBackup: (overrideConfig?: {
    telegramBotToken?: string;
    telegramChatId?: string;
    telegramAutoBackupOnPayment?: boolean;
  }) => Promise<{ summary: string; sentAt: string }>;
  onRestoreBackup: (parsedSnapshot: unknown) => Promise<void>;
}

export const SettingsView: React.FC<SettingsViewProps> = ({
  snapshot,
  onSaveSettings,
  onSendTelegramBackup,
  onRestoreBackup,
}) => {
  const [form, setForm] = useState<StoreSettings>(snapshot.settings);
  const [saving, setSaving] = useState(false);
  const [savedFeedback, setSavedFeedback] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [copiedWebhook, setCopiedWebhook] = useState(false);

  useEffect(() => {
    setForm((prev) =>
      prev.paymentSound === snapshot.settings.paymentSound
        ? prev
        : { ...prev, paymentSound: snapshot.settings.paymentSound }
    );
  }, [snapshot.settings.paymentSound]);

  const [showBotToken, setShowBotToken] = useState(false);
  const [sendingTelegram, setSendingTelegram] = useState(false);
  const [telegramFeedback, setTelegramFeedback] = useState<string | null>(null);
  const [telegramError, setTelegramError] = useState<string | null>(null);

  const restoreInputRef = useRef<HTMLInputElement | null>(null);
  const [pendingRestore, setPendingRestore] = useState<{
    filename: string;
    data: AppSnapshot;
  } | null>(null);
  const [restoring, setRestoring] = useState(false);
  const [restoreFeedback, setRestoreFeedback] = useState<string | null>(null);
  const [restoreError, setRestoreError] = useState<string | null>(null);

  const webhookUrl =
    typeof window !== 'undefined'
      ? `${window.location.origin}/api/webhook/whatsapp`
      : '/api/webhook/whatsapp';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setSaveError(null);
    setSavedFeedback(false);
    try {
      const {
        lastTelegramBackupAt: _ignoreAt,
        lastTelegramBackupStatus: _ignoreStatus,
        ...editableSettings
      } = form;
      await onSaveSettings(editableSettings);
      setSavedFeedback(true);
      setTimeout(() => setSavedFeedback(false), 2500);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Erro ao salvar configurações.');
    } finally {
      setSaving(false);
    }
  };

  const handleSendTelegramNow = async () => {
    setSendingTelegram(true);
    setTelegramFeedback(null);
    setTelegramError(null);
    try {
      const res = await onSendTelegramBackup({
        telegramBotToken: form.telegramBotToken,
        telegramChatId: form.telegramChatId,
        telegramAutoBackupOnPayment: form.telegramAutoBackupOnPayment,
      });
      setTelegramFeedback(`Backup enviado ao Telegram (${res.summary}).`);
    } catch (err) {
      setTelegramError(
        err instanceof Error ? err.message : 'Erro ao enviar backup para o Telegram.'
      );
    } finally {
      setSendingTelegram(false);
    }
  };

  const handleSelectRestoreFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    setRestoreError(null);
    setRestoreFeedback(null);

    try {
      const text = await file.text();
      const parsed = JSON.parse(text) as AppSnapshot;
      if (
        !parsed ||
        !Array.isArray(parsed.orders) ||
        !Array.isArray(parsed.customers) ||
        !Array.isArray(parsed.menu) ||
        !parsed.settings
      ) {
        throw new Error('O arquivo selecionado não é um backup válido do FornoDesk.');
      }
      setPendingRestore({ filename: file.name, data: parsed });
    } catch (err) {
      setRestoreError(
        err instanceof Error ? err.message : 'Não foi possível ler o arquivo JSON.'
      );
    }
  };

  const handleConfirmRestore = async () => {
    if (!pendingRestore) return;
    setRestoring(true);
    setRestoreError(null);
    try {
      await onRestoreBackup(pendingRestore.data);
      setForm(pendingRestore.data.settings);
      setRestoreFeedback(
        `Backup "${pendingRestore.filename}" restaurado com ${pendingRestore.data.orders.length} pedidos.`
      );
      setPendingRestore(null);
    } catch (err) {
      setRestoreError(
        err instanceof Error ? err.message : 'Erro ao restaurar backup.'
      );
    } finally {
      setRestoring(false);
    }
  };

  const copyWebhook = async () => {
    try {
      await navigator.clipboard.writeText(webhookUrl);
      setCopiedWebhook(true);
      setTimeout(() => setCopiedWebhook(false), 2000);
    } catch {
      setCopiedWebhook(false);
    }
  };

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-stone-900">
          Configurações da Pizzaria, PIX, WhatsApp & Backup Telegram
        </h1>
        <p className="text-xs text-stone-600 mt-1">
          Configure os parâmetros operacionais da IA, conexão oficial com o WhatsApp e envio automático de backups para o Telegram.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="bg-[#FFFDF9]/95 border border-stone-200 rounded-lg p-5 space-y-4">
          <h2 className="text-sm font-semibold text-stone-900 border-b border-stone-100 pb-2">
            Operação & Pagamento PIX
          </h2>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-stone-700 mb-1">
                Nome da Pizzaria
              </label>
              <input
                type="text"
                value={form.pizzeriaName}
                onChange={(e) => setForm({ ...form, pizzeriaName: e.target.value })}
                className="w-full px-3 py-2 text-xs bg-white border border-stone-200 rounded-md"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-stone-700 mb-1">
                Número WhatsApp Business
              </label>
              <input
                type="text"
                value={form.whatsappPhoneDisplay}
                onChange={(e) => setForm({ ...form, whatsappPhoneDisplay: e.target.value })}
                className="w-full px-3 py-2 text-xs font-mono bg-white border border-stone-200 rounded-md"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-stone-700 mb-1">
                Chave PIX Oficial (Recebimento Automático)
              </label>
              <input
                type="text"
                value={form.pixKey}
                onChange={(e) => setForm({ ...form, pixKey: e.target.value })}
                className="w-full px-3 py-2 text-xs font-mono bg-white border border-stone-200 rounded-md"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-stone-700 mb-1">
                  Taxa de Entrega (R$)
                </label>
                <input
                  type="number"
                  min="0"
                  step="0.5"
                  value={form.deliveryFee}
                  onChange={(e) => {
                    const val = Number(e.target.value);
                    setForm({ ...form, deliveryFee: Number.isFinite(val) ? val : 0 });
                  }}
                  className="w-full px-3 py-2 text-xs font-mono bg-white border border-stone-200 rounded-md"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-stone-700 mb-1">
                  Prazo Médio (min)
                </label>
                <input
                  type="number"
                  min="1"
                  value={form.averagePrepMinutes}
                  onChange={(e) => {
                    const val = Number(e.target.value);
                    setForm({ ...form, averagePrepMinutes: Number.isFinite(val) ? val : 35 });
                  }}
                  className="w-full px-3 py-2 text-xs font-mono bg-white border border-stone-200 rounded-md"
                />
              </div>
            </div>
          </div>
        </div>

        {/* Som de Confirmação de Pagamento */}
        <div className="bg-[#FFFDF9]/95 border border-stone-200 rounded-lg p-5 space-y-4">
          <div className="flex items-center justify-between gap-2 border-b border-stone-100 pb-2">
            <div className="flex items-center gap-2">
              <Bell className="w-4 h-4 text-amber-600" />
              <h2 className="text-sm font-semibold text-stone-900">
                Som ao Confirmar Pagamento
              </h2>
            </div>
            <button
              type="button"
              onClick={() => {
                unlockKitchenBellAudio();
                playPaymentSound(form.paymentSound ?? 'cozinha');
              }}
              className="flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium text-stone-700 bg-white border border-stone-200 rounded-md hover:bg-stone-50"
            >
              <Volume2 className="w-3.5 h-3.5 text-emerald-700" />
              Ouvir Selecionado
            </button>
          </div>

          <p className="text-xs text-stone-600">
            Escolha qual toque sonoro será reproduzido na cozinha e no painel sempre que o pagamento de um cliente for aprovado. Clique em uma opção para ouvir e ativar na hora.
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {PAYMENT_SOUND_OPTIONS.map((opt) => {
              const selected = (form.paymentSound ?? 'cozinha') === opt.id;
              return (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => {
                    const nextSound = opt.id as PaymentSoundType;
                    setForm((prev) => ({ ...prev, paymentSound: nextSound }));
                    unlockKitchenBellAudio();
                    playPaymentSound(nextSound);
                    void onSaveSettings({ paymentSound: nextSound });
                  }}
                  className={`text-left p-3 rounded-lg border transition-colors flex items-start justify-between gap-3 ${
                    selected
                      ? 'bg-orange-50/80 border-orange-600 ring-1 ring-orange-600/20'
                      : 'bg-white border-stone-200 hover:border-stone-300 hover:bg-stone-50/60'
                  }`}
                >
                  <div className="space-y-0.5 min-w-0">
                    <div className="text-xs font-semibold text-stone-900">{opt.label}</div>
                    <div className="text-[11px] text-stone-500">{opt.description}</div>
                  </div>
                  <span
                    className={`w-5 h-5 rounded-full flex items-center justify-center shrink-0 mt-0.5 ${
                      selected
                        ? 'bg-orange-700 text-white'
                        : 'bg-stone-100 text-stone-500'
                    }`}
                  >
                    {selected ? (
                      <Check className="w-3 h-3" />
                    ) : (
                      <Volume2 className="w-3 h-3" />
                    )}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Backup no Telegram & Dados */}
        <div className="bg-[#FFFDF9]/95 border border-stone-200 rounded-lg p-5 space-y-4">
          <div className="flex items-center justify-between gap-2 border-b border-stone-100 pb-2">
            <div className="flex items-center gap-2">
              <Send className="w-4 h-4 text-sky-700" />
              <h2 className="text-sm font-semibold text-stone-900">
                Backup no Telegram & Exportação de Dados
              </h2>
            </div>
            {snapshot.settings.lastTelegramBackupAt && (
              <span className="text-[11px] font-mono text-stone-500 tabular-nums">
                Último envio: {formatTime(snapshot.settings.lastTelegramBackupAt)}
              </span>
            )}
          </div>

          <p className="text-xs text-stone-600 leading-relaxed">
            Envie uma cópia completa dos pedidos, clientes, conversas, cardápio e faturamento do dia diretamente para o seu Telegram em formato <span className="font-mono">.json</span>.
            <br />
            <span className="text-stone-500">
              Passo rápido: 1) Crie um bot no <span className="font-mono font-medium text-stone-700">@BotFather</span> e cole o Token abaixo · 2) Envie <span className="font-mono font-medium text-stone-700">/start</span> para o seu bot (ou adicione-o ao seu grupo) · 3) Pegue o Chat ID no <span className="font-mono font-medium text-stone-700">@userinfobot</span>.
            </span>
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-stone-700 mb-1">
                Bot Token do Telegram (@BotFather)
              </label>
              <div className="relative">
                <input
                  type={showBotToken ? 'text' : 'password'}
                  value={form.telegramBotToken}
                  onChange={(e) => setForm({ ...form, telegramBotToken: e.target.value })}
                  placeholder="Ex: 7123456789:AAH..."
                  className="w-full pr-9 pl-3 py-2 text-xs font-mono bg-white border border-stone-200 rounded-md"
                />
                <button
                  type="button"
                  onClick={() => setShowBotToken((v) => !v)}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-stone-400 hover:text-stone-700"
                  aria-label={showBotToken ? 'Ocultar token' : 'Mostrar token'}
                >
                  {showBotToken ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                </button>
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-stone-700 mb-1">
                Chat ID / Grupo de Destino
              </label>
              <input
                type="text"
                value={form.telegramChatId}
                onChange={(e) => setForm({ ...form, telegramChatId: e.target.value })}
                placeholder="Ex: 123456789 ou -1001234567890"
                className="w-full px-3 py-2 text-xs font-mono bg-white border border-stone-200 rounded-md"
              />
            </div>
          </div>

          <label className="flex items-center gap-2.5 text-xs text-stone-700 cursor-pointer">
            <input
              type="checkbox"
              checked={form.telegramAutoBackupOnPayment}
              onChange={(e) =>
                setForm({ ...form, telegramAutoBackupOnPayment: e.target.checked })
              }
              className="rounded border-stone-300 text-emerald-700 focus:ring-emerald-600"
            />
            <span>
              Enviar backup automático para o Telegram sempre que um pagamento for confirmado
            </span>
          </label>

          <div className="flex flex-wrap items-center gap-2.5 pt-1">
            <button
              type="button"
              disabled={sendingTelegram}
              onClick={handleSendTelegramNow}
              className="flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold bg-sky-700 text-white rounded-lg hover:bg-sky-800 disabled:opacity-60 transition-colors"
            >
              {sendingTelegram ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Send className="w-3.5 h-3.5" />
              )}
              {sendingTelegram ? 'Enviando ao Telegram...' : 'Enviar Backup para Telegram Agora'}
            </button>

            <a
              href="/api/backup/export"
              download
              className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-stone-800 bg-white border border-stone-300 rounded-lg hover:bg-stone-50 transition-colors"
            >
              <Download className="w-3.5 h-3.5" />
              Baixar Backup (.json)
            </a>

            <button
              type="button"
              onClick={() => restoreInputRef.current?.click()}
              className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-stone-800 bg-white border border-stone-300 rounded-lg hover:bg-stone-50 transition-colors"
            >
              <Upload className="w-3.5 h-3.5" />
              Restaurar Backup (.json)
            </button>
            <input
              ref={restoreInputRef}
              type="file"
              accept=".json,application/json"
              onChange={handleSelectRestoreFile}
              className="hidden"
            />
          </div>

          {telegramFeedback && (
            <div className="p-2.5 text-xs text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-md">
              {telegramFeedback}
            </div>
          )}

          {telegramError && (
            <div className="p-2.5 text-xs text-red-800 bg-red-50 border border-red-200 rounded-md">
              {telegramError}
            </div>
          )}

          {!telegramFeedback && !telegramError && snapshot.settings.lastTelegramBackupStatus && (
            <div className="text-[11px] text-stone-500">
              Status do último envio: <span className="font-medium text-stone-700">{snapshot.settings.lastTelegramBackupStatus}</span>
            </div>
          )}

          {pendingRestore && (
            <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="text-xs text-amber-950">
                Restaurar <span className="font-mono font-semibold">{pendingRestore.filename}</span>? Isso substituirá os dados atuais por{' '}
                <span className="font-mono tabular-nums">{pendingRestore.data.orders.length}</span> pedidos e{' '}
                <span className="font-mono tabular-nums">{pendingRestore.data.customers.length}</span> clientes.
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => setPendingRestore(null)}
                  className="px-2.5 py-1.5 text-xs text-stone-700 hover:text-stone-900"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  disabled={restoring}
                  onClick={handleConfirmRestore}
                  className="px-3 py-1.5 text-xs font-semibold bg-amber-700 text-white rounded-md hover:bg-amber-800 disabled:opacity-60"
                >
                  {restoring ? 'Restaurando...' : 'Confirmar Restauração'}
                </button>
              </div>
            </div>
          )}

          {restoreFeedback && (
            <div className="p-2.5 text-xs text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-md">
              {restoreFeedback}
            </div>
          )}

          {restoreError && (
            <div className="p-2.5 text-xs text-red-800 bg-red-50 border border-red-200 rounded-md">
              {restoreError}
            </div>
          )}
        </div>

        <div className="bg-[#FFFDF9]/95 border border-stone-200 rounded-lg p-5 space-y-4">
          <h2 className="text-sm font-semibold text-stone-900 border-b border-stone-100 pb-2">
            Comportamento da Inteligência Artificial
          </h2>

          <div>
            <label className="block text-xs font-medium text-stone-700 mb-1">
              Tom de Voz e Instruções da IA
            </label>
            <textarea
              rows={3}
              value={form.aiPersonaTone}
              onChange={(e) => setForm({ ...form, aiPersonaTone: e.target.value })}
              className="w-full px-3 py-2 text-xs bg-white border border-stone-200 rounded-md"
            />
          </div>

          <label className="flex items-center gap-2.5 text-xs text-stone-700 cursor-pointer">
            <input
              type="checkbox"
              checked={form.autoNotifyOrderUpdates}
              onChange={(e) =>
                setForm({ ...form, autoNotifyOrderUpdates: e.target.checked })
              }
              className="rounded border-stone-300 text-emerald-700 focus:ring-emerald-600"
            />
            <span>
              Enviar notificações automáticas de rastreio no chat do WhatsApp a cada avanço da cozinha
            </span>
          </label>
        </div>

        <div className="bg-[#FFFDF9]/95 border border-stone-200 rounded-lg p-5 space-y-4">
          <div className="flex items-center gap-2 border-b border-stone-100 pb-2">
            <Webhook className="w-4 h-4 text-emerald-700" />
            <h2 className="text-sm font-semibold text-stone-900">
              Endpoint Meta WhatsApp Business Cloud API
            </h2>
          </div>

          <p className="text-xs text-stone-600">
            Aponte o Webhook do seu aplicativo Meta WhatsApp Business para a URL abaixo para receber e responder mensagens reais de clientes automaticamente.
          </p>

          <div>
            <label className="block text-xs font-medium text-stone-700 mb-1">
              Callback URL do Webhook
            </label>
            <div className="flex items-center gap-2">
              <input
                type="text"
                readOnly
                value={webhookUrl}
                className="flex-1 px-3 py-2 text-xs font-mono bg-stone-50 border border-stone-200 rounded-md text-stone-700"
              />
              <button
                type="button"
                onClick={copyWebhook}
                className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium bg-white border border-stone-200 rounded-md hover:bg-stone-50"
              >
                {copiedWebhook ? (
                  <Check className="w-3.5 h-3.5 text-emerald-700" />
                ) : (
                  <Copy className="w-3.5 h-3.5" />
                )}
                {copiedWebhook ? 'Copiado' : 'Copiar'}
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-stone-700 mb-1">
                Verify Token (hub.verify_token)
              </label>
              <input
                type="text"
                value={form.whatsappVerifyToken}
                onChange={(e) => setForm({ ...form, whatsappVerifyToken: e.target.value })}
                className="w-full px-3 py-2 text-xs font-mono bg-white border border-stone-200 rounded-md"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-stone-700 mb-1">
                Phone Number ID
              </label>
              <input
                type="text"
                value={form.whatsappPhoneNumberId}
                onChange={(e) => setForm({ ...form, whatsappPhoneNumberId: e.target.value })}
                className="w-full px-3 py-2 text-xs font-mono bg-white border border-stone-200 rounded-md"
              />
            </div>
          </div>
        </div>

        <div className="flex items-center justify-end gap-3">
          {saveError && (
            <span className="text-xs font-medium text-red-700">{saveError}</span>
          )}
          {savedFeedback && (
            <span className="text-xs font-medium text-emerald-700">
              Configurações salvas com sucesso.
            </span>
          )}
          <button
            type="submit"
            disabled={saving}
            className="flex items-center gap-1.5 px-4 py-2 text-xs font-semibold bg-emerald-700 text-white rounded-lg hover:bg-emerald-800 disabled:opacity-60 transition-colors"
          >
            <Save className="w-4 h-4" />
            {saving ? 'Salvando...' : 'Salvar Configurações'}
          </button>
        </div>
      </form>
    </div>
  );
};

