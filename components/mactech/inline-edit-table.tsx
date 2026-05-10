"use client";

import {
  type CSSProperties,
  type KeyboardEvent,
  useEffect,
  useRef,
  useState,
} from "react";

export interface InlineEditCell {
  value: number;
  state?: "enabled" | "disabled" | "trial";
}

export interface InlineEditTableProps<RowKey extends string, ColKey extends string> {
  rowHeaders: { id: RowKey; label: string }[];
  colHeaders: { id: ColKey; label: string }[];
  cells: Record<RowKey, Record<ColKey, InlineEditCell>>;
  onCommit?: (rowId: RowKey, colId: ColKey, next: InlineEditCell) => void;
  /** Optional total renderer; defaults to summing cells. */
  totalLabel?: string;
  className?: string;
  style?: CSSProperties;
}

const STATE_LABEL: Record<NonNullable<InlineEditCell["state"]>, string> = {
  enabled: "on",
  disabled: "off",
  trial: "trial",
};

const STATE_COLOR: Record<NonNullable<InlineEditCell["state"]>, string> = {
  enabled: "var(--mt-success)",
  disabled: "var(--mt-text-4)",
  trial: "var(--mt-warning)",
};

export function InlineEditTable<
  RowKey extends string,
  ColKey extends string,
>({
  rowHeaders,
  colHeaders,
  cells,
  onCommit,
  totalLabel = "Total active seats",
  className = "",
  style,
}: InlineEditTableProps<RowKey, ColKey>) {
  const [internal, setInternal] = useState(cells);
  const [editing, setEditing] = useState<{ row: RowKey; col: ColKey } | null>(
    null,
  );
  const [draft, setDraft] = useState<string>("");
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    setInternal(cells);
  }, [cells]);

  useEffect(() => {
    if (editing) inputRef.current?.focus();
  }, [editing]);

  function start(row: RowKey, col: ColKey) {
    setEditing({ row, col });
    setDraft(String(internal[row][col].value));
  }

  function commit() {
    if (!editing) return;
    const n = Math.max(0, Math.round(Number(draft)));
    if (Number.isFinite(n)) {
      const next = {
        ...internal,
        [editing.row]: {
          ...internal[editing.row],
          [editing.col]: { ...internal[editing.row][editing.col], value: n },
        },
      };
      setInternal(next);
      onCommit?.(editing.row, editing.col, next[editing.row][editing.col]);
    }
    setEditing(null);
  }

  function onKey(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") {
      e.preventDefault();
      commit();
    } else if (e.key === "Escape") {
      e.preventDefault();
      setEditing(null);
    } else if (e.key === "Tab") {
      e.preventDefault();
      const rowIndex = rowHeaders.findIndex((r) => r.id === editing?.row);
      const colIndex = colHeaders.findIndex((c) => c.id === editing?.col);
      let nextR = rowIndex;
      let nextC = colIndex + (e.shiftKey ? -1 : 1);
      if (nextC >= colHeaders.length) {
        nextC = 0;
        nextR = (rowIndex + 1) % rowHeaders.length;
      } else if (nextC < 0) {
        nextC = colHeaders.length - 1;
        nextR = (rowIndex - 1 + rowHeaders.length) % rowHeaders.length;
      }
      commit();
      requestAnimationFrame(() =>
        start(rowHeaders[nextR].id, colHeaders[nextC].id),
      );
    }
  }

  const total = Object.values(internal).reduce<number>((sum, row) => {
    return (
      sum +
      Object.values(row as Record<string, InlineEditCell>).reduce(
        (rowSum, cell) =>
          rowSum + (cell.state === "disabled" ? 0 : cell.value),
        0,
      )
    );
  }, 0);

  return (
    <div
      className={`overflow-hidden rounded-mt-3 border border-mt-hairline bg-mt-surface-1 ${className}`}
      style={style}
    >
      <table className="w-full border-collapse">
        <thead>
          <tr className="border-b border-mt-hairline bg-mt-surface-2">
            <th className="px-3 py-2 text-left font-mt-mono text-[10px] uppercase tracking-wider text-mt-text-3">
              org / app
            </th>
            {colHeaders.map((c) => (
              <th
                key={c.id}
                className="px-3 py-2 text-left font-mt-mono text-[10px] uppercase tracking-wider text-mt-text-3"
              >
                {c.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rowHeaders.map((r) => (
            <tr
              key={r.id}
              className="border-b border-mt-hairline last:border-b-0"
            >
              <td className="px-3 py-2 font-mt-sans text-sm text-mt-text">
                {r.label}
              </td>
              {colHeaders.map((c) => {
                const cell = internal[r.id][c.id];
                const isEditing =
                  editing?.row === r.id && editing.col === c.id;
                const state = cell.state ?? "enabled";
                return (
                  <td key={c.id} className="px-3 py-2">
                    <button
                      type="button"
                      onClick={() => start(r.id, c.id)}
                      className="group flex w-full items-center justify-between gap-2 rounded-mt-1 px-2 py-1 text-left transition-colors hover:bg-mt-surface-3 focus:outline-none focus-visible:ring-2 focus-visible:ring-mt-accent"
                    >
                      {isEditing ? (
                        <input
                          ref={inputRef}
                          type="number"
                          min={0}
                          value={draft}
                          onChange={(e) => setDraft(e.target.value)}
                          onBlur={commit}
                          onKeyDown={onKey}
                          className="w-16 rounded-mt-1 border border-mt-accent bg-mt-bg-2 px-1.5 py-0.5 font-mt-mono text-sm text-mt-text outline-none"
                          style={{ boxShadow: "0 0 0 3px var(--mt-soft-accent)" }}
                        />
                      ) : (
                        <span className="font-mt-mono text-sm text-mt-text">
                          {cell.value}
                        </span>
                      )}
                      <span
                        className="rounded-full px-1.5 py-px font-mt-mono text-[9px] uppercase tracking-wider"
                        style={{
                          background: "var(--mt-surface-3)",
                          color: STATE_COLOR[state],
                        }}
                      >
                        {STATE_LABEL[state]}
                      </span>
                    </button>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
      <div className="flex items-center justify-between border-t border-mt-hairline bg-mt-surface-2 px-3 py-2">
        <span className="font-mt-mono text-[10px] uppercase tracking-wider text-mt-text-3">
          {totalLabel}
        </span>
        <span className="font-mt-mono text-sm text-mt-text">{total}</span>
      </div>
      <div
        aria-hidden
        className="h-1"
        style={{
          background:
            "linear-gradient(90deg, var(--mt-accent), var(--mt-accent-2))",
        }}
      />
    </div>
  );
}
