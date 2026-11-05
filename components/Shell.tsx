"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";

export interface NavItem {
  href: string;
  label: string;
}

/**
 * The app frame: a sidebar with the estate's sections, and the page beside it.
 * On the estate page the links are sections of one page, and the marker follows the one being read.
 */
export function Shell({ nav, pages, footer, children }: { nav: NavItem[]; pages?: NavItem[]; footer?: ReactNode; children: ReactNode }) {
  const pathname = usePathname();
  const sections = nav.filter((n) => n.href.startsWith("#"));
  const [active, setActive] = useState<string>(sections[0]?.href ?? pathname);
  const list = useRef<HTMLUListElement>(null);
  const [marker, setMarker] = useState<{ top: number; height: number } | null>(null);
  const clicked = useRef(false);
  const clicks = useRef(0);

  function choose(href: string) {
    setActive(href);
    clicked.current = true;
    const mine = ++clicks.current;
    const release = () => {
      // An older click's timer mustn't release a newer click.
      if (clicks.current === mine) clicked.current = false;
      window.removeEventListener("scrollend", release);
    };
    window.addEventListener("scrollend", release);
    // Browsers without scrollend, or a click that doesn't scroll.
    window.setTimeout(release, 2000);
  }

  // Follow the section nearest the top of the screen.
  useEffect(() => {
    if (sections.length === 0) return;
    const seen = new Map<string, boolean>();
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) seen.set(`#${e.target.id}`, e.isIntersecting);
        if (clicked.current) return;
        const first = sections.find((s) => seen.get(s.href));
        if (first) setActive(first.href);
      },
      { rootMargin: "-15% 0px -70% 0px" },
    );
    for (const s of sections) {
      const el = document.getElementById(s.href.slice(1));
      if (el) io.observe(el);
    }
    return () => io.disconnect();
    // The sections don't change while the page is open.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sections.length]);

  const current = sections.length > 0 ? active : pathname;

  useLayoutEffect(() => {
    const link = list.current?.querySelector<HTMLElement>(`[data-href="${CSS.escape(current)}"]`);
    setMarker(link ? { top: link.offsetTop, height: link.offsetHeight } : null);
  }, [current]);

  return (
    <div className="app">
      <aside className="side">
        <Link href="/" className="wordmark">Last Accounts</Link>
        <p className="side-note">For the person settling an estate, alongside their lawyer. Not legal advice.</p>
        <nav aria-label="Sections">
          <ul className="side-nav" ref={list}>
            {marker && <li aria-hidden className="side-marker" style={{ transform: `translateY(${marker.top}px)`, height: marker.height }} />}
            {nav.map((n) => (
              <li key={n.href}>
                {n.href.startsWith("#") ? (
                  <a href={n.href} data-href={n.href} className={current === n.href ? "on" : undefined} onClick={() => choose(n.href)}>
                    {n.label}
                  </a>
                ) : (
                  <Link href={n.href} data-href={n.href} className={current === n.href ? "on" : undefined}>
                    {n.label}
                  </Link>
                )}
              </li>
            ))}
          </ul>
        </nav>
        {pages && pages.length > 0 && (
          <ul className="side-pages">
            {pages.map((p) => (
              <li key={p.href}><Link href={p.href}>{p.label}</Link></li>
            ))}
          </ul>
        )}
        <div className="side-foot">
          {footer}
          <p className="sandbox-tag">PayPal sandbox. Fictional estate, fake money.</p>
        </div>
      </aside>
      <main className="page">{children}</main>
    </div>
  );
}
