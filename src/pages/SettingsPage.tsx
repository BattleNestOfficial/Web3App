import { motion } from 'framer-motion';
import { BellRing, Loader2, Mail, RefreshCw, Server, Smartphone } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { usePwaInstall } from '../hooks/usePwaInstall';
import { resolveApiBaseUrl } from '../lib/apiBaseUrl';
import { Button } from '../components/ui/Button';
import { fetchAutomationBillingSummary, type AutomationBillingSummary } from '../features/automation/api';

type BackendHealthState = 'checking' | 'ok' | 'error';

function centsToMoney(cents: number, currency: string) {
  return `${currency} ${(Math.max(0, Number(cents) || 0) / 100).toFixed(2)}`;
}

function formatIso(value: string | null) {
  if (!value) return 'n/a';
  const timestamp = new Date(value).getTime();
  if (!Number.isFinite(timestamp)) return 'n/a';
  return new Date(timestamp).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' }) + ' IST';
}

export function SettingsPage() {
  const { canInstall, promptInstall } = usePwaInstall();
  const [backendHealthState, setBackendHealthState] = useState<BackendHealthState>('checking');
  const [backendHealthMessage, setBackendHealthMessage] = useState('Checking backend health...');
  const [billingSummary, setBillingSummary] = useState<AutomationBillingSummary | null>(null);
  const [billingError, setBillingError] = useState('');
  const [isBillingLoading, setIsBillingLoading] = useState(true);
  const [isBillingRefreshing, setIsBillingRefreshing] = useState(false);

  const apiBase = useMemo(() => resolveApiBaseUrl(), []);
  const backendOrigin = useMemo(() => apiBase.replace(/\/api$/, ''), [apiBase]);

  const checkBackendHealth = useCallback(async () => {
    setBackendHealthState('checking');
    setBackendHealthMessage('Checking backend health...');
    try {
      const response = await fetch(`${backendOrigin}/health`, {
        method: 'GET',
        headers: {
          Accept: 'application/json'
        }
      });
      if (!response.ok) {
        setBackendHealthState('error');
        setBackendHealthMessage(`Health endpoint failed (${response.status}).`);
        return;
      }
      const body = (await response.json()) as { status?: string; uptimeSec?: number };
      const uptimeSec = Number(body?.uptimeSec ?? 0);
      setBackendHealthState('ok');
      setBackendHealthMessage(`Backend healthy. Uptime: ${Math.max(0, Math.floor(uptimeSec))}s.`);
    } catch {
      setBackendHealthState('error');
      setBackendHealthMessage(`Cannot reach backend (${backendOrigin}). Check VITE_API_BASE_URL and deployment.`);
    }
  }, [backendOrigin]);

  const loadBillingSummary = useCallback(async (showLoader: boolean) => {
    if (showLoader) setIsBillingLoading(true);
    setIsBillingRefreshing(true);
    setBillingError('');
    try {
      const summary = await fetchAutomationBillingSummary({ usageLimit: 12, transactionLimit: 12 });
      setBillingSummary(summary);
    } catch (error) {
      setBillingSummary(null);
      setBillingError(error instanceof Error ? error.message : 'Unable to load automation billing summary.');
    } finally {
      setIsBillingLoading(false);
      setIsBillingRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void checkBackendHealth();
  }, [checkBackendHealth]);

  useEffect(() => {
    void loadBillingSummary(true);
  }, [loadBillingSummary]);

  return (
    <section className="mx-auto max-w-7xl">
      <header className="mb-6">
        <p className="text-xs uppercase tracking-[0.2em] text-slate-400">System</p>
        <h2 className="mt-1 font-display text-2xl text-white sm:text-3xl">Web3OS Control Center</h2>
      </header>

      <div className="grid gap-4 lg:grid-cols-12">
        <motion.article
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="rounded-3xl border border-white/10 bg-white/[0.04] p-5 backdrop-blur-xl lg:col-span-6"
        >
          <div className="mb-3 flex items-center gap-2">
            <BellRing className="h-4 w-4 text-glow" />
            <h3 className="font-display text-lg text-white">Alerts Delivery</h3>
          </div>
          <ul className="space-y-2 text-sm text-slate-300">
            <li>To receive email alerts, configure `BREVO_API_KEY`, `BREVO_SENDER_EMAIL`, and `BREVO_RECIPIENT_EMAIL` in backend env.</li>
            <li>To-do digest automation runs twice daily by default (morning + night UTC slots configured server-side).</li>
            <li>Mint reminders are sent through enabled notification channels when reminders are due.</li>
            <li>Browser push alerts require JARVIS Alerts permission in Dashboard.</li>
          </ul>
        </motion.article>

        <motion.article
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.03 }}
          className="rounded-3xl border border-white/10 bg-white/[0.04] p-5 backdrop-blur-xl lg:col-span-6"
        >
          <div className="mb-3 flex items-center gap-2">
            <Server className="h-4 w-4 text-glow" />
            <h3 className="font-display text-lg text-white">Backend Runtime</h3>
          </div>
          <p className="text-sm text-slate-300">
            API Base: <span className="text-white">{apiBase}</span>
          </p>
          <p
            className={`mt-2 text-sm ${
              backendHealthState === 'ok'
                ? 'text-emerald-200'
                : backendHealthState === 'error'
                  ? 'text-rose-200'
                  : 'text-slate-300'
            }`}
          >
            {backendHealthMessage}
          </p>
          <Button type="button" variant="ghost" className="mt-3 h-8 px-2.5 text-xs" onClick={() => void checkBackendHealth()}>
            <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
            Recheck health
          </Button>
        </motion.article>

        <motion.article
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.06 }}
          className="rounded-3xl border border-white/10 bg-white/[0.04] p-5 backdrop-blur-xl lg:col-span-8"
        >
          <div className="mb-3 flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Mail className="h-4 w-4 text-glow" />
              <h3 className="font-display text-lg text-white">Automation Billing + Usage</h3>
            </div>
            <Button
              type="button"
              variant="ghost"
              className="h-8 px-2.5 text-xs"
              onClick={() => void loadBillingSummary(false)}
              disabled={isBillingRefreshing}
            >
              <RefreshCw className={`mr-1.5 h-3.5 w-3.5 ${isBillingRefreshing ? 'animate-spin' : ''}`} />
              Refresh
            </Button>
          </div>

          {isBillingLoading ? (
            <div className="flex items-center gap-2 text-sm text-slate-300">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading automation summary...
            </div>
          ) : billingError ? (
            <div className="rounded-xl border border-rose-300/40 bg-rose-300/10 px-3 py-2 text-sm text-rose-200">{billingError}</div>
          ) : billingSummary ? (
            <>
              <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
                <Metric label="Balance" value={centsToMoney(billingSummary.account.balanceCents, billingSummary.account.currency)} />
                <Metric label="Spent" value={centsToMoney(billingSummary.account.spentCents, billingSummary.account.currency)} />
                <Metric label="Charged Runs" value={String(billingSummary.totals.chargedRuns)} />
                <Metric label="Blocked Runs" value={String(billingSummary.totals.blockedRuns)} />
              </div>
              <p className="mt-3 text-xs text-slate-400">
                Last charged: {formatIso(billingSummary.account.lastChargedAt)} | Pay-per-use:{' '}
                {billingSummary.payPerUseEnabled ? 'enabled' : 'disabled'}
              </p>
              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                <Metric label="Daily Briefing Price" value={centsToMoney(billingSummary.pricing.dailyBriefingCents, billingSummary.account.currency)} />
                <Metric label="To-Do Digest Price" value={centsToMoney(billingSummary.pricing.todoDailyDigestCents, billingSummary.account.currency)} />
              </div>
            </>
          ) : null}
        </motion.article>

        <motion.article
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.09 }}
          className="rounded-3xl border border-white/10 bg-white/[0.04] p-5 backdrop-blur-xl lg:col-span-4"
        >
          <div className="mb-3 flex items-center gap-2">
            <Smartphone className="h-4 w-4 text-glow" />
            <h3 className="font-display text-lg text-white">PWA Runtime</h3>
          </div>
          <p className="text-sm text-slate-300">
            Installable: <span className="text-white">{canInstall ? 'Yes' : 'Already installed / unsupported'}</span>
          </p>
          <p className="mt-2 text-sm text-slate-300">Use install mode for persistent notifications and app-like launch behavior.</p>
          {canInstall ? (
            <Button type="button" className="mt-3 h-8 px-2.5 text-xs" onClick={promptInstall}>
              Install Web3OS
            </Button>
          ) : null}
        </motion.article>
      </div>
    </section>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2">
      <p className="text-[11px] uppercase tracking-wide text-slate-400">{label}</p>
      <p className="mt-1 text-sm text-slate-100">{value}</p>
    </div>
  );
}

