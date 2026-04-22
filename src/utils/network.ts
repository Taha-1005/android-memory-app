/**
 * Pre-check for connectivity. Spec §11.5 asks us to short-circuit LLM calls
 * when the device is offline rather than letting the 45s timeout burn.
 *
 * We import `@react-native-community/netinfo` dynamically so this module
 * remains importable from pure-Node unit tests. If the module throws or
 * returns anything other than an explicit `isConnected === false`, we
 * treat the network as "probably up" and let the real request either
 * succeed or fail on its own — false negatives are worse than false
 * positives here.
 */
export async function assertOnline(): Promise<void> {
  try {
    const mod = await import('@react-native-community/netinfo');
    const fetchFn = (mod as unknown as {
      default?: { fetch: () => Promise<{ isConnected: boolean | null }> };
      fetch?: () => Promise<{ isConnected: boolean | null }>;
    });
    const netFetch = fetchFn.default?.fetch ?? fetchFn.fetch;
    if (!netFetch) return;
    const state = await netFetch();
    if (state.isConnected === false) {
      throw new Error('You appear to be offline. Check your connection and try again.');
    }
  } catch (e) {
    // If the import itself failed (e.g., running in Node tests), or the
    // state call threw, silently proceed — the HTTP layer will still
    // surface its own errors.
    if (e instanceof Error && /offline/i.test(e.message)) throw e;
  }
}
