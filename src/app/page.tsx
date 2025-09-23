import Link from "next/link";
import { AppHeader, PageContainer } from "@/components/layout";
import { Button } from "@/components/ui";

const navigation = [
  { label: "Dashboard", href: "/dashboard" as const },
  { label: "Inventory", href: "/inventory" as const },
  { label: "Orders", href: "/orders" as const },
  { label: "Catalog", href: "/catalog" as const },
  { label: "Design System", href: "/design-system" as const },
];

export default function HomePage() {
  return (
    <div className="min-h-screen bg-background">
      <AppHeader navigation={navigation} />
      <main>
        <section className="relative isolate overflow-hidden">
          <div className="absolute inset-0 -z-10 bg-gradient-to-br from-primary/10 via-background to-background" />
          <PageContainer className="flex min-h-[70vh] flex-col items-center justify-center gap-8 text-center">
            <div className="space-y-4">
              <p className="text-sm font-semibold uppercase tracking-[0.3em] text-primary">
                BrickOps
              </p>
              <h1 className="text-balance text-4xl font-semibold tracking-tight text-foreground sm:text-5xl">
                Your retail operations launchpad
              </h1>
              <p className="mx-auto max-w-2xl text-balance text-muted-foreground">
                Ship consistent experiences faster with a shadcn/ui-powered component system,
                responsive layout scaffolding, and a Convex + Next.js stack optimized for inventory
                and order workflows.
              </p>
            </div>
            <div className="flex flex-wrap items-center justify-center gap-3">
              <Button asChild>
                <Link href="/design-system">Explore design system</Link>
              </Button>
              <Button asChild variant="outline">
                <Link href="https://nextjs.org/docs">Next.js docs</Link>
              </Button>
              <Button asChild variant="ghost">
                <Link href="https://docs.convex.dev/home">Convex docs</Link>
              </Button>
            </div>
          </PageContainer>
        </section>
      </main>
    </div>
  );
}
