import { Spinner } from "@/components/ui/spinner";

export default function Loading() {
  return (
    <div className="text-muted-foreground flex items-center justify-center gap-2 py-20">
      <Spinner />
      <span className="text-sm">Loading…</span>
    </div>
  );
}
