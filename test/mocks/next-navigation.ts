/* eslint-disable @typescript-eslint/no-empty-function, @typescript-eslint/no-explicit-any, no-undef */
/*
  Jest mock for Next.js App Router navigation utilities.
  Provides helpers to mutate pathname and assert router interactions.
*/

let currentPathname = "/";

const routerMocks = {
  push: jest.fn<Promise<void>, [string, any?]>(),
  replace: jest.fn<Promise<void>, [string, any?]>(),
  refresh: jest.fn<void, []>(),
  back: jest.fn<void, []>(),
  forward: jest.fn<void, []>(),
  prefetch: jest.fn<Promise<void>, [string]>(),
};

export const __setMockPathname = (pathname: string) => {
  currentPathname = pathname;
};

export const __resetNavigationMocks = () => {
  currentPathname = "/";
  Object.values(routerMocks).forEach((mock) => mock.mockReset());
};

export const usePathname = () => currentPathname;

export const useRouter = () => ({
  ...routerMocks,
  pathname: currentPathname,
});

export const useSearchParams = () => new URLSearchParams();

export const notFound = jest.fn(() => {
  throw new Error("Route resulted in notFound");
});

export const redirect = jest.fn((destination: string) => {
  throw new Error(`Redirected to ${destination}`);
});

export const headers = jest.fn(() => new Headers());

export const cookies = jest.fn(() => ({
  get: jest.fn(),
  getAll: jest.fn(() => []),
  set: jest.fn(),
  delete: jest.fn(),
  has: jest.fn(() => false),
  clear: jest.fn(),
}));

export const unstable_noStore = jest.fn();
export const revalidatePath = jest.fn();
export const revalidateTag = jest.fn();
export const permanentRedirect = redirect;
export const draftMode = jest.fn(() => ({ enable: jest.fn(), disable: jest.fn() }));

export const __getRouterMocks = () => routerMocks;
