// SSLCOMMERZ sandbox (Bangladeshi payment gateway, test mode: no real money).
// Two API calls are all we need:
//   1. initSession()  -> the gateway page URL the browser is sent to
//   2. validate()     -> after paying, our SERVER asks the gateway if the payment is genuine
// Plus queryByTranId(): "what happened to this transaction?", used by the "check status" button.
import { env } from '../config/env.js';
import { httpError } from '../utils/httpError.js';

const BASE = 'https://sandbox.sslcommerz.com';
const TIMEOUT_MS = 15000;

export function isConfigured() {
  return Boolean(env.sslcommerz.storeId && env.sslcommerz.storePassword);
}

function assertConfigured() {
  if (!isConfigured()) {
    throw httpError(503, 'Online payment is not configured on this server. Record the payment manually instead.');
  }
}

// Every network call: a timeout, and a clear 502 error the UI can show with a fallback.
async function callGateway(url, options = {}) {
  let response;
  try {
    response = await fetch(url, { ...options, signal: AbortSignal.timeout(TIMEOUT_MS) });
  } catch (err) {
    console.error('SSLCOMMERZ unreachable:', err.message);
    throw httpError(502, 'The payment gateway is not responding. Try again later, or record the payment manually.');
  }
  const data = await response.json().catch(() => null);
  if (!response.ok || !data) throw httpError(502, `The payment gateway answered with an error (${response.status}).`);
  return data;
}

// 1) Start a payment session. Returns the URL of SSLCOMMERZ's payment page.
export async function initSession({ tranId, amount, productName, customer }) {
  assertConfigured();
  const callback = (kind) => `${env.serverPublicUrl}/api/payments/sslcommerz/${kind}`;
  const form = new URLSearchParams({
    store_id: env.sslcommerz.storeId,
    store_passwd: env.sslcommerz.storePassword,
    total_amount: amount.toFixed(2),
    currency: 'BDT',
    tran_id: tranId,
    success_url: callback('success'),
    fail_url: callback('fail'),
    cancel_url: callback('cancel'),
    ipn_url: callback('ipn'),
    product_name: productName,
    product_category: 'event',
    product_profile: 'general',
    shipping_method: 'NO',
    num_of_item: '1',
    cus_name: customer.name,
    cus_email: customer.email,
    cus_phone: customer.phone || '01700000000',
    cus_add1: customer.address || 'Dhaka',
    cus_city: customer.city || 'Dhaka',
    cus_country: 'Bangladesh',
  });

  const data = await callGateway(`${BASE}/gwprocess/v4/api.php`, { method: 'POST', body: form });
  if (data.status !== 'SUCCESS' || !data.GatewayPageURL) {
    throw httpError(502, `The payment gateway refused to start the payment: ${data.failedreason || 'unknown reason'}`);
  }
  return data.GatewayPageURL;
}

// 2) Ask the gateway whether a payment (identified by val_id from the callback) is genuine.
// Answer includes status ('VALID', 'VALIDATED' = already checked before, or 'INVALID_TRANSACTION'),
// tran_id, amount and currency, which we compare with our own record.
export function validate(valId) {
  assertConfigured();
  const params = new URLSearchParams({
    val_id: valId,
    store_id: env.sslcommerz.storeId,
    store_passwd: env.sslcommerz.storePassword,
    format: 'json',
  });
  return callGateway(`${BASE}/validator/api/validationserverAPI.php?${params}`);
}

// 3) Look a transaction up by OUR tran_id (when the browser never came back to the success URL).
// Returns the gateway's record of a successful payment, or null.
export async function queryByTranId(tranId) {
  assertConfigured();
  const params = new URLSearchParams({
    tran_id: tranId,
    store_id: env.sslcommerz.storeId,
    store_passwd: env.sslcommerz.storePassword,
    format: 'json',
  });
  const data = await callGateway(`${BASE}/validator/api/merchantTransIDvalidationAPI.php?${params}`);
  const elements = Array.isArray(data.element) ? data.element : [];
  return elements.find((e) => ['VALID', 'VALIDATED'].includes(e.status)) || null;
}
