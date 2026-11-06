import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { useFetch } from '../../hooks/useFetch.js';
import { moneyApi } from '../../api/m2a.money.api.js';
import { Card } from '../../components/ui/Card.jsx';
import { Alert } from '../../components/ui/Layout.jsx';
import { Button, ButtonLink } from '../../components/ui/Button.jsx';
import { Icon } from '../../components/ui/Icon.jsx';
import { LoadingState, ErrorState } from '../../components/ui/States.jsx';
import { formatTaka, formatDateTime } from '../../components/ui/format.js';

const VIEW = {
  paid: { icon: 'check', tone: 'bg-success-soft text-success', title: 'Payment received' },
  failed: { icon: 'alert', tone: 'bg-danger-soft text-danger', title: 'Payment failed' },
  cancelled: { icon: 'ban', tone: 'bg-paper text-muted', title: 'Payment cancelled' },
  initiated: { icon: 'clock', tone: 'bg-warning-soft text-warning', title: 'Waiting for confirmation' },
};

// Shared sandbox checkout: where the gateway sends the browser back to after paying.
export function PaymentResultPage() {
  const { tranId } = useParams();
  const { data, loading, error, reload, setData } = useFetch(`/payments/${encodeURIComponent(tranId)}`);
  const [checking, setChecking] = useState(false);
  const [checkError, setCheckError] = useState(null);

  async function checkStatus() {
    setChecking(true);
    setCheckError(null);
    try {
      setData(await moneyApi.verifyPayment(tranId));
    } catch (err) {
      setCheckError(err.message);
    } finally {
      setChecking(false);
    }
  }

  if (loading && !data) return <LoadingState label="Checking your payment…" />;
  if (error) return <ErrorState error={error} onRetry={reload} />;
  const p = data.payment;
  const view = VIEW[p.status];

  return (
    <div className="mx-auto max-w-lg">
      <Card className="text-center">
        <div className={`mx-auto mb-4 grid h-16 w-16 place-items-center rounded-full ${view.tone}`}><Icon name={view.icon} size={30} /></div>
        <h1 className="text-2xl font-semibold">{view.title}</h1>
        <p className="mt-1 text-sm text-muted">{p.description}</p>
        <p className="mt-4 font-display text-3xl font-semibold">{formatTaka(p.amount)}</p>
        <dl className="mt-5 space-y-1 text-left text-sm">
          <div className="flex justify-between"><dt className="text-muted">Transaction</dt><dd className="font-mono text-xs">{p.tranId}</dd></div>
          {p.cardType && <div className="flex justify-between"><dt className="text-muted">Paid with</dt><dd>{p.cardType}</dd></div>}
          {p.verifiedAt && <div className="flex justify-between"><dt className="text-muted">Verified by our server</dt><dd>{formatDateTime(p.verifiedAt)}</dd></div>}
        </dl>
        {p.status === 'failed' && p.error && <div className="mt-4 text-left"><Alert tone="danger">{p.error}</Alert></div>}
        {p.status === 'initiated' && (
          <div className="mt-4 text-left">
            <Alert tone="warning">If you completed the payment, ask the gateway for its status.</Alert>
            <Button className="mt-3 w-full" icon="refresh" loading={checking} onClick={checkStatus}>Check status</Button>
          </div>
        )}
        {checkError && <div className="mt-3 text-left"><Alert tone="danger">{checkError}</Alert></div>}
        <ButtonLink to={p.returnTo || '/'} variant="secondary" className="mt-6 w-full">Back</ButtonLink>
        <p className="mt-4 text-xs text-muted">Sandbox payment: no real money was moved.</p>
      </Card>
    </div>
  );
}
