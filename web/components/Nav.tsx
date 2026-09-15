"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  ["/", "Coins"], ["/launch", "Launch"], ["/feed", "Activity"], ["/docs", "Docs"],
] as const;

export default function Nav() {
  const path = usePathname();
  const isOn = (href: string) => (href === "/" ? path === "/" || path.startsWith("/coin/") : path.startsWith(href));
  return (
    <nav className="main" aria-label="Primary">
      {LINKS.map(([href, label]) => (
        <Link key={href} href={href} aria-current={isOn(href) ? "page" : undefined}>{label}</Link>
      ))}
    </nav>
  );
}
