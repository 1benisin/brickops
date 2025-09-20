import Link from "next/link";

export default function HomePage() {
  return (
    <section className="flex min-h-screen flex-col items-center justify-center gap-6 bg-gradient-to-br from-slate-900 via-slate-950 to-slate-900 p-8">
      <div className="space-y-3 text-center">
        <p className="text-sm font-semibold uppercase tracking-[0.3em] text-emerald-400">
          BrickOps
        </p>
        <h1 className="text-4xl font-bold tracking-tight text-white sm:text-5xl">
          Your retail operations launchpad
        </h1>
        <p className="max-w-xl text-balance text-slate-300">
          This scaffold ships with a Next.js + Convex stack, Tailwind CSS styling, comprehensive
          testing setup, and developer tooling so the team can focus on delivering value on day one.
        </p>
      </div>
      <div className="flex flex-wrap items-center justify-center gap-3">
        <Link
          href="https://docs.convex.dev/home"
          className="rounded-md bg-emerald-500 px-5 py-2.5 text-sm font-semibold text-emerald-950 shadow-lg shadow-emerald-500/30 transition hover:-translate-y-0.5 hover:bg-emerald-400"
        >
          Convex docs
        </Link>
        <Link
          href="https://nextjs.org/docs"
          className="rounded-md border border-slate-700 px-5 py-2.5 text-sm font-semibold text-white transition hover:-translate-y-0.5 hover:border-slate-500"
        >
          Next.js docs
        </Link>
      </div>
    </section>
  );
}
