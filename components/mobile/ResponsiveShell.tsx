"use client";

import { useState } from "react";
import MobileHeader from "./MobileHeader";
import MobileDrawer from "./MobileDrawer";
import MobileBottomNav from "./MobileBottomNav";

export default function ResponsiveShell({ children }: { children: React.ReactNode }) {
  const [drawerOpen, setDrawerOpen] = useState(false);

  return (
    <>
      <MobileHeader onMenuClick={() => setDrawerOpen(true)} />
      <MobileDrawer open={drawerOpen} onClose={() => setDrawerOpen(false)} />
      {children}
      <MobileBottomNav />
    </>
  );
}
