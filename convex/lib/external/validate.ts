import { catalogClient } from "../../marketplaces/bricklink/catalogClient";
import { BrickognizeClient } from "./brickognize";
import { BrickowlClient } from "./brickowl";
import { HealthCheckResult } from "./types";

export const validateBrickognize = async () => new BrickognizeClient().healthCheck();

export const validateBricklink = async () => catalogClient.healthCheck();

export const validateBrickowl = async () => new BrickowlClient().healthCheck();

export const validateExternalApis = async () => {
  const [brickognize, bricklink, brickowl] = await Promise.all<HealthCheckResult>([
    validateBrickognize(),
    validateBricklink(),
    validateBrickowl(),
  ]);

  return { brickognize, bricklink, brickowl } as const;
};
