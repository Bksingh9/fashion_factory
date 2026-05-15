export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-zinc-50 px-6 py-24 dark:bg-zinc-950">
      <div className="mx-auto flex w-full max-w-3xl flex-col items-start gap-6">
        <span className="rounded-full border border-zinc-200 bg-white px-3 py-1 text-xs font-medium uppercase tracking-wide text-zinc-600 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-400">
          Opportunity OS
        </span>
        <h1 className="text-4xl font-semibold tracking-tight text-zinc-950 sm:text-5xl dark:text-zinc-50">
          PainPilot — Turn complaints into shipped MVPs.
        </h1>
        <p className="max-w-xl text-lg leading-8 text-zinc-600 dark:text-zinc-400">
          PainPilot listens to public complaints across the internet, clusters
          them into validated demand, and helps solo founders ship paying AI
          micro-SaaS in days, not months.
        </p>
      </div>
    </main>
  );
}
