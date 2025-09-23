export type HelloArgs = {
  name: string;
  tenantId: string;
};

/**
 * Pure "business logic" for the hello mutation.
 *
 * Why this exists:
 * - Keeps the Convex-specific handler (auth/context/validation) in `hello.ts`
 * - Allows unit testing this logic in isolation without Convex runtime
 *
 * @param {HelloArgs} param0 - name of the greeter and resolved tenant id
 * @returns {string} Personalized greeting including tenant context
 */
export function helloImpl({ name, tenantId }: HelloArgs) {
  return `Hello ${name} from tenant ${tenantId}, welcome to BrickOps!`;
}
