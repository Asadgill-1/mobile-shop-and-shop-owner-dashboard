"use client";

import { useEffect, useState } from "react";
import { Moon, Sun } from "lucide-react";

function currentTheme(): "light" | "dark" {
  const set = document.documentElement.dataset.theme;
  if (set === "light" || set === "dark") return set;
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

export function ThemeToggle() {
  const [theme, setTheme] = useState<"light" | "dark" | null>(null);

  useEffect(() => setTheme(currentTheme()), []);

  const flip = () => {
    const next = currentTheme() === "dark" ? "light" : "dark";
    document.documentElement.dataset.theme = next;
    try {
      localStorage.setItem("theme", next);
    } catch {}
    setTheme(next);
  };

  return (
    <button
      type="button"
      onClick={flip}
      aria-label={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
      className="pressable cursor-pointer rounded-xl border border-border bg-surface p-2.5 text-subtle hover:text-foreground min-w-11 min-h-11 flex items-center justify-center"
    >
      {theme === "dark" ? (
        <Sun className="size-5" strokeWidth={2} aria-hidden />
      ) : (
        <Moon className="size-5" strokeWidth={2} aria-hidden />
      )}
    </button>
  );
}
