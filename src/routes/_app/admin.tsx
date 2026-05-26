import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useCallback, useMemo, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQueryClient } from "@tanstack/react-query";
import Papa from "papaparse";
import * as XLSX from "xlsx";
import { toast } from "sonner";
import { Upload, FileSpreadsheet, CheckCircle2, AlertTriangle, Download, Trash2 } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { importMatches, wipeMatches } from "@/lib/admin.functions";

const ADMIN_EMPLOYEE_ID = "50161635";

const CSV_TEMPLATE =
  "home_team,away_team,match_time,stage_name\n" +
  "Brazil,Argentina,2026-06-11T18:00:00Z,Group Stage\n" +
  "France,Germany,2026-06-11T21:00:00Z,Group Stage\n";

export const Route = createFileRoute("/_app/admin")({
  head: () => ({ meta: [{ title: "Admin Dashboard — Goal Gurus" }] }),
  component: AdminPage,
});

type Row = {
  home_team: string;
  away_team: string;
  match_time: string;
  stage_name?: string | null;
  status?: string | null;
};

function normalizeRows(raw: Record<string, unknown>[]): Row[] {
  // Accept either header names or positional columns.
  return raw
    .map((r) => {
      const keys = Object.keys(r);
      const get = (name: string, idx: number) => {
        const k = keys.find((x) => x.toLowerCase().replace(/\s+/g, "_") === name);
        const v = k ? r[k] : r[keys[idx]];
        return v == null ? "" : String(v).trim();
      };
      return {
        home_team: get("home_team", 0),
        away_team: get("away_team", 1),
        match_time: get("match_time", 2),
        stage_name: get("stage_name", 3) || null,
        status: get("status", 4) || "upcoming",
      };
    })
    .filter((r) => r.home_team && r.away_team && r.match_time);
}

function AdminPage() {
  const { profile, loading } = useAuth();
  const nav = useNavigate();
  const queryClient = useQueryClient();
  const importFn = useServerFn(importMatches);
  const wipeFn = useServerFn(wipeMatches);
  const [rows, setRows] = useState<Row[]>([]);
  const [filename, setFilename] = useState<string>("");
  const [busy, setBusy] = useState(false);
  const [wiping, setWiping] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Hard guard: ONLY employee 50161635 may see this view.
  if (loading) {
    return <div className="text-sm text-muted-foreground">Loading…</div>;
  }
  if (!profile || profile.employee_id !== ADMIN_EMPLOYEE_ID) {
    return (
      <div className="min-h-[60vh] flex flex-col items-center justify-center text-center gap-3">
        <p className="text-6xl font-black tracking-tight">404</p>
        <p className="text-sm text-muted-foreground">This page does not exist.</p>
        <button
          onClick={() => nav({ to: "/" })}
          className="mt-2 px-4 py-2 rounded-lg text-xs font-bold uppercase tracking-wider"
          style={{ background: "var(--gradient-primary)", color: "#fff" }}
        >
          Back to Home
        </button>
      </div>
    );
  }

  const handleFile = useCallback(async (file: File) => {
    setFilename(file.name);
    const ext = file.name.split(".").pop()?.toLowerCase();
    try {
      let raw: Record<string, unknown>[] = [];
      if (ext === "csv" || file.type === "text/csv") {
        const text = await file.text();
        const parsed = Papa.parse<Record<string, unknown>>(text, {
          header: true,
          skipEmptyLines: true,
        });
        raw = parsed.data;
      } else {
        const buf = await file.arrayBuffer();
        const wb = XLSX.read(buf, { type: "array" });
        const sheet = wb.Sheets[wb.SheetNames[0]];
        raw = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: "" });
      }
      const norm = normalizeRows(raw);
      if (norm.length === 0) {
        toast.error("No valid rows found. Check columns: home_team, away_team, match_time, stage_name, status.");
        return;
      }
      setRows(norm);
      toast.success(`Parsed ${norm.length} match${norm.length === 1 ? "" : "es"} — ready to sync.`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to parse file");
    }
  }, []);

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const f = e.dataTransfer.files?.[0];
    if (f) handleFile(f);
  };

  const synchronize = async () => {
    if (!profile || !rows.length) return;
    setBusy(true);
    try {
      const r = await importFn({
        data: { adminEmployeeId: profile.employee_id, matches: rows },
      });
      toast.success(`Successfully imported ${r.inserted} official FIFA matches!`);
      await queryClient.invalidateQueries({ queryKey: ["matches"] });
      setRows([]);
      setFilename("");
      nav({ to: "/" });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Import failed");
    } finally {
      setBusy(false);
    }
  };

  const downloadTemplate = () => {
    const blob = new Blob([CSV_TEMPLATE], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "fifa_2026_schedule_template.csv";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const wipeAll = async () => {
    if (!profile) return;
    const ok = window.confirm(
      "Are you sure you want to wipe all schedule data? This will clear all visible matches for your users.",
    );
    if (!ok) return;
    setWiping(true);
    try {
      const r = await wipeFn({ data: { adminEmployeeId: profile.employee_id } });
      toast.success(`Cleared ${r.deleted} matches.`);
      setRows([]);
      setFilename("");
      await queryClient.invalidateQueries({ queryKey: ["matches"] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Wipe failed");
    } finally {
      setWiping(false);
    }
  };

  const preview = useMemo(() => rows.slice(0, 6), [rows]);

  return (
    <div className="space-y-6">
      <header>
        <p className="text-[11px] uppercase tracking-[0.18em] font-bold text-[color:var(--primary-glow)]">
          Admin Console
        </p>
        <h1 className="text-2xl font-black mt-1">FIFA 2026 Timetable Importer</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Upload an Excel or CSV file with the official schedule. Existing matches will be replaced.
        </p>
      </header>

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={downloadTemplate}
          className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-[var(--primary-glow)] underline-offset-4 hover:underline"
        >
          <Download size={14} />
          Download CSV Template File
        </button>
        <button
          type="button"
          onClick={wipeAll}
          disabled={wiping}
          className="ml-auto inline-flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold uppercase tracking-wider border border-red-500/40 text-red-300 hover:bg-red-500/10 disabled:opacity-60"
        >
          <Trash2 size={14} />
          {wiping ? "Clearing…" : "Clear All Matches Data"}
        </button>
      </div>

      <section
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={onDrop}
        onClick={() => inputRef.current?.click()}
        className={`glossy-card p-8 text-center cursor-pointer border-2 border-dashed transition ${
          dragOver ? "border-[var(--primary-glow)] bg-white/5" : "border-white/15"
        }`}
      >
        <div
          className="mx-auto w-14 h-14 rounded-2xl flex items-center justify-center mb-3"
          style={{ background: "var(--gradient-primary)", boxShadow: "var(--shadow-glow-primary)" }}
        >
          <Upload className="text-white" size={22} />
        </div>
        <p className="text-sm font-bold uppercase tracking-wider">
          Upload FIFA 2026 Match Timetable (Excel/CSV Format)
        </p>
        <p className="text-xs text-muted-foreground mt-1">
          Drag &amp; drop or click to choose. Columns: home_team, away_team, match_time, stage_name, status.
        </p>
        <input
          ref={inputRef}
          type="file"
          accept=".csv,.xlsx,.xls,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) handleFile(f);
            e.currentTarget.value = "";
          }}
        />
      </section>

      {rows.length > 0 && (
        <section className="glossy-card p-5 space-y-4">
          <div className="flex items-center gap-2 text-sm">
            <FileSpreadsheet size={16} className="text-[var(--primary-glow)]" />
            <span className="font-semibold">{filename}</span>
            <span className="text-muted-foreground">— {rows.length} rows parsed</span>
          </div>
          <div className="overflow-x-auto rounded-lg border border-white/10">
            <table className="w-full text-xs">
              <thead className="bg-white/5 text-muted-foreground uppercase tracking-wider">
                <tr>
                  <th className="text-left px-3 py-2">Home</th>
                  <th className="text-left px-3 py-2">Away</th>
                  <th className="text-left px-3 py-2">Kickoff</th>
                  <th className="text-left px-3 py-2">Stage</th>
                  <th className="text-left px-3 py-2">Status</th>
                </tr>
              </thead>
              <tbody>
                {preview.map((r, i) => (
                  <tr key={i} className="border-t border-white/5">
                    <td className="px-3 py-2">{r.home_team}</td>
                    <td className="px-3 py-2">{r.away_team}</td>
                    <td className="px-3 py-2">{r.match_time}</td>
                    <td className="px-3 py-2">{r.stage_name ?? "—"}</td>
                    <td className="px-3 py-2">{r.status ?? "upcoming"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {rows.length > preview.length && (
              <p className="px-3 py-2 text-[11px] text-muted-foreground">
                Showing first {preview.length} of {rows.length} rows.
              </p>
            )}
          </div>

          <div className="flex items-center gap-2 text-xs text-amber-400/90">
            <AlertTriangle size={14} />
            Synchronizing will permanently delete all existing matches before inserting these rows.
          </div>

          <button
            type="button"
            disabled={busy}
            onClick={synchronize}
            className="w-full py-3 rounded-xl font-bold uppercase tracking-wider text-white flex items-center justify-center gap-2 disabled:opacity-60"
            style={{
              background: "linear-gradient(135deg, #16a34a 0%, #4ade80 100%)",
              boxShadow: "0 10px 30px -10px rgba(34,197,94,0.55)",
            }}
          >
            <CheckCircle2 size={18} />
            {busy ? "Synchronizing…" : "Process and Synchronize Timetable"}
          </button>
        </section>
      )}
    </div>
  );
}