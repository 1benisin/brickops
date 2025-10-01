type PersistInitializer<TState extends object> = (
  set: unknown,
  get: unknown,
  api: unknown,
) => TState;

export const persist = <TState extends object>(initializer: PersistInitializer<TState>) =>
  initializer;

const mockedMiddleware = { persist };

export default mockedMiddleware;
