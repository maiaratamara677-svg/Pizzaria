import 'dotenv/config';
import express from 'express';
import path from 'node:path';
import { createServer as createViteServer } from 'vite';
import { store, registerSseClient } from './src/server/store.ts';
import { generateWhatsAppAiReply } from './src/server/ai.ts';
import { sendTelegramBackup, TelegramConfigError } from './src/server/telegram.ts';
import { startBackupScheduler, checkScheduledBackupDue } from './src/server/backupScheduler.ts';
import type { OrderStage } from './src/types.ts';

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json({ limit: '6mb' }));
  app.use(
    '/src/assets/images',
    express.static(path.resolve(process.cwd(), 'src/assets/images'))
  );

  // Healthcheck
  app.get('/api/health', (_req, res) => {
    res.json({ ok: true });
  });

  // Real-time Server-Sent Events stream
  app.get('/api/events', (req, res) => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

    registerSseClient(res);
    res.write(`event: snapshot_update\ndata: ${JSON.stringify(store.getSnapshot())}\n\n`);

    const keepAlive = setInterval(() => {
      res.write(': ping\n\n');
    }, 25_000);

    req.on('close', () => {
      clearInterval(keepAlive);
    });
  });

  // Full snapshot
  app.get('/api/snapshot', (_req, res) => {
    res.json(store.getSnapshot());
  });

  // Create new WhatsApp customer conversation (for simulating new contacts)
  app.post('/api/conversations', async (req, res) => {
    const { phone, name, firstMessage } = req.body as {
      phone?: string;
      name?: string;
      firstMessage?: string;
    };
    if (!phone || !phone.trim()) {
      res.status(400).json({ error: 'Número de WhatsApp é obrigatório.' });
      return;
    }
    const created = store.createConversation({ phone, name });

    if (firstMessage && firstMessage.trim()) {
      store.addMessage({
        conversationId: created.conversation.id,
        sender: 'customer',
        text: firstMessage.trim(),
        status: 'read',
      });
      if (created.conversation.aiEnabled) {
        try {
          const aiResult = await generateWhatsAppAiReply(created.conversation.id);
          store.addMessage({
            conversationId: created.conversation.id,
            sender: 'ai',
            text: aiResult.replyText,
            status: 'read',
            attachment: aiResult.attachment,
            aiActionLabel:
              aiResult.actionLabels.length > 0 ? aiResult.actionLabels.join(' · ') : undefined,
          });
        } catch (err) {
          const message =
            err instanceof Error ? err.message : 'Erro ao processar resposta automática da IA.';
          res.status(500).json({
            error: message,
            ...created,
            snapshot: store.getSnapshot(),
          });
          return;
        }
      }
    }

    res.json({ ...created, snapshot: store.getSnapshot() });
  });

  // Update conversation flags (AI toggle, read status, handoff)
  app.patch('/api/conversations/:id', (req, res) => {
    const updated = store.updateConversation(req.params.id, req.body);
    if (!updated) {
      res.status(404).json({ error: 'Conversa não encontrada.' });
      return;
    }
    res.json(updated);
  });

  // Send message (as customer -> invokes Gemini AI if aiEnabled, or as human agent)
  app.post('/api/conversations/:id/messages', async (req, res) => {
    const conversationId = req.params.id;
    const { sender, text } = req.body as { sender?: 'customer' | 'agent'; text?: string };

    if (!text || !text.trim()) {
      res.status(400).json({ error: 'Mensagem vazia.' });
      return;
    }

    const ctx = store.getConversationContext(conversationId);
    if (!ctx) {
      res.status(404).json({ error: 'Conversa não encontrada.' });
      return;
    }

    const msgSender = sender === 'agent' ? 'agent' : 'customer';
    const userMsg = store.addMessage({
      conversationId,
      sender: msgSender,
      text: text.trim(),
      status: 'read',
    });

    if (msgSender === 'customer' && ctx.conversation.aiEnabled) {
      try {
        const aiResult = await generateWhatsAppAiReply(conversationId);
        const aiMsg = store.addMessage({
          conversationId,
          sender: 'ai',
          text: aiResult.replyText,
          status: 'read',
          attachment: aiResult.attachment,
          aiActionLabel:
            aiResult.actionLabels.length > 0 ? aiResult.actionLabels.join(' · ') : undefined,
        });
        res.json({ userMsg, aiMsg, snapshot: store.getSnapshot() });
        return;
      } catch (err) {
        const message =
          err instanceof Error ? err.message : 'Erro ao processar resposta automática da IA.';
        res.status(500).json({
          error: message,
          userMsg,
          snapshot: store.getSnapshot(),
        });
        return;
      }
    }

    res.json({ userMsg, snapshot: store.getSnapshot() });
  });

  // Trigger AI reply for an existing customer message without duplicating it
  app.post('/api/conversations/:id/retry-ai', async (req, res) => {
    const conversationId = req.params.id;
    const ctx = store.getConversationContext(conversationId);
    if (!ctx) {
      res.status(404).json({ error: 'Conversa não encontrada.' });
      return;
    }
    try {
      const aiResult = await generateWhatsAppAiReply(conversationId);
      const aiMsg = store.addMessage({
        conversationId,
        sender: 'ai',
        text: aiResult.replyText,
        status: 'read',
        attachment: aiResult.attachment,
        aiActionLabel:
          aiResult.actionLabels.length > 0 ? aiResult.actionLabels.join(' · ') : undefined,
      });
      res.json({ aiMsg, snapshot: store.getSnapshot() });
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Erro ao processar resposta automática da IA.';
      res.status(500).json({ error: message, snapshot: store.getSnapshot() });
    }
  });

  // Update customer record manually
  app.patch('/api/customers/:id', (req, res) => {
    const updated = store.upsertCustomerFields(req.params.id, req.body);
    if (!updated) {
      res.status(404).json({ error: 'Cliente não encontrado.' });
      return;
    }
    res.json(updated);
  });

  // Confirm PIX / Card payment (simulates payment gateway webhook settlement)
  app.post('/api/orders/:id/pay', (req, res) => {
    const order = store.confirmOrderPayment(req.params.id);
    if (!order) {
      res.status(404).json({ error: 'Pedido não encontrado.' });
      return;
    }

    const currentSnapshot = store.getSnapshot();
    const { telegramAutoBackupOnPayment, telegramBotToken, telegramChatId } =
      currentSnapshot.settings;
    if (
      telegramAutoBackupOnPayment &&
      (telegramBotToken?.trim() || process.env.TELEGRAM_BOT_TOKEN) &&
      (telegramChatId?.trim() || process.env.TELEGRAM_CHAT_ID)
    ) {
      void sendTelegramBackup(currentSnapshot, `Pagamento confirmado ${order.code}`)
        .then((result) => {
          store.recordTelegramBackupResult(
            `Automático (${order.code}): ${result.summary}`,
            result.sentAt
          );
        })
        .catch((err) => {
          const msg = err instanceof Error ? err.message : 'Erro desconhecido';
          store.recordTelegramBackupResult(`Falha no envio automático: ${msg}`);
        });
    }

    res.json({ order, snapshot: currentSnapshot });
  });

  // Advance order kitchen / delivery stage and trigger live chat tracking notification
  app.post('/api/orders/:id/advance', (req, res) => {
    const { stage } = (req.body ?? {}) as { stage?: OrderStage };
    const order = store.advanceOrderStage(req.params.id, stage);
    if (!order) {
      res.status(404).json({ error: 'Pedido não encontrado.' });
      return;
    }
    res.json({ order, snapshot: store.getSnapshot() });
  });

  // Menu management
  app.patch('/api/menu/:id', (req, res) => {
    const updated = store.updateMenuItem(req.params.id, req.body);
    if (!updated) {
      res.status(404).json({ error: 'Item do cardápio não encontrado.' });
      return;
    }
    res.json(updated);
  });

  app.post('/api/menu', (req, res) => {
    try {
      const created = store.addMenuItem(req.body);
      res.json(created);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Dados inválidos para o cardápio.';
      res.status(400).json({ error: message });
    }
  });

  // Settings
  app.patch('/api/settings', (req, res) => {
    const updated = store.updateSettings(req.body);
    res.json(updated);
  });

  // Backup: Download local JSON snapshot
  app.get('/api/backup/export', (_req, res) => {
    const snapshot = store.getSnapshot();
    const dateStamp = new Date().toISOString().slice(0, 10);
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="fornodesk-backup-${dateStamp}.json"`
    );
    res.send(JSON.stringify(snapshot, null, 2));
  });

  // Backup: Restore from JSON snapshot
  app.post('/api/backup/restore', (req, res) => {
    try {
      const payload =
        req.body && typeof req.body === 'object' && 'snapshot' in req.body
          ? (req.body as { snapshot: unknown }).snapshot
          : req.body;
      const restored = store.restoreSnapshot(payload);
      res.json({ ok: true, snapshot: restored });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Erro ao restaurar backup.';
      res.status(400).json({ error: message });
    }
  });

  // Backup: Send full snapshot + daily summary directly to Telegram
  app.post('/api/backup/telegram', async (req, res) => {
    try {
      const body = (req.body ?? {}) as {
        telegramBotToken?: string;
        telegramChatId?: string;
        telegramAutoBackupOnPayment?: boolean;
      };
      const settingsPatch: Record<string, unknown> = {};
      if (typeof body.telegramBotToken === 'string') {
        settingsPatch.telegramBotToken = body.telegramBotToken.trim();
      }
      if (typeof body.telegramChatId === 'string') {
        settingsPatch.telegramChatId = body.telegramChatId.trim();
      }
      if (typeof body.telegramAutoBackupOnPayment === 'boolean') {
        settingsPatch.telegramAutoBackupOnPayment = body.telegramAutoBackupOnPayment;
      }
      if (Object.keys(settingsPatch).length > 0) {
        store.updateSettings(settingsPatch);
      }

      const result = await sendTelegramBackup(store.getSnapshot(), 'Backup manual');
      store.recordTelegramBackupResult(result.summary, result.sentAt);
      res.json({
        ok: true,
        sentAt: result.sentAt,
        filename: result.filename,
        summary: result.summary,
        snapshot: store.getSnapshot(),
      });
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Não foi possível enviar o backup ao Telegram.';
      store.recordTelegramBackupResult(`Falha no envio: ${message}`);
      const status = err instanceof TelegramConfigError ? 400 : 502;
      res.status(status).json({ error: message, snapshot: store.getSnapshot() });
    }
  });

  // Real Meta WhatsApp Cloud API Webhook (Verification + Inbound Messages)
  app.get('/api/webhook/whatsapp', (req, res) => {
    const mode = req.query['hub.mode'];
    const token = req.query['hub.verify_token'];
    const challenge = req.query['hub.challenge'];
    const verifyToken = store.getSnapshot().settings.whatsappVerifyToken;

    if (mode === 'subscribe' && token === verifyToken) {
      res.status(200).send(challenge);
      return;
    }
    res.sendStatus(403);
  });

  app.post('/api/webhook/whatsapp', async (req, res) => {
    try {
      const entry = req.body?.entry?.[0];
      const change = entry?.changes?.[0]?.value;
      const incoming = change?.messages?.[0];
      const contactName = change?.contacts?.[0]?.profile?.name;

      if (incoming && incoming.from && incoming.text?.body) {
        const phone = incoming.from.startsWith('+') ? incoming.from : `+${incoming.from}`;
        const { conversation } = store.createConversation({ phone, name: contactName });
        store.addMessage({
          conversationId: conversation.id,
          sender: 'customer',
          text: incoming.text.body,
          status: 'read',
        });
        if (conversation.aiEnabled) {
          const aiResult = await generateWhatsAppAiReply(conversation.id);
          store.addMessage({
            conversationId: conversation.id,
            sender: 'ai',
            text: aiResult.replyText,
            status: 'read',
            attachment: aiResult.attachment,
            aiActionLabel:
              aiResult.actionLabels.length > 0 ? aiResult.actionLabels.join(' · ') : undefined,
          });
        }
      }
      res.sendStatus(200);
    } catch (err) {
      console.error('Webhook WhatsApp error:', err);
      res.sendStatus(200);
    }
  });

  // Vite middleware in dev, static serving in production
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`FornoDesk server listening on http://0.0.0.0:${PORT}`);
    startBackupScheduler();
    void checkScheduledBackupDue().catch(() => {});
  });
}

startServer();
