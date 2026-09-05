import type { ReactNode } from "react";

export interface Column {
  key: string;
  header: ReactNode;
  align?: "left" | "right" | "center";
  /** Largura fixa da coluna (ex.: "1px", "120px", "20%"). */
  width?: string;
}

interface TableProps<T> {
  columns: Column[];
  rows: T[];
  renderCell: (row: T, key: string) => ReactNode;
  /** Chave estável por linha. Default: índice. */
  rowKey?: (row: T, index: number) => string | number;
  onRowClick?: (row: T) => void;
  /** Conteúdo quando `rows` está vazio (ex.: <EmptyState />). */
  empty?: ReactNode;
  className?: string;
}

/**
 * Tabela padrão do app: cabeçalho em caixa-alta, divisórias de 1px,
 * hover discreto, scroll horizontal próprio. Colunas `align:"right"`
 * ganham `tabular-nums` — para colunas de dinheiro alinharem na vírgula.
 */
export function Table<T>({
  columns,
  rows,
  renderCell,
  rowKey,
  onRowClick,
  empty,
  className = "",
}: TableProps<T>) {
  if (rows.length === 0 && empty) {
    return <>{empty}</>;
  }

  return (
    <div className="w-full overflow-x-auto">
      <table className={`w-full border-collapse ${className}`}>
        <thead>
          <tr>
            {columns.map((c) => (
              <th
                key={c.key}
                style={{
                  width: c.width,
                  textAlign: c.align ?? "left",
                  color: "var(--text-subtle)",
                  borderBottom: "1px solid var(--border)",
                }}
                className="px-3 pb-2.5 text-[11px] font-semibold uppercase tracking-wider"
              >
                {c.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => {
            const clickable = !!onRowClick;
            const cells = columns.map((c) => ({ ...c, node: renderCell(row, c.key) }));
            const firstNode = cells[0]?.node;
            const labelText =
              typeof firstNode === "string" || typeof firstNode === "number" ? String(firstNode) : undefined;

            return (
              <tr
                key={rowKey ? rowKey(row, i) : i}
                onClick={clickable ? () => onRowClick(row) : undefined}
                onKeyDown={
                  clickable
                    ? (e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          onRowClick(row);
                        }
                      }
                    : undefined
                }
                tabIndex={clickable ? 0 : undefined}
                role={clickable ? "button" : undefined}
                aria-label={clickable ? (labelText ? `Abrir detalhes de ${labelText}` : "Abrir detalhes da linha") : undefined}
                className={`transition-colors hover:bg-[var(--sunken)] ${clickable ? "cursor-pointer nxfi-clickable-focus" : ""}`}
              >
                {cells.map((c) => (
                  <td
                    key={c.key}
                    style={{
                      textAlign: c.align ?? "left",
                      borderBottom: "1px solid var(--border)",
                      color: "var(--text)",
                      fontVariantNumeric: c.align === "right" ? "tabular-nums" : undefined,
                    }}
                    className="px-3 py-3 text-[13px]"
                  >
                    {c.node}
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
