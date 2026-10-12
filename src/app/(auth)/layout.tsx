export default function AuthLayout({ children }: LayoutProps<"/">) {
  return (
    <main className="flex flex-1 items-center justify-center px-4 py-12">
      <div className="w-full max-w-sm">
        <p className="mb-6 text-center text-2xl font-semibold tracking-tight">
          ChordBase
        </p>
        <div className="rounded-xl border border-zinc-200 p-6 shadow-sm dark:border-zinc-800">
          {children}
        </div>
      </div>
    </main>
  );
}
