"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";

// Integrated into 「AI 研究中心」(/admin/research). This standalone route redirects there.
export default function RedirectToResearch() {
  const router = useRouter();
  useEffect(() => { router.replace("/admin/research?tab=analytics"); }, [router]);
  return null;
}
