export type HelloArgs = {
  name: string;
  tenantId: string;
};

export function helloImpl({ name, tenantId }: HelloArgs) {
  return `Hello ${name} from tenant ${tenantId}, welcome to BrickOps!`;
}
