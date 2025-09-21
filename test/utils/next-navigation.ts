import {
  __getRouterMocks,
  __resetNavigationMocks,
  __setMockPathname,
} from "../mocks/next-navigation";

type RouterMocks = ReturnType<typeof __getRouterMocks>;

export const setMockPathname = (pathname: string) => {
  __setMockPathname(pathname);
};

export const resetMockNavigation = () => {
  __resetNavigationMocks();
};

export const getRouterMocks = (): RouterMocks => __getRouterMocks();
