import { store } from './store';
import { total } from './store/machine';
interface Context {
  registerTool(
    tool: {
      name: string;
      description: string;
      inputSchema: object;
      annotations: { readOnlyHint: boolean };
      execute: (input: unknown) => unknown;
    },
    options: { signal: AbortSignal },
  ): void | Promise<void>;
}
export function registerTools() {
  const context = (document as Document & { modelContext?: Context }).modelContext;
  if (!context?.registerTool) return;
  const lifecycle = new AbortController();
  for (const tool of [
    {
      name: 'read_street_ticket',
      description: 'Read this browser’s current cart and customer total.',
      inputSchema: { type: 'object', properties: {}, additionalProperties: false },
      annotations: { readOnlyHint: true },
      execute: () => ({
        lines: store.get().cart,
        total: total(store.get().cart, store.get().address),
      }),
    },
    {
      name: 'add_street_item',
      description:
        'Stage an available menu item on the visible shared cart. Does not pay or create an order.',
      inputSchema: {
        type: 'object',
        properties: { productId: { type: 'string' } },
        required: ['productId'],
        additionalProperties: false,
      },
      annotations: { readOnlyHint: false },
      execute: (input: unknown) => {
        if (
          !input ||
          typeof input !== 'object' ||
          !('productId' in input) ||
          typeof input.productId !== 'string'
        )
          throw new Error('productId is required.');
        store.add(input.productId);
        return { items: store.get().cart.length };
      },
    },
  ]) {
    try {
      void Promise.resolve(context.registerTool(tool, { signal: lifecycle.signal })).catch(
        () => {},
      );
    } catch {
      /* Optional experimental browser API. */
    }
  }
  return () => lifecycle.abort();
}
