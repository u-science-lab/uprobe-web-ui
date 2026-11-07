/** Saving is authoritative; the optional list refresh must not delay or fail handoff. */
export async function saveCustomMethod<T>(
  save: () => Promise<unknown>,
  refresh: () => Promise<T>,
  callbacks: {
    saved: () => void;
    refreshed: (value: T) => void;
    refreshFailed: (error: unknown) => void;
    use?: () => void;
  },
): Promise<void> {
  await save();
  callbacks.saved();
  try {
    void refresh().then(callbacks.refreshed, callbacks.refreshFailed);
  } catch (error) {
    callbacks.refreshFailed(error);
  }
  callbacks.use?.();
}
