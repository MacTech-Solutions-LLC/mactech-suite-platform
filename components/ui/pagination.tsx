import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";

export interface PaginationProps {
  /** Total number of matching rows. */
  total: number;
  /** 1-indexed current page. */
  page: number;
  /** Page size. */
  pageSize: number;
  /** Builds the href for a given page (must preserve other query params). */
  hrefForPage: (page: number) => string;
}

export function Pagination({ total, page, pageSize, hrefForPage }: PaginationProps) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(total, page * pageSize);
  const canPrev = page > 1;
  const canNext = page < totalPages;

  return (
    <div className="flex items-center justify-between gap-3 text-xs text-muted-foreground">
      <span>
        Showing <strong className="text-foreground">{from.toLocaleString()}</strong>–
        <strong className="text-foreground">{to.toLocaleString()}</strong> of{" "}
        <strong className="text-foreground">{total.toLocaleString()}</strong>
      </span>
      <div className="flex items-center gap-1">
        <Button
          asChild
          variant="outline"
          size="sm"
          disabled={!canPrev}
          aria-disabled={!canPrev}
        >
          {canPrev ? (
            <Link href={hrefForPage(page - 1)}>
              <ChevronLeft className="h-3.5 w-3.5" /> Prev
            </Link>
          ) : (
            <span>
              <ChevronLeft className="h-3.5 w-3.5" /> Prev
            </span>
          )}
        </Button>
        <span className="px-2">
          Page <strong className="text-foreground">{page}</strong> of {totalPages}
        </span>
        <Button
          asChild
          variant="outline"
          size="sm"
          disabled={!canNext}
          aria-disabled={!canNext}
        >
          {canNext ? (
            <Link href={hrefForPage(page + 1)}>
              Next <ChevronRight className="h-3.5 w-3.5" />
            </Link>
          ) : (
            <span>
              Next <ChevronRight className="h-3.5 w-3.5" />
            </span>
          )}
        </Button>
      </div>
    </div>
  );
}

export function buildHrefForPage(
  basePath: string,
  searchParams: Record<string, string | string[] | undefined> | undefined,
  newPage: number,
): string {
  const sp = new URLSearchParams();
  if (searchParams) {
    for (const [k, v] of Object.entries(searchParams)) {
      if (k === "page") continue;
      if (typeof v === "string" && v.length > 0) sp.set(k, v);
    }
  }
  if (newPage > 1) sp.set("page", String(newPage));
  const qs = sp.toString();
  return qs ? `${basePath}?${qs}` : basePath;
}
