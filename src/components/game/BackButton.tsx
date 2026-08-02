"use client";

type Props = {
  onClick: () => void;
  label?: string;
  disabled?: boolean;
};

export function BackButton({ onClick, label = "back", disabled }: Props) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="inline-flex items-center gap-1.5 font-sans text-sm lowercase text-[var(--muted)] transition hover:text-[var(--ink)] disabled:cursor-not-allowed disabled:opacity-35"
    >
      <span aria-hidden className="text-base leading-none">
        ←
      </span>
      {label}
    </button>
  );
}
