import { motion } from 'framer-motion';
import { RefreshCw } from 'lucide-react';
import { useEffect, useState } from 'react';
import { createApiCostEvent, fetchApiCostSummary, type ApiCostSummary } from '../features/analytics/api';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';

type CustomApiCostFormState = {
  providerKey: string;
  operation: string;
  requestCount: string;
  costUsd: string;
  note: string;
};

const defaultCustomApiCostForm: CustomApiCostFormState = {
  providerKey: 'rest',
  operation: 'manual_entry',
  requestCount: '1',
  costUsd: '',
  note: ''
};

function MetricCell({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2">
      <p className="text-[11px] uppercase tracking-wide text-slate-400">{label}</p>
      <p className="mt-1 text-lg font-semibold text-white">{value}</p>
    </div>
  );
}

export function ApiCostTrackerPage() {
  const [apiCosts, setApiCosts] = useState<ApiCostSummary | null>(null);
  const [isApiCostsLoading, setIsApiCostsLoading] = useState(true);
  const [isApiCostsRefreshing, setIsApiCostsRefreshing] = useState(false);
  const [apiCostsError, setApiCostsError] = useState('');
  const [customApiCostForm, setCustomApiCostForm] = useState<CustomApiCostFormState>(defaultCustomApiCostForm);
  const [isCustomCostSubmitting, setIsCustomCostSubmitting] = useState(false);
  const [customCostMessage, setCustomCostMessage] = useState('');

  useEffect(() => {
    let isMounted = true;

    async function loadApiCosts(showLoader: boolean) {
      if (showLoader) {
        setIsApiCostsLoading(true);
      } else {
        setIsApiCostsRefreshing(true);
      }
      setApiCostsError('');

      try {
        const response = await fetchApiCostSummary({ days: 30, recentLimit: 40, providerLimit: 20 });
        if (!isMounted) return;
        setApiCosts(response);
      } catch (error) {
        if (!isMounted) return;
        setApiCostsError(error instanceof Error ? error.message : 'Failed to load API cost analytics.');
      } finally {
        if (isMounted) {
          setIsApiCostsLoading(false);
          setIsApiCostsRefreshing(false);
        }
      }
    }

    void loadApiCosts(true);
    const timer = window.setInterval(() => {
      void loadApiCosts(false);
    }, 45_000);

    return () => {
      isMounted = false;
      window.clearInterval(timer);
    };
  }, []);

  async function handleRefreshApiCosts() {
    setIsApiCostsRefreshing(true);
    setApiCostsError('');
    try {
      const response = await fetchApiCostSummary({ days: 30, recentLimit: 40, providerLimit: 20 });
      setApiCosts(response);
    } catch (error) {
      setApiCostsError(error instanceof Error ? error.message : 'Failed to refresh API cost analytics.');
    } finally {
      setIsApiCostsRefreshing(false);
    }
  }

  async function handleSubmitCustomApiCost() {
    setCustomCostMessage('');
    setApiCostsError('');
    const requestCount = Number(customApiCostForm.requestCount || '1');
    const costUsd = Number(customApiCostForm.costUsd);
    if (!Number.isFinite(costUsd) || costUsd < 0) {
      setCustomCostMessage('Cost must be a valid non-negative number.');
      return;
    }
    if (!Number.isFinite(requestCount) || requestCount <= 0) {
      setCustomCostMessage('Request count must be greater than zero.');
      return;
    }

    setIsCustomCostSubmitting(true);
    try {
      await createApiCostEvent({
        providerKey: customApiCostForm.providerKey.trim().toLowerCase() || 'rest',
        operation: customApiCostForm.operation.trim() || 'manual_entry',
        requestCount: Math.floor(requestCount),
        costUsd,
        success: true,
        metadata: customApiCostForm.note.trim() ? { note: customApiCostForm.note.trim(), source: 'manual_ui' } : { source: 'manual_ui' }
      });
      setCustomApiCostForm((prev) => ({ ...prev, costUsd: '', note: '' }));
      setCustomCostMessage('Custom API cost logged.');
      const refreshed = await fetchApiCostSummary({ days: 30, recentLimit: 40, providerLimit: 20 });
      setApiCosts(refreshed);
    } catch (error) {
      setCustomCostMessage(error instanceof Error ? error.message : 'Failed to save custom API cost.');
    } finally {
      setIsCustomCostSubmitting(false);
    }
  }

  return (
    <section className="mx-auto max-w-7xl">
      <motion.header
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.22 }}
        className="mb-6"
      >
        <p className="text-xs uppercase tracking-[0.2em] text-slate-400">Usage + Billing</p>
        <h2 className="mt-1 font-display text-2xl text-white sm:text-3xl">API Cost Tracker</h2>
      </motion.header>

      <motion.article
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.22 }}
        className="rounded-3xl border border-white/10 bg-white/[0.04] p-5 shadow-[0_25px_55px_rgba(0,0,0,0.45)] backdrop-blur-xl sm:p-6"
      >
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <h3 className="font-display text-lg text-white">Cost Summary</h3>
          <Button
            type="button"
            variant="ghost"
            className="px-3"
            onClick={() => void handleRefreshApiCosts()}
            disabled={isApiCostsRefreshing}
          >
            <RefreshCw className={`mr-2 h-4 w-4 ${isApiCostsRefreshing ? 'animate-spin' : ''}`} />
            {isApiCostsRefreshing ? 'Refreshing...' : 'Refresh'}
          </Button>
        </div>

        <p className="mb-3 text-xs uppercase tracking-[0.12em] text-slate-400">
          Auto-tracked: OpenAI, Twitter, Brevo, OpenSea, Magic Eden | Window: Last {apiCosts?.windowDays ?? 30} days
        </p>

        {isApiCostsLoading ? (
          <p className="text-sm text-slate-300">Loading API usage and cost records...</p>
        ) : apiCosts ? (
          <>
            <div className="mb-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
              <MetricCell label="30d Cost (USD)" value={formatUsd(apiCosts.totals.window.totalCostUsd)} />
              <MetricCell label="30d Requests" value={String(apiCosts.totals.window.totalRequests)} />
              <MetricCell label="OpenAI Input Tokens" value={String(apiCosts.totals.window.totalInputTokens)} />
              <MetricCell label="OpenAI Output Tokens" value={String(apiCosts.totals.window.totalOutputTokens)} />
              <MetricCell label="All-Time Cost (USD)" value={formatUsd(apiCosts.totals.allTime.totalCostUsd)} />
            </div>

            <div className="mb-4 grid gap-4 lg:grid-cols-2">
              <div>
                <p className="mb-2 text-xs uppercase tracking-[0.12em] text-slate-400">Provider Breakdown (30d)</p>
                {apiCosts.providers.length === 0 ? (
                  <p className="text-sm text-slate-300">No API usage events recorded yet.</p>
                ) : (
                  <div className="space-y-2">
                    {apiCosts.providers.map((row) => (
                      <div key={row.providerKey} className="rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2">
                        <div className="mb-1 flex items-center justify-between gap-2">
                          <p className="text-sm uppercase text-white">{row.providerKey}</p>
                          <p className="text-xs text-cyan-200">{formatUsd(row.totalCostUsd)}</p>
                        </div>
                        <p className="text-xs text-slate-400">
                          Requests: {row.totalRequests} | Events: {row.eventsCount}
                          {row.lastEventAt ? ` | Last: ${new Date(row.lastEventAt).toLocaleString()}` : ''}
                        </p>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div>
                <p className="mb-2 text-xs uppercase tracking-[0.12em] text-slate-400">Manual Cost Entry (Other APIs)</p>
                <div className="space-y-2 rounded-xl border border-white/10 bg-white/[0.03] p-3">
                  <Input
                    placeholder="Provider key (e.g. alchemy, coingecko, rest)"
                    value={customApiCostForm.providerKey}
                    onChange={(event) =>
                      setCustomApiCostForm((prev) => ({ ...prev, providerKey: event.target.value }))
                    }
                  />
                  <Input
                    placeholder="Operation (optional)"
                    value={customApiCostForm.operation}
                    onChange={(event) =>
                      setCustomApiCostForm((prev) => ({ ...prev, operation: event.target.value }))
                    }
                  />
                  <div className="grid gap-2 sm:grid-cols-2">
                    <Input
                      type="number"
                      min="1"
                      placeholder="Request count"
                      value={customApiCostForm.requestCount}
                      onChange={(event) =>
                        setCustomApiCostForm((prev) => ({ ...prev, requestCount: event.target.value }))
                      }
                    />
                    <Input
                      type="number"
                      min="0"
                      step="0.000001"
                      placeholder="Cost USD"
                      value={customApiCostForm.costUsd}
                      onChange={(event) =>
                        setCustomApiCostForm((prev) => ({ ...prev, costUsd: event.target.value }))
                      }
                    />
                  </div>
                  <Input
                    placeholder="Note (optional)"
                    value={customApiCostForm.note}
                    onChange={(event) => setCustomApiCostForm((prev) => ({ ...prev, note: event.target.value }))}
                  />
                  <div className="flex items-center justify-between gap-2">
                    <Button
                      type="button"
                      onClick={() => void handleSubmitCustomApiCost()}
                      disabled={isCustomCostSubmitting}
                    >
                      {isCustomCostSubmitting ? 'Saving...' : 'Log Cost'}
                    </Button>
                    {customCostMessage ? <p className="text-xs text-slate-300">{customCostMessage}</p> : null}
                  </div>
                </div>
              </div>
            </div>

            <p className="mb-2 text-xs uppercase tracking-[0.12em] text-slate-400">Recent API Usage Events</p>
            <div className="max-h-72 space-y-2 overflow-y-auto pr-1">
              {apiCosts.recentEvents.length === 0 ? (
                <p className="text-sm text-slate-300">No events yet.</p>
              ) : (
                apiCosts.recentEvents.slice(0, 30).map((event) => (
                  <div key={event.id} className="rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2 text-xs">
                    <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
                      <p className="uppercase text-white">
                        {event.providerKey} | {event.operation}
                      </p>
                      <p className={event.success ? 'text-emerald-200' : 'text-rose-200'}>
                        {event.success ? 'OK' : 'FAILED'}
                        {event.httpStatus ? ` (${event.httpStatus})` : ''}
                      </p>
                    </div>
                    <p className="text-slate-300">
                      Cost: {formatUsd(event.costUsd)} | Requests: {event.requestCount}
                      {event.inputTokens > 0 || event.outputTokens > 0
                        ? ` | Tokens: in ${event.inputTokens}, out ${event.outputTokens}`
                        : ''}
                    </p>
                    <p className="text-slate-500">
                      {event.endpoint ?? 'No endpoint'} | {new Date(event.createdAt).toLocaleString()}
                    </p>
                  </div>
                ))
              )}
            </div>
          </>
        ) : (
          <p className="text-sm text-slate-300">API cost data unavailable.</p>
        )}

        {apiCostsError ? <p className="mt-3 text-xs text-amber-200">{apiCostsError}</p> : null}
      </motion.article>
    </section>
  );
}

function formatUsd(value: number) {
  return `$${round(value, 6)}`;
}

function round(value: number, decimals = 4) {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}
