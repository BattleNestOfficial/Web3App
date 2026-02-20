import { useRegisterSW } from 'virtual:pwa-register/react';
import { Button } from '../ui/Button';

export function PwaUpdateToast() {
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    offlineReady: [offlineReady, setOfflineReady],
    updateServiceWorker
  } = useRegisterSW();

  const close = () => {
    setNeedRefresh(false);
    setOfflineReady(false);
  };

  if (!offlineReady && !needRefresh) {
    return null;
  }

  return (
    <div className="fixed bottom-5 right-5 z-50 max-w-sm rounded-2xl border border-slate-700 bg-panel p-4 shadow-2xl">
      <p className="mb-3 text-sm text-slate-200">
        {offlineReady ? 'App ready for offline use.' : 'New update available.'}
      </p>
      <div className="flex items-center gap-2">
        {needRefresh && (
          <Button variant="primary" onClick={() => updateServiceWorker(true)}>
            Refresh
          </Button>
        )}
        <Button variant="ghost" onClick={close}>
          Dismiss
        </Button>
      </div>
    </div>
  );
}

