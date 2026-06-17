import { useCallback, useEffect, useMemo, useState } from "react";
import { Zap } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import type { TokenUsageBreakdown } from "@workspace/api-client-react";
import { nonZeroBreakdownEntries } from "@/lib/tokenUsageUtils";

const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");
const PAGE_SIZE = 20;

type TokenUsageRow = {
  userId: string;
  email: string;
  planId: string;
  planDisplayName: string;
  monthlyTokenLimit: number | null;
  tokensUsed: number;
  percentUsed: number | null;
  breakdown: TokenUsageBreakdown;
};

type TokenUsageResponse = {
  data: TokenUsageRow[];
  total: number;
  page: number;
  pageSize: number;
};

function utcMonthHeading(): string {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toLocaleString("en-US", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

function BreakdownCell({ breakdown }: { breakdown: TokenUsageBreakdown }) {
  const entries = nonZeroBreakdownEntries(breakdown);
  if (entries.length === 0) {
    return <span className="text-muted-foreground">—</span>;
  }

  return (
    <ul className="space-y-0.5 text-xs">
      {entries.map(({ key, label, tokens }) => (
        <li key={key}>
          {label}: {tokens.toLocaleString()}
        </li>
      ))}
    </ul>
  );
}

function formatPercentUsed(row: TokenUsageRow): { text: string; className: string; icon: string | null } {
  if (row.percentUsed === null) {
    return { text: "—", className: "", icon: null };
  }
  const pct = row.percentUsed;
  if (pct >= 100) {
    return { text: `${pct}%`, className: "text-red-600 font-medium", icon: "🚫" };
  }
  if (pct >= 80) {
    return { text: `${pct}%`, className: "text-amber-600 font-medium", icon: "⚠️" };
  }
  return { text: `${pct}%`, className: "", icon: null };
}

async function fetchTokenUsage(page: number): Promise<TokenUsageResponse> {
  const res = await fetch(`${basePath}/api/admin/token-usage?page=${page}`, {
    credentials: "include",
  });
  if (res.status === 401) throw new Error("UNAUTHORIZED");
  if (!res.ok) throw new Error(`Request failed: ${res.status}`);
  return res.json();
}

export function AdminTokenUsageTabIcon() {
  return <Zap className="h-4 w-4" />;
}

export default function AdminTokenUsageTab({ onUnauthorized }: { onUnauthorized: () => void }) {
  const [page, setPage] = useState(1);
  const [rows, setRows] = useState<TokenUsageRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [emailSort, setEmailSort] = useState<"asc" | "desc">("asc");

  const load = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      const result = await fetchTokenUsage(page);
      setRows(result.data);
      setTotal(result.total);
    } catch (err: unknown) {
      if (err instanceof Error && err.message === "UNAUTHORIZED") {
        onUnauthorized();
        return;
      }
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [page, onUnauthorized]);

  useEffect(() => {
    load();
  }, [load]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const isFirstPage = page <= 1;
  const isLastPage = page >= totalPages;

  const sortedRows = useMemo(() => {
    const copy = [...rows];
    copy.sort((a, b) =>
      emailSort === "asc" ? a.email.localeCompare(b.email) : b.email.localeCompare(a.email),
    );
    return copy;
  }, [rows, emailSort]);

  const showEmpty =
    !loading &&
    !error &&
    total > 0 &&
    total <= PAGE_SIZE &&
    rows.every((r) => r.tokensUsed === 0);

  function toggleEmailSort() {
    setEmailSort((prev) => (prev === "asc" ? "desc" : "asc"));
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <CardTitle className="text-base">Token Usage — {utcMonthHeading()}</CardTitle>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" disabled={loading || isFirstPage} onClick={() => setPage((p) => p - 1)}>
            ← Prev
          </Button>
          <Button variant="outline" size="sm" disabled={loading || isLastPage} onClick={() => setPage((p) => p + 1)}>
            Next →
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {error && (
          <Alert variant="destructive">
            <AlertDescription className="flex items-center justify-between gap-4">
              <span>Failed to load token usage data.</span>
              <Button variant="outline" size="sm" onClick={load}>
                Retry
              </Button>
            </AlertDescription>
          </Alert>
        )}

        {loading ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs uppercase text-muted-foreground border-b">
                  <th className="py-2 pr-4">User Email</th>
                  <th className="py-2 pr-4">Plan</th>
                  <th className="py-2 pr-4">MTD Tokens</th>
                  <th className="py-2 pr-4">Limit</th>
                  <th className="py-2 pr-4">% Used</th>
                  <th className="py-2 pr-4">Breakdown</th>
                </tr>
              </thead>
              <tbody>
                {Array.from({ length: PAGE_SIZE }).map((_, i) => (
                  <tr key={i} className="border-b last:border-0">
                    {Array.from({ length: 6 }).map((__, j) => (
                      <td key={j} className="py-2 pr-4">
                        <Skeleton className="h-4 w-full max-w-[120px]" />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : total === 0 || showEmpty ? (
          <p className="text-center py-12 text-muted-foreground">
            No AI token usage recorded for this month.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs uppercase text-muted-foreground border-b">
                  <th className="py-2 pr-4">
                    <button
                      type="button"
                      className="inline-flex items-center gap-1 hover:text-foreground"
                      onClick={toggleEmailSort}
                    >
                      User Email
                      <span className="text-[10px]">{emailSort === "asc" ? "↑" : "↓"}</span>
                    </button>
                  </th>
                  <th className="py-2 pr-4">Plan</th>
                  <th className="py-2 pr-4">MTD Tokens</th>
                  <th className="py-2 pr-4">Limit</th>
                  <th className="py-2 pr-4">% Used</th>
                  <th className="py-2 pr-4">Breakdown</th>
                </tr>
              </thead>
              <tbody>
                {sortedRows.map((row) => {
                  const pct = formatPercentUsed(row);
                  return (
                    <tr key={row.userId} className="border-b last:border-0">
                      <td className="py-2 pr-4">{row.email}</td>
                      <td className="py-2 pr-4">{row.planDisplayName}</td>
                      <td className="py-2 pr-4">{row.tokensUsed.toLocaleString()}</td>
                      <td className="py-2 pr-4">
                        {row.monthlyTokenLimit === null
                          ? "Unlimited"
                          : row.monthlyTokenLimit.toLocaleString()}
                      </td>
                      <td className={`py-2 pr-4 ${pct.className}`}>
                        {pct.text}
                        {pct.icon && <span className="ml-1">{pct.icon}</span>}
                      </td>
                      <td className="py-2 pr-4 align-top">
                        <BreakdownCell breakdown={row.breakdown} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
