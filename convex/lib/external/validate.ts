import { BricklinkClient } from "./bricklink";
import { BrickognizeClient } from "./brickognize";
import { BrickowlClient } from "./brickowl";
import { ValidationResult } from "./types";

export const validateBrickognize = async () => new BrickognizeClient().healthCheck();

export const validateBricklink = async (identityKey?: string) =>
  new BricklinkClient().healthCheck(identityKey);

export const validateBrickowl = async () => new BrickowlClient().healthCheck();

export const validateExternalApis = async (options: { identityKey?: string } = {}) => {
  const [brickognize, bricklink, brickowl] = await Promise.all<ValidationResult>([
    validateBrickognize(),
    validateBricklink(options.identityKey),
    validateBrickowl(),
  ]);

  return { brickognize, bricklink, brickowl } as const;
};
