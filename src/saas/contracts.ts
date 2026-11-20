/**
 * Contratos da futura plataforma SaaS.
 * Este módulo não ativa pagamentos nem substitui autenticação.
 * IDs de tenant devem vir de sessão autenticada no servidor, nunca do corpo da requisição.
 */
export type PaymentProvider = 'mercado_pago' | 'infinitepay' | 'asaas' | 'efi' | 'ativopay' | 'bank_pix';
export type SubscriptionStatus = 'trialing' | 'pending' | 'active' | 'past_due' | 'suspended' | 'canceled';
export type PaymentPurpose = 'platform_subscription' | 'restaurant_order';
export type BillingStatus = 'pending' | 'paid' | 'failed' | 'refunded' | 'expired';

export interface Tenant {
  id: string;
  legalName: string;
  displayName: string;
  createdAt: string;
  status: 'active' | 'suspended';
}
export interface Subscription {
  id: string;
  tenantId: string;
  planId: string;
  status: SubscriptionStatus;
  currentPeriodEnd: string | null;
  graceUntil: string | null;
}
export interface BillingTransaction {
  id: string;
  tenantId: string;
  purpose: PaymentPurpose;
  provider: PaymentProvider;
  providerTransactionId: string | null;
  amountCents: number;
  currency: 'BRL';
  status: BillingStatus;
  orderId?: string;
  subscriptionId?: string;
}
export interface VerifiedPaymentEvent {
  provider: PaymentProvider;
  providerEventId: string;
  providerTransactionId: string;
  status: BillingStatus;
  amountCents: number;
  currency: 'BRL';
}
/** Use após autenticar assinatura do webhook e consultar o pagamento no provedor. */
export function paymentMatchesTransaction(
  event: VerifiedPaymentEvent,
  transaction: BillingTransaction
): boolean {
  return event.status === 'paid'
    && transaction.status === 'pending'
    && event.provider === transaction.provider
    && event.providerTransactionId === transaction.providerTransactionId
    && event.currency === transaction.currency
    && Number.isSafeInteger(event.amountCents)
    && event.amountCents > 0
    && event.amountCents === transaction.amountCents;
}
/** A autorização real também exige associação usuário/tenant no banco. */
export function canUseTenantApp(subscription: Subscription, now: Date): boolean {
  if (Number.isNaN(now.getTime())) return false;
  if (subscription.status === 'active' || subscription.status === 'trialing') {
    return subscription.currentPeriodEnd !== null
      && Number.isFinite(Date.parse(subscription.currentPeriodEnd))
      && now.getTime() <= Date.parse(subscription.currentPeriodEnd);
  }
  if (subscription.status === 'past_due' && subscription.graceUntil) {
    const deadline = Date.parse(subscription.graceUntil);
    return Number.isFinite(deadline) && now.getTime() <= deadline;
  }
  return false;
}
