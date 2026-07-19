import { Store } from "lucide-react";
import { LoginForm } from "./login-form";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  return (
    <main className="flex-1 flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="flex flex-col items-center gap-3 mb-8">
          <div className="rounded-2xl bg-accent p-3.5">
            <Store className="size-8 text-accent-fg" strokeWidth={2} aria-hidden />
          </div>
          <div className="text-center">
            <h1 className="font-display text-2xl font-semibold tracking-tight">Shop Dashboard</h1>
            <p className="text-sm text-subtle mt-1">Orders, inventory, chats and reports</p>
          </div>
        </div>
        {error === "noaccess" ? (
          <div
            role="alert"
            className="mb-4 rounded-xl bg-warning-soft text-warning-text text-sm font-semibold px-4 py-3"
          >
            This account has no dashboard access yet. Ask the platform owner to add you.
          </div>
        ) : null}
        <LoginForm />
      </div>
    </main>
  );
}
