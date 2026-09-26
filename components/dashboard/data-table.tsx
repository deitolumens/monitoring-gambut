"use client";

import { useState, useMemo } from "react";
import { Download, Search, ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { SoilReading, NodeId } from "@/lib/types";

interface DataTableProps {
  data: SoilReading[];
  nodeId: NodeId;
  exportToCsv: (data: SoilReading[], filename: string) => void;
  formatTimestamp: (iso: string) => string;
  getMoistureColor: (moisture: number) => string;
}

const PAGE_SIZE = 10;

export function DataTable({
  data,
  nodeId,
  exportToCsv,
  formatTimestamp,
  getMoistureColor,
}: DataTableProps) {
  const [search, setSearch] = useState("");
  const [depthFilter, setDepthFilter] = useState<string>("all");
  const [page, setPage] = useState(0);

  const filtered = useMemo(() => {
    return data.filter((row) => {
      const matchesSearch =
        search === "" ||
        row.nodeId.toLowerCase().includes(search.toLowerCase()) ||
        formatTimestamp(row.timestamp).toLowerCase().includes(search.toLowerCase());
      const matchesDepth = depthFilter === "all" || row.depth.toString() === depthFilter;
      return matchesSearch && matchesDepth;
    });
  }, [data, search, depthFilter]);

  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);
  const pageData = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  const handleExport = () => {
    exportToCsv(filtered, `node-${nodeId}-moisture-data.csv`);
  };

  const resetPage = () => setPage(0);

  return (
    <div className="rounded-lg border bg-card shadow-sm">
      <div className="flex flex-col gap-4 border-b p-6">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold tracking-tight">Historical Data Log</h3>
          <Button onClick={handleExport} variant="default" size="sm">
            <Download className="mr-2 h-4 w-4" />
            Export to CSV
          </Button>
        </div>
        <div className="flex flex-wrap gap-3">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search by node or timestamp..."
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                resetPage();
              }}
              className="pl-9"
            />
          </div>
          <Select
            value={depthFilter}
            onValueChange={(v) => {
              setDepthFilter(v);
              resetPage();
            }}
          >
            <SelectTrigger className="w-[140px]">
              <SelectValue placeholder="Filter depth" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Depths</SelectItem>
              <SelectItem value="50">50 cm</SelectItem>
              <SelectItem value="100">100 cm</SelectItem>
              <SelectItem value="150">150 cm</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead className="w-[180px]">Timestamp</TableHead>
              <TableHead>Node ID</TableHead>
              <TableHead>Depth (cm)</TableHead>
              <TableHead>Moisture (%)</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {pageData.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={4} className="h-24 text-center text-muted-foreground">
                  No measurements found.
                </TableCell>
              </TableRow>
            ) : (
              pageData.map((row, i) => {
                const color = getMoistureColor(row.moisture);
                return (
                  <TableRow key={`${row.timestamp}-${row.depth}-${i}`}>
                    <TableCell className="font-mono text-xs">
                      {formatTimestamp(row.timestamp)}
                    </TableCell>
                    <TableCell>
                      <span className="rounded-md bg-secondary px-2 py-0.5 text-xs font-medium">
                        {row.nodeId}
                      </span>
                    </TableCell>
                    <TableCell>{row.depth} cm</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <div
                          className="h-2 w-2 rounded-full"
                          style={{ backgroundColor: color }}
                        />
                        <span className="font-medium">{row.moisture.toFixed(1)}%</span>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-between border-t p-4">
          <span className="text-sm text-muted-foreground">
            Page {page + 1} of {totalPages} ({filtered.length} records)
          </span>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage((p) => Math.max(0, p - 1))}
              disabled={page === 0}
            >
              <ChevronLeft className="mr-1 h-4 w-4" />
              Prev
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
              disabled={page >= totalPages - 1}
            >
              Next
              <ChevronRight className="ml-1 h-4 w-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
