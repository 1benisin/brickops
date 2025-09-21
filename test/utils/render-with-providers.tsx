import type { ReactElement, ReactNode } from "react";
import { useRef } from "react";
import { render, type RenderOptions, type RenderResult } from "@testing-library/react";
import { ConvexProvider, type ConvexReactClient } from "convex/react";

import { createMockConvexClient } from "./convex-client";

interface ProvidersProps {
  children: ReactNode;
  convexClient?: ConvexReactClient;
}

const Providers = ({ children, convexClient }: ProvidersProps) => {
  const clientRef = useRef(convexClient ?? createMockConvexClient());
  const value = convexClient ?? clientRef.current;

  return <ConvexProvider client={value}>{children}</ConvexProvider>;
};

type CustomRenderOptions = RenderOptions & {
  convexClient?: ConvexReactClient;
};

export const renderWithProviders = (
  ui: ReactElement,
  { convexClient, ...options }: CustomRenderOptions = {},
): RenderResult => {
  return render(ui, {
    wrapper: ({ children }) => <Providers convexClient={convexClient}>{children}</Providers>,
    ...options,
  });
};
