export function parsePagination(query: { page?: unknown; pageSize?: unknown }) {
  const page = Math.max(1, parseInt(String(query.page ?? "1"), 10) || 1);
  const pageSize = Math.min(Math.max(1, parseInt(String(query.pageSize ?? "20"), 10) || 20), 100);
  const offset = (page - 1) * pageSize;
  return { page, pageSize, offset };
}

export function paginatedResponse<T>(rows: T[], total: number, page: number, pageSize: number) {
  return {
    data: rows,
    total,
    page,
    pageSize,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
  };
}
