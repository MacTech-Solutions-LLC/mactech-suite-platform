import Link from "next/link";
import { ArrowUp, ArrowDown, ArrowUpDown } from "lucide-react";
import { TableHead } from "@/components/ui/table";
import { cn } from "@/lib/utils";

/**
 * Server-side sortable column header. Reads the current `sort=col:dir` URL
 * param and renders a link to toggle sort direction (or set this column).
 */
export function SortableTableHead({
  label,
  sortKey,
  currentSort,
  basePath,
  searchParams,
  className,
}: {
  label: string;
  sortKey: string;
  currentSort: string | null;
  basePath: string;
  searchParams: Record<string, string | string[] | undefined> | undefined;
  className?: string;
}) {
  const [activeKey, activeDir] = (currentSort ?? "").split(":");
  const isActive = activeKey === sortKey;
  const nextDir = isActive && activeDir === "asc" ? "desc" : "asc";
  const nextValue = `${sortKey}:${nextDir}`;

  const sp = new URLSearchParams();
  if (searchParams) {
    for (const [k, v] of Object.entries(searchParams)) {
      if (k === "sort" || k === "page") continue;
      if (typeof v === "string" && v.length > 0) sp.set(k, v);
    }
  }
  sp.set("sort", nextValue);
  const href = `${basePath}?${sp.toString()}`;

  return (
    <TableHead className={cn("cursor-pointer", className)}>
      <Link
        href={href}
        className="inline-flex items-center gap-1 hover:text-foreground"
      >
        {label}
        {isActive ? (
          activeDir === "desc" ? (
            <ArrowDown className="h-3 w-3 text-foreground" />
          ) : (
            <ArrowUp className="h-3 w-3 text-foreground" />
          )
        ) : (
          <ArrowUpDown className="h-3 w-3 opacity-50" />
        )}
      </Link>
    </TableHead>
  );
}

/**
 * Helper for server pages — parses ?sort=col:dir into Prisma orderBy.
 * Pass an `allowed` map of allowed column → Prisma field name.
 */
export function parseSortParam(
  raw: string | null | undefined,
  allowed: Record<string, string>,
  fallback: { field: string; dir: "asc" | "desc" } = { field: "createdAt", dir: "desc" },
): { orderBy: Record<string, "asc" | "desc">; sort: string } {
  if (!raw) {
    return {
      orderBy: { [fallback.field]: fallback.dir },
      sort: `${fallback.field}:${fallback.dir}`,
    };
  }
  const [key, dir] = raw.split(":");
  const dbField = allowed[key];
  if (!dbField || (dir !== "asc" && dir !== "desc")) {
    return {
      orderBy: { [fallback.field]: fallback.dir },
      sort: `${fallback.field}:${fallback.dir}`,
    };
  }
  return { orderBy: { [dbField]: dir }, sort: `${key}:${dir}` };
}
