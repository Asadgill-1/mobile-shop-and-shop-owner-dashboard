"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/** Re-fetches server data every `seconds` while the tab is visible (~live transcript, PLAN §5.6). */
export function RefreshPoll({ seconds = 10 }: { seconds?: number }) {
  const router = useRouter();
  useEffect(() => {
    const id = setInterval(() => {
      if (document.visibilityState === "visible") router.refresh();
    }, seconds * 1000);
    return () => clearInterval(id);
  }, [router, seconds]);
  return null;
}
