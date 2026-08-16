'use client';

import { usePathname } from 'next/navigation';
import { Navbar } from "@/components/layout/navbar";

export default function MainLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const pathname = usePathname();
  const isFullBleed = pathname === '/pusat-niaga' || pathname.startsWith('/chat');

  return (
    <div className="flex-1 flex flex-col min-h-full">
      <Navbar />
      <div
        className={
          isFullBleed
            ? "flex-1 flex flex-col min-h-0 w-full"
            : "flex-1 flex flex-col min-h-0 w-full max-w-[1100px] mx-auto px-8"
        }
      >
        {children}
      </div>
    </div>
  );
}
