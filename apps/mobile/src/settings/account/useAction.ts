import { useState } from 'react';
import { fieldMessage } from './accountModel';

/** Runs a form's request, keeping the sheet open and showing the API's message under the form when it fails. */
export function useAction() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const run = async (action: () => Promise<void>, field = 'password') => {
    setBusy(true);
    setError(null);
    try {
      await action();
    } catch (e) {
      setError(fieldMessage(e, field));
    } finally {
      setBusy(false);
    }
  };
  return { busy, error, setError, run };
}
