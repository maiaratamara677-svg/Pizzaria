import test from 'node:test';
import assert from 'node:assert/strict';
import { canUseTenantApp, paymentMatchesTransaction, type BillingTransaction, type VerifiedPaymentEvent } from './contracts.ts';

const transaction: BillingTransaction = {
  id: 't1', tenantId: 'pizzaria-a', purpose: 'platform_subscription',
  provider: 'asaas', providerTransactionId: 'provider-1',
  amountCents: 14990, currency: 'BRL', status: 'pending', subscriptionId: 's1'
};
const event: VerifiedPaymentEvent = {
  provider: 'asaas', providerEventId: 'event-1',
  providerTransactionId: 'provider-1', amountCents: 14990,
  currency: 'BRL', status: 'paid'
};
test('aceita apenas confirmação conciliada', () => {
  assert.equal(paymentMatchesTransaction(event, transaction), true);
  assert.equal(paymentMatchesTransaction({...event, amountCents: 1}, transaction), false);
  assert.equal(paymentMatchesTransaction({...event, provider: 'efi'}, transaction), false);
  assert.equal(paymentMatchesTransaction({...event, providerTransactionId: 'outro'}, transaction), false);
  assert.equal(paymentMatchesTransaction({...event, status: 'pending'}, transaction), false);
  assert.equal(paymentMatchesTransaction(event, {...transaction, status: 'paid'}), false);
});
test('acesso depende do prazo e status', () => {
  const base = {id:'s1', tenantId:'pizzaria-a',planId:'basic',status:'active' as const,currentPeriodEnd:'2026-12-01T00:00:00Z',graceUntil:null};
  assert.equal(canUseTenantApp(base,new Date('2026-11-20T00:00:00Z')),true);
  assert.equal(canUseTenantApp(base,new Date('2026-12-02T00:00:00Z')),false);
  assert.equal(canUseTenantApp({...base,status:'suspended'},new Date('2026-11-20T00:00:00Z')),false);
  assert.equal(canUseTenantApp({...base,status:'past_due',graceUntil:'2026-11-25T00:00:00Z'},new Date('2026-11-24T00:00:00Z')),true);
});
