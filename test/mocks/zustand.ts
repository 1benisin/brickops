import { useDebugValue, useSyncExternalStore } from "react";

type StateCreator<T> = (
  setState: (partial: Partial<T> | ((state: T) => Partial<T>), replace?: boolean) => void,
  getState: () => T,
  api: {
    setState: (partial: Partial<T> | ((state: T) => Partial<T>), replace?: boolean) => void;
    getState: () => T;
    subscribe: (listener: () => void) => () => void;
  },
) => T;

function createImpl<T>(createState: StateCreator<T>) {
  let state: T;
  const listeners = new Set<() => void>();

  const setState = (partial: Partial<T> | ((state: T) => Partial<T>), replace = false) => {
    const nextState = typeof partial === "function" ? partial(state) : partial;
    state = replace ? (nextState as T) : { ...state, ...nextState };
    listeners.forEach((listener) => listener());
  };

  const getState = () => state;

  const subscribe = (listener: () => void) => {
    listeners.add(listener);
    return () => listeners.delete(listener);
  };

  const api = { setState, getState, subscribe };
  state = createState(setState, getState, api);

  const useBoundStore = <U>(selector: (state: T) => U = (state) => state as unknown as U) => {
    const slice = useSyncExternalStore(
      subscribe,
      () => selector(state),
      () => selector(state),
    );
    useDebugValue(slice);
    return slice;
  };

  Object.assign(useBoundStore, {
    setState,
    getState,
    subscribe,
    destroy: () => listeners.clear(),
  });

  return useBoundStore as typeof useBoundStore & {
    setState: typeof setState;
    getState: typeof getState;
    subscribe: typeof subscribe;
    destroy: () => void;
  };
}

export function create<T>(initializer?: StateCreator<T>) {
  if (initializer) {
    return createImpl(initializer);
  }

  return (createState: StateCreator<T>) => createImpl(createState);
}

export default create;
