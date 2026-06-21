"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";

export function useScrollRestoration(key: string) {
  const pathname = usePathname();
  const scrollKey = `scroll_${key}_${pathname}`;
  const savedRef = useRef(false);

  // Restore on mount
  useEffect(() => {
    if (savedRef.current) return;
    savedRef.current = true;
    const saved = sessionStorage.getItem(scrollKey);
    if (saved) {
      const top = parseInt(saved, 10);
      // Delay slightly so content has rendered
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          window.scrollTo({ top, behavior: "instant" });
        });
      });
    }
  }, [scrollKey]);

  // Save on beforeunload / link click
  useEffect(() => {
    const save = () => {
      sessionStorage.setItem(scrollKey, String(window.scrollY));
    };
    window.addEventListener("beforeunload", save);
    // Also save when pathname changes (captured before new render)
    return () => {
      save();
      window.removeEventListener("beforeunload", save);
    };
  }, [scrollKey]);
}
