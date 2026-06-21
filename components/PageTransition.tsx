"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";

export default function PageTransition({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [key, setKey] = useState(pathname);
  const [showProgress, setShowProgress] = useState(false);
  const prevRef = useRef(pathname);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (pathname !== prevRef.current) {
      prevRef.current = pathname;
      setShowProgress(true);
      setKey(pathname);
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => setShowProgress(false), 700);
    }
  }, [pathname]);

  return (
    <>
      {showProgress && <div className="nav-progress-bar" />}
      <div key={key} className="page-enter">
        {children}
      </div>
    </>
  );
}
