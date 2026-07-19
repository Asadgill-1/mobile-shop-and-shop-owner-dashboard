"use server";

import { redirect } from "next/navigation";
import { supabaseAuth } from "@/lib/supabase-auth";

export interface AuthState {
  error: string | null;
}

export async function signIn(_prev: AuthState, formData: FormData): Promise<AuthState> {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  if (!email || !password) return { error: "Enter your email and password." };

  const supabase = await supabaseAuth();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) return { error: "Wrong email or password." };
  redirect("/");
}

export async function signOut(): Promise<void> {
  const supabase = await supabaseAuth();
  await supabase.auth.signOut();
  redirect("/login");
}
