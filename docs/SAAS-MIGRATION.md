# Migração SaaS — planejamento seguro

Esta branch é isolada da main. **Ainda não está pronta para produção.**

## Diagnóstico inicial
- React + Vite + Express + Gemini, com modelos de pedidos, conversas e canais iFood/99Food.
- O snapshot atual é compartilhado: antes de comercializar, migrar para banco persistente com tenant_id em todas as entidades.
- Rota POST /api/orders/:id/pay atualmente confirma pagamento simulado: não expor a usuários finais sem autorização.
- Integrações com marketplaces exigem credenciais, validação de assinatura e homologação.

## Ordem de implementação
1. Banco PostgreSQL/Supabase com tenants, memberships, roles, subscriptions, invoices, payment_events, orders, conversations, messages e settings; RLS e índices por tenant.
2. Login seguro e autorização por tenant no servidor em **todas** as rotas, eventos SSE e backups. Não confiar em tenant_id enviado pelo cliente.
3. Isolar snapshot e dados legados por tenant, com migração e rollback testados.
4. Cobrança da plataforma separada dos pagamentos de pedidos. Credenciais de cada pizzaria criptografadas no servidor; nunca no navegador.
5. Adaptadores individuais para Mercado Pago, InfinitePay, Asaas, Efí, bancos Pix e AtivoPay após verificar documentação e habilitação.
6. Webhooks autenticados, idempotentes, reconciliados por valor/moeda/provedor/transação, com fila de reprocessamento e auditoria.
7. WhatsApp Cloud API com webhook validado, templates e regras de janela de atendimento; Gemini com limites de uso por tenant.
8. iFood/99Food: validar documentação oficial, credenciais e homologação; não usar payload simulado como integração real.
9. Testes de isolamento entre pizzarias, pagamento duplicado, fraude de webhook, expiração de assinatura, falhas de IA e reconciliação.
10. CI, ambiente de homologação e revisão antes de qualquer merge/deploy.

## Testes do módulo de contratos
Executar `npx tsx --test src/saas/contracts.test.ts`.
Os contratos e testes são **fundação inicial**, não integração operacional.
