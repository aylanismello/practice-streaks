import Link from "next/link";
import { Suspense } from "react";
import { TaiChiLibrary } from "@/components/TaiChiLibrary";

export default function FormsPage() {
  return (
    <main className="mx-auto max-w-[1100px] px-4 py-6 pb-12 md:px-8 md:py-10">
      <Link href="/" className="mb-5 inline-block text-sm text-[var(--text-muted)] transition-colors hover:text-[var(--text)]">
        ← Practice dashboard
      </Link>
      <Suspense fallback={<p className="text-sm text-[var(--text-muted)]">Loading study library…</p>}>
        <TaiChiLibrary />
      </Suspense>
    </main>
  );
}
