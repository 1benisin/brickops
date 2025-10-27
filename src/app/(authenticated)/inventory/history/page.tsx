"use client";

import { useEffect, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { HistoryDataTable } from "@/components/inventory/HistoryDataTable";
import type { InventoryHistoryEntry } from "@/components/inventory/data-table/history-columns";

export default function InventoryChangeHistoryPage() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [search, setSearch] = useState("");
  const [action, setAction] = useState<"any" | "create" | "update" | "delete">("any");
  const [actor, setActor] = useState<"any" | string>("any");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  const base = useQuery(api.inventory.queries.listInventoryHistory, {});
  const members = useQuery(api.users.queries.listMembers, {});
  const dateFromMs = useMemo(
    () => (dateFrom ? new Date(dateFrom).setHours(0, 0, 0, 0) : undefined),
    [dateFrom],
  );
  const dateToMs = useMemo(
    () => (dateTo ? new Date(dateTo).setHours(23, 59, 59, 999) : undefined),
    [dateTo],
  );
  const searchResults = useQuery(
    api.inventory.queries.listInventoryHistory,
    search || action !== "any" || actor !== "any" || dateFrom || dateTo
      ? {
          query: search || undefined,
          action: action === "any" ? undefined : (action as any), // eslint-disable-line @typescript-eslint/no-explicit-any
          userId: actor === "any" ? undefined : (actor as any), // eslint-disable-line @typescript-eslint/no-explicit-any
          dateFrom: dateFromMs,
          dateTo: dateToMs,
        }
      : ("skip" as const),
  );

  const history = useMemo(() => {
    if (search || action !== "any") return searchResults;
    return base;
  }, [base, searchResults, search, action]);

  // Initialize state from URL on first render
  useEffect(() => {
    const sp = searchParams;
    const s = sp.get("q") || "";
    const act = (sp.get("action") as "any" | "create" | "update" | "delete") || "any";
    const ac = sp.get("actor") || "any";
    const df = sp.get("from") || "";
    const dt = sp.get("to") || "";
    setSearch(s);
    setAction(act);
    setActor(ac as "any" as "any" | string);
    setDateFrom(df);
    setDateTo(dt);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Keep URL in sync with state
  useEffect(() => {
    const params = new URLSearchParams();
    if (search) params.set("q", search);
    if (action !== "any") params.set("action", action);
    if (actor !== "any") params.set("actor", actor);
    if (dateFrom) params.set("from", dateFrom);
    if (dateTo) params.set("to", dateTo);
    const qs = params.toString();
    // Next.js RouteImpl typing is strict; cast to string and ignore type for replace
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (router.replace as any)(`${pathname}${qs ? `?${qs}` : ""}`);
  }, [search, action, actor, dateFrom, dateTo, router, pathname]);

  const isLoading = history === undefined;

  if (isLoading) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">
          Inventory Change History
        </h1>
        <Card className="p-4">
          <div className="space-y-2">
            {[...Array(6)].map((_, i) => (
              <Skeleton key={i} className="h-10 w-full" />
            ))}
          </div>
        </Card>
      </div>
    );
  }

  if (history === null) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">
          Inventory Change History
        </h1>
        <div className="text-muted-foreground">Unable to load change history.</div>
      </div>
    );
  }

  const entries = history.entries as InventoryHistoryEntry[];

  return (
    <div className="space-y-4 h-full flex flex-col">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">
          Inventory Change History
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Review all inventory changes. Green rows show the new state, red rows show the previous
          state.
        </p>
      </div>

      {/* Filters */}
      <Card className="p-4">
        <div className="grid gap-3 md:grid-cols-6">
          <div className="md:col-span-2">
            <label htmlFor="history-search" className="text-xs text-muted-foreground">
              Search (reason or item id)
            </label>
            <Input
              id="history-search"
              placeholder="e.g. reason text or item id"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <div>
            <label
              className="text-xs text-muted-foreground"
              id="action-type-label"
              htmlFor="action-type"
            >
              Action
            </label>
            <Select
              value={action}
              onValueChange={(v: "any" | "create" | "update" | "delete") => setAction(v)}
            >
              <SelectTrigger id="action-type" aria-labelledby="action-type-label">
                <SelectValue placeholder="Any" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="any">Any</SelectItem>
                <SelectItem value="create">Create</SelectItem>
                <SelectItem value="update">Update</SelectItem>
                <SelectItem value="delete">Delete</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-xs text-muted-foreground" id="actor-label" htmlFor="actor">
              Actor
            </label>
            <Select value={actor} onValueChange={(v) => setActor(v)}>
              <SelectTrigger id="actor" aria-labelledby="actor-label">
                <SelectValue placeholder="Any" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="any">Any</SelectItem>
                {(members || []).map((m) => (
                  <SelectItem key={m._id} value={String(m._id)}>
                    {m.firstName || m.lastName
                      ? `${m.firstName ?? ""} ${m.lastName ?? ""}`.trim()
                      : m.name || m.email || String(m._id)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <label htmlFor="date-from" className="text-xs text-muted-foreground">
              From
            </label>
            <Input
              id="date-from"
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
            />
          </div>
          <div>
            <label htmlFor="date-to" className="text-xs text-muted-foreground">
              To
            </label>
            <Input
              id="date-to"
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
            />
          </div>
          <div className="flex items-end">
            <Button
              variant="outline"
              onClick={() => {
                setSearch("");
                setAction("any");
                setActor("any");
                setDateFrom("");
                setDateTo("");
              }}
            >
              Clear
            </Button>
          </div>
        </div>
      </Card>

      {/* History Table */}
      <Card className="flex-1 overflow-hidden flex flex-col">
        <HistoryDataTable data={entries} />
      </Card>
    </div>
  );
}
