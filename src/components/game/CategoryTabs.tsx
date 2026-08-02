"use client";

import {
  CATEGORY_META,
  PLAYABLE_CATEGORIES,
  type PlayableCategory,
} from "@/lib/categories";

type Props = {
  active: PlayableCategory;
  onChange: (c: PlayableCategory) => void;
  locked?: boolean;
};

export function CategoryTabs({ active, onChange, locked }: Props) {
  return (
    <div className="flex gap-1 border-b border-[var(--ink)]/10">
      {PLAYABLE_CATEGORIES.map((cat) => {
        const isActive = cat === active;
        return (
          <button
            key={cat}
            type="button"
            disabled={locked}
            onClick={() => onChange(cat)}
            className={`relative -mb-px px-4 py-3 font-serif text-lg tracking-wide transition sm:px-5 sm:text-xl ${
              isActive
                ? "text-[var(--ink)]"
                : "text-[var(--muted)] hover:text-[var(--ink)]"
            } disabled:cursor-not-allowed disabled:opacity-40`}
          >
            {CATEGORY_META[cat].label}
            {isActive ? (
              <span className="absolute inset-x-2 bottom-0 h-[3px] bg-[var(--accent)]" />
            ) : null}
          </button>
        );
      })}
    </div>
  );
}
