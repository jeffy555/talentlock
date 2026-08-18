import { useEffect, useState } from "react";
import { useDebounce } from "use-debounce";
import { useSearch, useLocation } from "wouter";

function readParams(search: string) {
  const params = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
  return {
    q: params.get("q") ?? "",
    status: params.get("status") ?? "all",
    page: Math.max(1, parseInt(params.get("page") ?? "1", 10) || 1),
  };
}

/**
 * Sync engagement list filters with the URL query string (?q=&status=&page=).
 */
export function useEngagementListQueryState() {
  const searchString = useSearch();
  const [pathname, setLocation] = useLocation();
  const fromUrl = readParams(searchString);

  const [search, setSearch] = useState(fromUrl.q);
  const [status, setStatus] = useState(fromUrl.status || "all");
  const [page, setPage] = useState(fromUrl.page);
  const [debouncedSearch] = useDebounce(search, 400);

  useEffect(() => {
    const params = new URLSearchParams();
    const q = debouncedSearch.trim();
    if (q) params.set("q", q);
    if (status && status !== "all") params.set("status", status);
    if (page > 1) params.set("page", String(page));
    const qs = params.toString();
    const pathOnly = pathname.split("?")[0];
    const next = qs ? `${pathOnly}?${qs}` : pathOnly;
    const current = qs ? `${pathOnly}?${searchString.replace(/^\?/, "")}` : pathOnly;
    // Normalize comparison when searchString has no leading ?
    const currentNorm = searchString
      ? `${pathOnly}?${searchString.replace(/^\?/, "")}`
      : pathOnly;
    if (next !== currentNorm && next !== current) {
      setLocation(next, { replace: true } as any);
    }
  }, [debouncedSearch, status, page, pathname, searchString, setLocation]);

  const onSearchChange = (value: string) => {
    setSearch(value);
    setPage(1);
  };

  const onStatusChange = (value: string) => {
    setStatus(value);
    setPage(1);
  };

  const onPageChange = (newPage: number) => {
    setPage(newPage);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const onClear = () => {
    setSearch("");
    setStatus("all");
    setPage(1);
  };

  const apiStatus = status === "all" ? undefined : status;
  const apiQ = debouncedSearch.trim().length >= 2 ? debouncedSearch.trim() : undefined;

  return {
    search,
    status,
    page,
    apiStatus,
    apiQ,
    onSearchChange,
    onStatusChange,
    onPageChange,
    onClear,
  };
}
