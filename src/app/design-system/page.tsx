import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { AppHeader, PageContainer } from "@/components/layout";
import {
  Button,
  buttonVariants,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  Input,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  ThemeToggle,
} from "@/components/ui";

export const metadata: Metadata = {
  title: "BrickOps Design System",
  description: "Reference for core shadcn/ui primitives and layout patterns.",
};

const navigation = [
  { label: "Dashboard", href: "/dashboard" as const },
  { label: "Inventory", href: "/inventory" as const },
  { label: "Orders", href: "/orders" as const },
  { label: "Catalog", href: "/catalog" as const },
];

const buttonVariantsConfig = [
  { variant: "default" as const, size: "default" as const },
  { variant: "secondary" as const, size: "default" as const },
  { variant: "outline" as const, size: "default" as const },
  { variant: "destructive" as const, size: "default" as const },
  { variant: "ghost" as const, size: "default" as const },
  { variant: "link" as const, size: "default" as const },
];

export default function DesignSystemPage() {
  return (
    <div className="min-h-screen bg-background">
      <AppHeader navigation={navigation} />
      <PageContainer className="space-y-10">
        <section className="flex flex-col gap-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.3em] text-primary">
                Design system
              </p>
              <h1 className="text-4xl font-semibold tracking-tight">BrickOps UI foundations</h1>
              <p className="max-w-xl text-muted-foreground">
                Reference documentation for shadcn/ui primitives, layout scaffolding, and theming
                utilities used across the product.
              </p>
            </div>
            <ThemeToggle />
          </div>
        </section>

        <Section
          title="Buttons"
          description="Variants delivered by shadcn/ui with BrickOps tokens."
        >
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {buttonVariantsConfig.map(({ variant, size }) => (
              <Card key={`${variant}-${size}`}>
                <CardHeader>
                  <CardTitle className="text-base capitalize">{variant}</CardTitle>
                  <CardDescription className="text-sm">
                    Class: <code className="text-xs">{buttonVariants({ variant, size })}</code>
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <Button variant={variant} size={size} className="w-full">
                    {variant === "link" ? "Link variant" : "Primary action"}
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        </Section>

        <Section title="Inputs" description="Form primitives following WCAG AA color contrast.">
          <Card>
            <CardContent className="flex flex-col gap-4 p-6">
              <Input placeholder="Search inventory" aria-label="Search inventory" />
              <Input placeholder="Enter SKU" aria-label="SKU" disabled />
            </CardContent>
          </Card>
        </Section>

        <Section title="Dialog" description="Modal primitive with type-safe composition.">
          <Card>
            <CardContent className="p-6">
              <Dialog>
                <DialogTrigger asChild>
                  <Button>Open dialog</Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Connect marketplace</DialogTitle>
                    <DialogDescription>
                      Configure API credentials to sync orders from BrickLink and BrickOwl.
                    </DialogDescription>
                  </DialogHeader>
                  <div className="space-y-4">
                    <Input placeholder="API key" aria-label="API key" />
                    <Input placeholder="Secret" aria-label="Secret" type="password" />
                    <div className="flex justify-end gap-2">
                      <Button variant="ghost">Cancel</Button>
                      <Button>Save</Button>
                    </div>
                  </div>
                </DialogContent>
              </Dialog>
            </CardContent>
          </Card>
        </Section>

        <Section
          title="Tabs & Table"
          description="Combined primitives for the orders and catalog workspaces."
        >
          <Card>
            <CardContent className="space-y-6 p-6">
              <Tabs defaultValue="orders" className="w-full">
                <TabsList>
                  <TabsTrigger value="orders">Orders</TabsTrigger>
                  <TabsTrigger value="inventory">Inventory</TabsTrigger>
                </TabsList>
                <TabsContent value="orders" className="space-y-4">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Order</TableHead>
                        <TableHead>Customer</TableHead>
                        <TableHead className="text-right">Items</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      <TableRow>
                        <TableCell className="font-medium">BO-1043</TableCell>
                        <TableCell>BrickLink #44210</TableCell>
                        <TableCell className="text-right">18</TableCell>
                      </TableRow>
                      <TableRow>
                        <TableCell className="font-medium">BO-1041</TableCell>
                        <TableCell>BrickOwl #39877</TableCell>
                        <TableCell className="text-right">9</TableCell>
                      </TableRow>
                    </TableBody>
                  </Table>
                </TabsContent>
                <TabsContent value="inventory" className="space-y-4">
                  <p className="text-sm text-muted-foreground">
                    Swap the data source for the inventory table to reuse the same table shell
                    across pages.
                  </p>
                </TabsContent>
              </Tabs>
            </CardContent>
          </Card>
        </Section>

        <Section
          title="Layout shells"
          description="Reusable compositions for immediate page scaffolding."
        >
          <div className="flex flex-wrap gap-3">
            <Button asChild variant="ghost">
              <Link
                href="/design-system/examples/dashboard"
                className="underline-offset-4 hover:underline"
              >
                View dashboard example
              </Link>
            </Button>
            <Button asChild variant="ghost">
              <Link
                href="/design-system/examples/catalog"
                className="underline-offset-4 hover:underline"
              >
                View catalog example
              </Link>
            </Button>
            <Button asChild variant="ghost">
              <Link
                href="/design-system/examples/orders"
                className="underline-offset-4 hover:underline"
              >
                View orders example
              </Link>
            </Button>
          </div>
        </Section>
      </PageContainer>
    </div>
  );
}

function Section({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <section className="space-y-4">
      <header className="space-y-1">
        <h2 className="text-2xl font-semibold tracking-tight">{title}</h2>
        <p className="text-muted-foreground">{description}</p>
      </header>
      {children}
    </section>
  );
}
