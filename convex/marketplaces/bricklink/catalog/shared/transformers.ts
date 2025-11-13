import { decode } from "he";

export function decodeHtmlEntities(input: string): string {
  return decode(input, { isAttributeValue: false });
}

