import Link from "next/link";

const ENTRY_LINKS = [
  {
    href: "/",
    label: "3D Avatar",
    description: "Explore the avatar in 3D. Click hotspots, inspect zones.",
    badge: "Interactive",
    icon: "◈",
  },
  {
    href: "/#zones",
    label: "Ad Zones",
    description: "See which brands have claimed avatar zones.",
    badge: "Live",
    icon: "◎",
  },
  {
    href: "/checkout/demo",
    label: "Claim a Zone",
    description: "Reserve a zone and place your brand on the avatar.",
    badge: "Sprint 4+",
    icon: "◉",
  },
] as const;

/**
 * Exactly 3 entry-point links.
 */
export default function EntryLinks() {
  return (
    <section className="flex w-full flex-col items-center gap-6">
      <h2 className="font-serif text-2xl font-semibold text-amber-50">
        Where do you want to go?
      </h2>
      <div className="grid w-full max-w-3xl gap-4 sm:grid-cols-3">
        {ENTRY_LINKS.map((link) => (
          <Link
            key={link.href}
            href={link.href}
            className="group flex flex-col gap-3 rounded-xl border border-white/10 bg-zinc-900/60 p-5 transition-all duration-200 hover:border-amber-200/40 hover:bg-zinc-900 hover:shadow-[0_0_30px_-8px_rgba(251,191,36,0.2)]"
          >
            <div className="flex items-start justify-between">
              <span className="text-2xl text-amber-200/70 group-hover:text-amber-200 transition-colors">
                {link.icon}
              </span>
              <span className="rounded-full border border-amber-200/20 px-2 py-0.5 font-mono text-[10px] text-amber-200/60">
                {link.badge}
              </span>
            </div>
            <span className="font-serif text-lg font-semibold text-amber-50 group-hover:text-white">
              {link.label}
            </span>
            <span className="text-xs text-zinc-400 leading-relaxed">
              {link.description}
            </span>
          </Link>
        ))}
      </div>
    </section>
  );
}
