import { checkBlCatalogHealth } from "../../marketplaces/bricklink/catalog/shared/health";
import { BrickognizeClient } from "../../identify/client";
import { BrickowlClient } from "../../marketplaces/brickowl/httpClient";
import type { HealthCheckResult } from "../../shared/http/types";

export const validateBrickognize = async () => new BrickognizeClient().healthCheck();

export const validateBricklink = async () => checkBlCatalogHealth();

export const validateBrickowl = async () => new BrickowlClient().healthCheck();

export const validateExternalApis = async () => {
  const [brickognize, bricklink, brickowl] = await Promise.all<HealthCheckResult>([
    validateBrickognize(),
    validateBricklink(),
    validateBrickowl(),
  ]);

  return { brickognize, bricklink, brickowl } as const;
};
