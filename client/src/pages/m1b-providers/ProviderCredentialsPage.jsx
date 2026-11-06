import { useRef, useState } from 'react';
import { useFetch } from '../../hooks/useFetch.js';
import { useMeta } from '../../hooks/useMeta.js';
import { fieldErrors, openFile } from '../../api/client.js';
import { providersApi } from '../../api/m1b.providers.api.js';
import { PageHeader, Alert } from '../../components/ui/Layout.jsx';
import { Card, CardHeader } from '../../components/ui/Card.jsx';
import { Input, Select } from '../../components/ui/Field.jsx';
import { Button, ButtonLink } from '../../components/ui/Button.jsx';
import { Badge } from '../../components/ui/Badge.jsx';
import { Icon } from '../../components/ui/Icon.jsx';
import { LoadingState, ErrorState, EmptyState } from '../../components/ui/States.jsx';
import { formatDate } from '../../components/ui/format.js';
import { BookabilityPanel } from './BookabilityPanel.jsx';
import { credentialState } from './credentialStatus.js';

// M1-B: upload business documents; an admin reviews them before bookings are allowed.
export function ProviderCredentialsPage() {
  const me = useFetch('/providers/me');
  const list = useFetch('/providers/me/credentials');
  const meta = useMeta();
  const reloadAll = () => {
    me.reload();
    list.reload();
  };

  const provider = me.data?.provider;
  const credentials = list.data?.credentials || [];

  return (
    <div>
      <PageHeader
        eyebrow="My business"
        title="Credentials"
        subtitle="Upload your trade licence and certificates. An administrator checks each document before you can accept bookings."
      />
      {(me.loading || list.loading || !meta) && <LoadingState />}
      {(me.error || list.error) && <ErrorState error={me.error || list.error} onRetry={reloadAll} />}
      {me.data && !provider && (
        <Card>
          <EmptyState icon="store" title="Create your business profile first" action={<ButtonLink to="/provider/profile">Create profile</ButtonLink>} />
        </Card>
      )}

      {provider && meta && list.data && (
        <div className="space-y-6">
          <BookabilityPanel bookability={me.data.bookability} own />
          <div className="grid gap-6 lg:grid-cols-2">
            <RequiredChecklist provider={provider} credentials={credentials} meta={meta} />
            <UploadForm meta={meta} onUploaded={reloadAll} />
          </div>
          <History credentials={credentials} meta={meta} />
        </div>
      )}
    </div>
  );
}

// One row per document the provider's category needs, showing its newest upload.
function RequiredChecklist({ provider, credentials, meta }) {
  return (
    <Card>
      <CardHeader title="Required for your category" subtitle={meta.providerCategoryLabels[provider.category]} />
      <ul className="space-y-3">
        {meta.requiredCredentials[provider.category].map((type) => {
          const latest = credentials.find((c) => c.type === type); // list is newest first
          const state = latest ? credentialState(latest) : { label: 'Not uploaded', tone: 'neutral' };
          return (
            <li key={type} className="flex items-center justify-between gap-3 rounded-xl border border-line px-4 py-3">
              <span className="text-sm font-medium">{meta.credentialLabels[type]}</span>
              <Badge tone={state.tone}>{state.label}</Badge>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}

function UploadForm({ meta, onUploaded }) {
  const fileInput = useRef(null);
  const [form, setForm] = useState({ type: '', number: '', issuedAt: '', expiresAt: '' });
  const [errors, setErrors] = useState({});
  const [message, setMessage] = useState(null);
  const [busy, setBusy] = useState(false);
  const update = (changes) => setForm((current) => ({ ...current, ...changes }));

  async function handleSubmit(e) {
    e.preventDefault();
    setErrors({});
    setMessage(null);
    const file = fileInput.current.files[0];
    if (!file) return setErrors({ file: 'Choose a file' });
    if (file.size > meta.upload.maxBytes) return setErrors({ file: 'File is larger than 1 MB' }); // checked again on the server

    // A file upload is sent as "multipart/form-data", not JSON.
    const formData = new FormData();
    formData.append('type', form.type);
    formData.append('number', form.number);
    if (form.issuedAt) formData.append('issuedAt', form.issuedAt);
    formData.append('expiresAt', form.expiresAt);
    formData.append('file', file);

    setBusy(true);
    try {
      await providersApi.uploadCredential(formData);
      setForm({ type: '', number: '', issuedAt: '', expiresAt: '' });
      fileInput.current.value = '';
      setMessage({ tone: 'success', text: 'Uploaded. An administrator will review it.' });
      onUploaded();
    } catch (err) {
      setErrors(fieldErrors(err));
      setMessage({ tone: 'danger', text: err.message });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardHeader title="Upload a document" subtitle="PDF, PNG or JPG, up to 1 MB." />
      <form onSubmit={handleSubmit} className="grid gap-4 sm:grid-cols-2">
        <Select
          label="Document type"
          required
          value={form.type}
          placeholder="Choose type"
          options={meta.credentialTypes.map((t) => ({ value: t, label: meta.credentialLabels[t] }))}
          onChange={(e) => update({ type: e.target.value })}
          error={errors.type}
        />
        <Input label="Number" required value={form.number} onChange={(e) => update({ number: e.target.value })} error={errors.number} />
        <Input label="Issue date" type="date" value={form.issuedAt} onChange={(e) => update({ issuedAt: e.target.value })} error={errors.issuedAt} />
        <Input label="Expiry date" type="date" required value={form.expiresAt} onChange={(e) => update({ expiresAt: e.target.value })} error={errors.expiresAt} />
        <div className="sm:col-span-2">
          <label className="mb-1.5 block text-sm font-medium" htmlFor="credential-file">File <span className="text-danger">*</span></label>
          <input
            id="credential-file"
            ref={fileInput}
            type="file"
            accept=".pdf,.png,.jpg,.jpeg"
            className="block w-full text-sm file:mr-3 file:rounded-lg file:border-0 file:bg-primary-soft file:px-3 file:py-2 file:font-semibold file:text-primary"
          />
          {errors.file && <p className="mt-1 text-xs font-medium text-danger">{errors.file}</p>}
        </div>
        {message && <div className="sm:col-span-2"><Alert tone={message.tone}>{message.text}</Alert></div>}
        <div className="sm:col-span-2">
          <Button type="submit" icon="upload" loading={busy}>Upload document</Button>
        </div>
      </form>
    </Card>
  );
}

function History({ credentials, meta }) {
  const [openError, setOpenError] = useState(null);
  return (
    <Card padded={false}>
      <div className="px-5 pt-5 md:px-6">
        <CardHeader title="All uploads" subtitle="Older documents are kept as history." />
      </div>
      {openError && <div className="px-5 pb-3"><Alert tone="danger">{openError}</Alert></div>}
      {credentials.length === 0 && <p className="px-6 pb-6 text-sm text-muted">Nothing uploaded yet.</p>}
      <ul className="divide-y divide-line">
        {credentials.map((c) => {
          const state = credentialState(c);
          return (
            <li key={c._id} className="flex flex-wrap items-center gap-3 px-5 py-4 md:px-6">
              <Icon name="file" size={20} className="text-primary" />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold">{meta.credentialLabels[c.type]} · {c.number}</p>
                <p className="text-xs text-muted">
                  Uploaded {formatDate(c.createdAt)} · expires {formatDate(c.expiresAt)}
                  {c.reviewNote && ` · Admin note: “${c.reviewNote}”`}
                </p>
              </div>
              <Badge tone={state.tone}>{state.label}</Badge>
              <Button size="sm" variant="ghost" onClick={() => openFile(c.file._id).catch((err) => setOpenError(err.message))}>
                View file
              </Button>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}
