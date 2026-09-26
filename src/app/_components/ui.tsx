import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";

type Variant = "primary" | "secondary" | "ghost" | "danger";

const VARIANTS: Record<Variant, string> = {
  primary: "bg-brand text-white active:bg-brand-strong disabled:bg-muted",
  secondary: "bg-surface text-ink border border-line active:bg-canvas",
  ghost: "text-brand active:bg-brand-soft",
  danger: "bg-surface text-danger border border-line active:bg-canvas",
};

export function Button({
  variant = "primary",
  size = "md",
  className = "",
  ...props
}: ComponentProps<"button"> & { variant?: Variant; size?: "md" | "lg" }) {
  const sizing = size === "lg" ? "px-6 py-4 text-lg" : "px-4 py-3 text-base";
  return (
    <button
      className={`rounded-2xl font-semibold transition-colors disabled:opacity-60 ${sizing} ${VARIANTS[variant]} ${className}`}
      {...props}
    />
  );
}

export function LinkButton({
  variant = "primary",
  className = "",
  ...props
}: ComponentProps<typeof Link> & { variant?: Variant }) {
  return (
    <Link
      className={`inline-flex items-center justify-center rounded-2xl px-4 py-3 font-semibold ${VARIANTS[variant]} ${className}`}
      {...props}
    />
  );
}

export function Card({ className = "", ...props }: ComponentProps<"div">) {
  return <div className={`rounded-2xl bg-surface p-4 shadow-sm ${className}`} {...props} />;
}

export function PageHeader({ title, action }: { title: string; action?: ReactNode }) {
  return (
    <header className="flex items-center justify-between gap-4 px-4 pt-6 pb-3">
      <h1 className="text-2xl font-bold">{title}</h1>
      {action}
    </header>
  );
}

export function Badge({ tone = "brand", children }: { tone?: "brand" | "warn" | "muted"; children: ReactNode }) {
  const tones = {
    brand: "bg-brand-soft text-brand-strong",
    warn: "bg-warn-soft text-warn",
    muted: "bg-canvas text-muted",
  };
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-sm font-semibold ${tones[tone]}`}>
      {children}
    </span>
  );
}

export function Spinner({ label }: { label?: string }) {
  return (
    <div className="flex items-center gap-3 text-muted" role="status">
      <span className="h-5 w-5 animate-spin rounded-full border-2 border-line border-t-brand" />
      {label && <span>{label}</span>}
    </div>
  );
}

export function EmptyState({ children }: { children: ReactNode }) {
  return <p className="px-4 py-10 text-center text-lg text-muted">{children}</p>;
}

export function ErrorNote({ children }: { children: ReactNode }) {
  return (
    <p className="rounded-xl bg-warn-soft p-3 text-warn" role="alert">
      {children}
    </p>
  );
}
