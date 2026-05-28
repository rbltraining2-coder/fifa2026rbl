import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useCallback, useMemo, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import Papa from "papaparse";
import * as XLSX from "xlsx";
import { toast } from "sonner";
import { Upload, FileSpreadsheet, CheckCircle2, AlertTriangle, Download, Trash2, Search, UserPlus } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import {
  importMatches,
  wipeMatches,
  importEligibleEmployees,
  addEligibleEmployee,
  listAllUsers,
  deleteUserEverywhere,
  addMatchManually,
} from "@/lib/admin.functions";
import {
  triggerScoreSync,
  recalculateLeaderboard,
  completeMatchManually,
  updateMatchScores,
  listMatchesForAdmin,
  listSyncLogs,
  type AdminMatchRow,
  type SyncLogRow,
} from "@/lib/admin-tools.functions";
import { formatIstShort, IST_LABEL } from "@/lib/ist";
import { istLocalInputToUtcIso } from "@/lib/ist";

const ADMIN_EMPLOYEE_ID = "50161635";

const CSV_TEMPLATE =
  "home_team,away_team,match_time,stage_name\n" +
  "Brazil,Argentina,2026-06-11T18:00:00Z,Group Stage\n" +
  "France,Germany,2026-06-11T21:00:00Z,Group Stage\n";

const USERS_CSV_TEMPLATE =
  "employee_id,date_of_birth,name\n" +
  "99999999,01/01/1990,John Doe\n";

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
  const importUsersFn = useServerFn(importEligibleEmployees);
  const addUserFn = useServerFn(addEligibleEmployee);
  const listUsersFn = useServerFn(listAllUsers);
  const deleteUserFn = useServerFn(deleteUserEverywhere);
  const addMatchFn = useServerFn(addMatchManually);
  const [rows, setRows] = useState<Row[]>([]);
  const [filename, setFilename] = useState<string>("");
  const [busy, setBusy] = useState(false);
  const [wiping, setWiping] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const [tab, setTab] = useState<"matches" | "users" | "tools" | "sync">("matches");
  const [userBusy, setUserBusy] = useState(false);
  const [userDragOver, setUserDragOver] = useState(false);
  const userInputRef = useRef<HTMLInputElement>(null);
  const [manual, setManual] = useState({ employee_id: "", name: "", date_of_birth: "" });
  const [adding, setAdding] = useState(false);
  const [manualMatch, setManualMatch] = useState({
    home_team: "",
    away_team: "",
    match_time: "",
    stage_name: "",
  });
  const [addingMatch, setAddingMatch] = useState(false);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);
  const PAGE_SIZE = 10;

  const usersQuery = useQuery({
    queryKey: ["admin-users"],
    queryFn: () =>
      listUsersFn({ data: { adminEmployeeId: ADMIN_EMPLOYEE_ID } }),
    enabled: profile?.employee_id === ADMIN_EMPLOYEE_ID && tab === "users",
  });

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

  const downloadUsersTemplate = () => {
    const blob = new Blob([USERS_CSV_TEMPLATE], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "eligible_employees_template.csv";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleUsersFile = async (file: File) => {
    if (!profile) return;
    const ext = file.name.split(".").pop()?.toLowerCase();
    setUserBusy(true);
    try {
      let raw: Record<string, unknown>[] = [];
      if (ext === "csv" || file.type === "text/csv") {
        const text = await file.text();
        raw = Papa.parse<Record<string, unknown>>(text, {
          header: true,
          skipEmptyLines: true,
        }).data;
      } else {
        const buf = await file.arrayBuffer();
        const wb = XLSX.read(buf, { type: "array" });
        const sheet = wb.Sheets[wb.SheetNames[0]];
        raw = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: "" });
      }
      const employees = raw
        .map((r) => {
          const keys = Object.keys(r);
          const get = (name: string, idx: number) => {
            const k = keys.find((x) => x.toLowerCase().replace(/\s+/g, "_") === name);
            const v = k ? r[k] : r[keys[idx]];
            return v == null ? "" : String(v).trim();
          };
          return {
            employee_id: get("employee_id", 0),
            date_of_birth: get("date_of_birth", 1),
            name: get("name", 2),
          };
        })
        .filter((e) => e.employee_id && e.date_of_birth && e.name);
      if (employees.length === 0) {
        toast.error("No valid rows. Expected columns: employee_id, date_of_birth, name.");
        return;
      }
      const r = await importUsersFn({
        data: { adminEmployeeId: profile.employee_id, employees },
      });
      toast.success(`Successfully added ${r.inserted} eligible employees to the master roster!`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "User import failed");
    } finally {
      setUserBusy(false);
    }
  };

  return (
    <div className="space-y-6">
      <header>
        <p className="text-[11px] uppercase tracking-[0.18em] font-bold text-[color:var(--primary-glow)]">
          Admin Console
        </p>
        <h1 className="text-2xl font-black mt-1">Admin Dashboard</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Manage the FIFA 2026 timetable and the corporate master roster of eligible players.
        </p>
      </header>

      <div className="grid grid-cols-4 gap-1 p-1 rounded-xl bg-black/40 border border-white/10 max-w-2xl">
        {(["matches", "users", "tools", "sync"] as const).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className="py-2 rounded-lg text-xs font-bold uppercase tracking-widest transition"
            style={
              tab === t
                ? { background: "var(--gradient-primary)", color: "#fff", boxShadow: "var(--shadow-glow-primary)" }
                : { color: "rgba(209,212,209,0.65)" }
            }
          >
            {t === "matches"
              ? "Match Schedule"
              : t === "users"
              ? "User Management"
              : t === "tools"
              ? "Admin Tools"
              : "Auto-Sync"}
          </button>
        ))}
      </div>

      {tab === "matches" && (
        <>
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

      <section className="glossy-card p-5 space-y-4">
        <div className="flex items-center gap-2">
          <CheckCircle2 size={16} style={{ color: "#FF6500" }} />
          <h3 className="text-sm font-bold uppercase tracking-wider">Add Match Manually</h3>
        </div>
        <p className="text-xs text-muted-foreground">
          Quickly add a single fixture without uploading a spreadsheet. It will be inserted as
          <span className="font-semibold"> scheduled</span> with both scores at 0.
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <label className="space-y-1">
            <span className="text-[10px] uppercase tracking-widest text-muted-foreground">Home Team</span>
            <input
              value={manualMatch.home_team}
              onChange={(e) => setManualMatch((m) => ({ ...m, home_team: e.target.value }))}
              placeholder="e.g. Brazil"
              maxLength={64}
              className="w-full rounded-lg px-3 py-2 text-sm bg-black/40 border border-white/10 focus:border-[#FF6500] outline-none"
            />
          </label>
          <label className="space-y-1">
            <span className="text-[10px] uppercase tracking-widest text-muted-foreground">Away Team</span>
            <input
              value={manualMatch.away_team}
              onChange={(e) => setManualMatch((m) => ({ ...m, away_team: e.target.value }))}
              placeholder="e.g. Argentina"
              maxLength={64}
              className="w-full rounded-lg px-3 py-2 text-sm bg-black/40 border border-white/10 focus:border-[#FF6500] outline-none"
            />
          </label>
          <label className="space-y-1">
            <span className="text-[10px] uppercase tracking-widest text-muted-foreground">
              Match Date &amp; Time ({IST_LABEL})
            </span>
            <input
              type="datetime-local"
              value={manualMatch.match_time}
              onChange={(e) => setManualMatch((m) => ({ ...m, match_time: e.target.value }))}
              className="w-full rounded-lg px-3 py-2 text-sm bg-black/40 border border-white/10 focus:border-[#FF6500] outline-none"
            />
            <span className="text-[10px] text-muted-foreground">
              Enter the Indian kick-off time — it will be stored in UTC.
            </span>
          </label>
          <label className="space-y-1">
            <span className="text-[10px] uppercase tracking-widest text-muted-foreground">Stage / Group</span>
            <input
              list="stage-options"
              value={manualMatch.stage_name}
              onChange={(e) => setManualMatch((m) => ({ ...m, stage_name: e.target.value }))}
              placeholder="Group A, Round of 16, Friendly…"
              maxLength={64}
              className="w-full rounded-lg px-3 py-2 text-sm bg-black/40 border border-white/10 focus:border-[#FF6500] outline-none"
            />
            <datalist id="stage-options">
              <option value="Group A" />
              <option value="Group B" />
              <option value="Group C" />
              <option value="Group D" />
              <option value="Group E" />
              <option value="Group F" />
              <option value="Group G" />
              <option value="Group H" />
              <option value="Round of 32" />
              <option value="Round of 16" />
              <option value="Quarter-finals" />
              <option value="Semi-finals" />
              <option value="Third-place Play-off" />
              <option value="Final" />
              <option value="Friendly" />
            </datalist>
          </label>
        </div>
        <button
          type="button"
          disabled={
            addingMatch ||
            !manualMatch.home_team.trim() ||
            !manualMatch.away_team.trim() ||
            !manualMatch.match_time.trim()
          }
          onClick={async () => {
            if (!profile) return;
            if (
              manualMatch.home_team.trim().toLowerCase() ===
              manualMatch.away_team.trim().toLowerCase()
            ) {
              toast.error("Home and away teams must be different.");
              return;
            }
            setAddingMatch(true);
            try {
              await addMatchFn({
                data: {
                  adminEmployeeId: profile.employee_id,
                  home_team: manualMatch.home_team.trim(),
                  away_team: manualMatch.away_team.trim(),
                  match_time:
                    istLocalInputToUtcIso(manualMatch.match_time) ||
                    manualMatch.match_time,
                  stage_name: manualMatch.stage_name.trim() || null,
                },
              });
              toast.success(
                `Match added: ${manualMatch.home_team} vs ${manualMatch.away_team}`,
              );
              setManualMatch({ home_team: "", away_team: "", match_time: "", stage_name: "" });
              await queryClient.invalidateQueries({ queryKey: ["matches"] });
            } catch (err) {
              toast.error(err instanceof Error ? err.message : "Failed to add match");
            } finally {
              setAddingMatch(false);
            }
          }}
          className="w-full sm:w-auto px-6 py-3 rounded-xl font-bold uppercase tracking-wider text-white flex items-center justify-center gap-2 disabled:opacity-60"
          style={{
            background: "linear-gradient(135deg, #FF6500 0%, #ff8a3d 100%)",
            boxShadow: "0 10px 30px -10px rgba(255,101,0,0.55)",
          }}
        >
          <UserPlus size={16} />
          {addingMatch ? "Adding…" : "Add Match"}
        </button>
      </section>
        </>
      )}

      {tab === "users" && (
        <div className="space-y-4">
          {/* Manual add */}
          <section className="glossy-card p-5 space-y-4">
            <div className="flex items-center gap-2">
              <UserPlus size={16} className="text-[var(--primary)]" />
              <h3 className="text-sm font-bold uppercase tracking-wider">Add Single Employee</h3>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <input
                value={manual.employee_id}
                onChange={(e) => setManual((m) => ({ ...m, employee_id: e.target.value }))}
                placeholder="Employee ID"
                className="rounded-lg px-3 py-2 text-sm bg-black/40 border border-white/10 focus:border-[var(--primary)] outline-none"
              />
              <input
                value={manual.name}
                onChange={(e) => setManual((m) => ({ ...m, name: e.target.value }))}
                placeholder="Full Name"
                className="rounded-lg px-3 py-2 text-sm bg-black/40 border border-white/10 focus:border-[var(--primary)] outline-none"
              />
              <input
                value={manual.date_of_birth}
                onChange={(e) => setManual((m) => ({ ...m, date_of_birth: e.target.value }))}
                placeholder="DOB (DD/MM/YYYY)"
                className="rounded-lg px-3 py-2 text-sm bg-black/40 border border-white/10 focus:border-[var(--primary)] outline-none"
              />
            </div>
            <button
              type="button"
              disabled={adding || !manual.employee_id || !manual.name || !manual.date_of_birth}
              onClick={async () => {
                if (!profile) return;
                setAdding(true);
                try {
                  await addUserFn({
                    data: {
                      adminEmployeeId: profile.employee_id,
                      ...manual,
                    },
                  });
                  toast.success(`Added ${manual.name} to the master roster.`);
                  setManual({ employee_id: "", name: "", date_of_birth: "" });
                  await queryClient.invalidateQueries({ queryKey: ["admin-users"] });
                } catch (err) {
                  toast.error(err instanceof Error ? err.message : "Add failed");
                } finally {
                  setAdding(false);
                }
              }}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs font-black uppercase tracking-wider disabled:opacity-60"
              style={{
                background: "var(--gradient-primary)",
                color: "var(--primary-foreground)",
                boxShadow: "var(--shadow-glow-primary)",
              }}
            >
              <UserPlus size={14} />
              {adding ? "Adding…" : "+ Add Employee Manually"}
            </button>
          </section>

          {/* Bulk CSV upload (unchanged) */}
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={downloadUsersTemplate}
              className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-[var(--primary-glow)] underline-offset-4 hover:underline"
            >
              <Download size={14} />
              Download User CSV Template File
            </button>
          </div>
          <section
            onDragOver={(e) => { e.preventDefault(); setUserDragOver(true); }}
            onDragLeave={() => setUserDragOver(false)}
            onDrop={(e) => {
              e.preventDefault();
              setUserDragOver(false);
              const f = e.dataTransfer.files?.[0];
              if (f) handleUsersFile(f);
            }}
            onClick={() => userInputRef.current?.click()}
            className={`glossy-card p-8 text-center cursor-pointer border-2 border-dashed transition ${
              userDragOver ? "border-[var(--primary-glow)] bg-white/5" : "border-white/15"
            }`}
          >
            <div
              className="mx-auto w-14 h-14 rounded-2xl flex items-center justify-center mb-3"
              style={{ background: "var(--gradient-primary)", boxShadow: "var(--shadow-glow-primary)" }}
            >
              <Upload className="text-white" size={22} />
            </div>
            <p className="text-sm font-bold uppercase tracking-wider">
              {userBusy ? "Importing…" : "Upload Master Roster (CSV Format)"}
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              Columns: employee_id, date_of_birth (DD/MM/YYYY), name.
            </p>
            <input
              ref={userInputRef}
              type="file"
              accept=".csv,.xlsx,.xls,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) handleUsersFile(f);
                e.currentTarget.value = "";
              }}
            />
          </section>
          <div className="flex items-center gap-2 text-xs text-amber-400/90">
            <AlertTriangle size={14} />
            Existing roster rows with the same employee_id will be replaced.
          </div>

          {/* Searchable directory */}
          <section className="glossy-card p-5 space-y-4">
            <div className="flex flex-wrap items-center gap-3">
              <h3 className="text-sm font-bold uppercase tracking-wider">Corporate Roster Directory</h3>
              <div className="flex-1" />
              <div className="relative">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <input
                  value={search}
                  onChange={(e) => { setSearch(e.target.value); setPage(0); }}
                  placeholder="Search name or Employee ID"
                  className="rounded-lg pl-9 pr-3 py-2 text-sm bg-black/40 border border-white/10 focus:border-[var(--primary)] outline-none w-64 max-w-full"
                />
              </div>
            </div>
            <UserDirectory
              users={usersQuery.data?.users ?? []}
              loading={usersQuery.isLoading}
              search={search}
              page={page}
              pageSize={PAGE_SIZE}
              setPage={setPage}
              onDelete={async (id, name) => {
                if (!profile) return;
                const ok = window.confirm(
                  `Are you sure you want to completely erase ${name} (${id}) from the system?`,
                );
                if (!ok) return;
                try {
                  await deleteUserFn({
                    data: { adminEmployeeId: profile.employee_id, employee_id: id },
                  });
                  toast.success(`Deleted ${name}.`);
                  await queryClient.invalidateQueries({ queryKey: ["admin-users"] });
                } catch (err) {
                  toast.error(err instanceof Error ? err.message : "Delete failed");
                }
              }}
            />
          </section>
        </div>
      )}

      {tab === "sync" && <AutoSyncGuide />}
      {tab === "tools" && profile && <AdminToolsPanel adminEmployeeId={profile.employee_id} />}
    </div>
  );
}

function AutoSyncGuide() {
  const endpoint =
    "https://project--e068a158-2a0c-4115-b745-cfbb20d3e7c5.lovable.app/api/public/sync-external-scores";
  const samplePayload = `{
  "results": [
    { "home_team": "Brazil", "away_team": "Argentina", "home_score": 2, "away_score": 1, "is_completed": true }
  ]
}`;
  const curlExample = `curl -X POST '${endpoint}' \\
  -H 'Authorization: Bearer <SCORE_SYNC_SECRET>' \\
  -H 'Content-Type: application/json' \\
  -d '${samplePayload.replace(/\n/g, " ")}'`;
  return (
    <div className="space-y-4">
      <section className="glossy-card p-5 space-y-3">
        <h3 className="text-sm font-bold uppercase tracking-wider text-[var(--primary-glow)]">
          Hands-Free Score Sync
        </h3>
        <p className="text-xs text-muted-foreground leading-relaxed">
          A secure public endpoint accepts live match results, updates the
          schedule, marks matches as completed, and recalculates the global
          leaderboard automatically.
        </p>
        <div className="rounded-lg bg-black/40 border border-white/10 p-3 text-[11px] font-mono break-all">
          POST {endpoint}
        </div>
        <p className="text-xs text-muted-foreground">
          Authentication header:{" "}
          <span className="font-mono text-white/80">Authorization: Bearer &lt;SCORE_SYNC_SECRET&gt;</span>
        </p>
        <pre className="rounded-lg bg-black/40 border border-white/10 p-3 text-[11px] font-mono whitespace-pre-wrap overflow-x-auto">{samplePayload}</pre>
      </section>

      <section className="glossy-card p-5 space-y-3">
        <h3 className="text-sm font-bold uppercase tracking-wider text-[var(--primary-glow)]">
          GitHub Actions Setup (15 min cron)
        </h3>
        <ol className="text-xs text-white/85 leading-relaxed list-decimal pl-5 space-y-2">
          <li>
            Create a free GitHub repository (public or private).
          </li>
          <li>
            Copy <span className="font-mono">scraper.js</span> and{" "}
            <span className="font-mono">.github/workflows/score_sync.yml</span>{" "}
            from this project into the repo root.
          </li>
          <li>
            In the repo: <b>Settings → Secrets and variables → Actions → New
            repository secret</b>, add:
            <ul className="list-disc pl-5 mt-1 space-y-1">
              <li><span className="font-mono">SYNC_ENDPOINT</span> = <span className="font-mono break-all">{endpoint}</span></li>
              <li><span className="font-mono">SCORE_SYNC_SECRET</span> = the value configured in Lovable Cloud secrets</li>
              <li><span className="font-mono">SUPABASE_URL</span> and <span className="font-mono">SUPABASE_SERVICE_ROLE_KEY</span> (optional, only if you extend the scraper to query the DB directly)</li>
            </ul>
          </li>
          <li>
            Commit and push. Open the <b>Actions</b> tab and run{" "}
            <span className="font-mono">FIFA 2026 Score Sync</span> once via
            <b> workflow_dispatch</b> to confirm the wiring.
          </li>
          <li>
            The workflow then runs automatically every 15 minutes
            (<span className="font-mono">*/15 * * * *</span>) for the duration of
            the tournament — no manual action required.
          </li>
        </ol>
      </section>

      <section className="glossy-card p-5 space-y-3">
        <h3 className="text-sm font-bold uppercase tracking-wider text-[var(--primary-glow)]">
          Manual Test (cURL)
        </h3>
        <pre className="rounded-lg bg-black/40 border border-white/10 p-3 text-[11px] font-mono whitespace-pre-wrap overflow-x-auto">{curlExample}</pre>
        <p className="text-[11px] text-muted-foreground">
          A 200 response with <span className="font-mono">{`{ ok: true, updated: N }`}</span> confirms
          the endpoint, secret, and team-name match are all working.
        </p>
      </section>
    </div>
  );
}

function UserDirectory({
  users,
  loading,
  search,
  page,
  pageSize,
  setPage,
  onDelete,
}: {
  users: { employee_id: string; name: string; date_of_birth: string; registered: boolean }[];
  loading: boolean;
  search: string;
  page: number;
  pageSize: number;
  setPage: (n: number) => void;
  onDelete: (id: string, name: string) => void;
}) {
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return users;
    return users.filter(
      (u) =>
        u.name.toLowerCase().includes(q) ||
        u.employee_id.toLowerCase().includes(q),
    );
  }, [users, search]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const pageRows = filtered.slice(page * pageSize, page * pageSize + pageSize);

  if (loading) {
    return <p className="text-sm text-muted-foreground">Loading roster…</p>;
  }

  return (
    <>
      <div className="overflow-x-auto rounded-lg border border-white/10">
        <table className="w-full text-xs">
          <thead className="bg-white/5 text-muted-foreground uppercase tracking-wider">
            <tr>
              <th className="text-left px-3 py-2">Employee ID</th>
              <th className="text-left px-3 py-2">Name</th>
              <th className="text-left px-3 py-2">DOB</th>
              <th className="text-left px-3 py-2">Status</th>
              <th className="text-right px-3 py-2">Action</th>
            </tr>
          </thead>
          <tbody>
            {pageRows.length === 0 && (
              <tr><td colSpan={5} className="px-3 py-6 text-center text-muted-foreground">No matching users.</td></tr>
            )}
            {pageRows.map((u) => (
              <tr key={u.employee_id} className="border-t border-white/5">
                <td className="px-3 py-2 font-mono">{u.employee_id}</td>
                <td className="px-3 py-2">{u.name}</td>
                <td className="px-3 py-2">{u.date_of_birth}</td>
                <td className="px-3 py-2">
                  <span
                    className="inline-block px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider"
                    style={
                      u.registered
                        ? { background: "rgba(193,234,58,0.18)", color: "#C1EA3A" }
                        : { background: "rgba(110,60,188,0.20)", color: "#c8a8f0" }
                    }
                  >
                    {u.registered ? "Registered" : "Eligible"}
                  </span>
                </td>
                <td className="px-3 py-2 text-right">
                  <button
                    type="button"
                    onClick={() => onDelete(u.employee_id, u.name)}
                    className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md text-[11px] font-bold uppercase tracking-wider border border-red-500/40 text-red-300 hover:bg-red-500/10"
                  >
                    <Trash2 size={12} /> Delete
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>{filtered.length} user{filtered.length === 1 ? "" : "s"}</span>
        <div className="flex items-center gap-2">
          <button
            type="button"
            disabled={page === 0}
            onClick={() => setPage(Math.max(0, page - 1))}
            className="px-3 py-1 rounded-md border border-white/10 disabled:opacity-40"
          >
            Prev
          </button>
          <span>{page + 1} / {totalPages}</span>
          <button
            type="button"
            disabled={page + 1 >= totalPages}
            onClick={() => setPage(Math.min(totalPages - 1, page + 1))}
            className="px-3 py-1 rounded-md border border-white/10 disabled:opacity-40"
          >
            Next
          </button>
        </div>
      </div>
    </>
  );
}

/* ================================================================== */
/* Admin Tools panel                                                   */
/* ================================================================== */
function AdminToolsPanel({ adminEmployeeId }: { adminEmployeeId: string }) {
  const qc = useQueryClient();
  const syncFn = useServerFn(triggerScoreSync);
  const recalcFn = useServerFn(recalculateLeaderboard);
  const completeFn = useServerFn(completeMatchManually);
  const updateScoresFn = useServerFn(updateMatchScores);
  const listMatchesFn = useServerFn(listMatchesForAdmin);
  const listLogsFn = useServerFn(listSyncLogs);

  const [syncing, setSyncing] = useState(false);
  const [recalcing, setRecalcing] = useState(false);
  const [logFilter, setLogFilter] = useState<"all" | "failures">("all");

  const matchesQ = useQuery({
    queryKey: ["admin-tools-matches"],
    queryFn: () => listMatchesFn({ data: { adminEmployeeId } }),
  });
  const logsQ = useQuery({
    queryKey: ["admin-sync-logs", logFilter],
    queryFn: () =>
      listLogsFn({
        data: { adminEmployeeId, limit: 50, onlyFailures: logFilter === "failures" },
      }),
    refetchInterval: 15_000,
  });

  const [selectedMatch, setSelectedMatch] = useState<string>("");
  const [editHome, setEditHome] = useState<number>(0);
  const [editAway, setEditAway] = useState<number>(0);
  const [editStatus, setEditStatus] = useState<AdminMatchRow["status"]>("live");

  const matches = matchesQ.data?.matches ?? [];
  const current = matches.find((m) => m.id === selectedMatch);

  const onSelectMatch = (id: string) => {
    setSelectedMatch(id);
    const m = matches.find((x) => x.id === id);
    if (m) {
      setEditHome(m.home_score ?? 0);
      setEditAway(m.away_score ?? 0);
      setEditStatus(m.status);
    }
  };

  return (
    <div className="space-y-4">
      {/* Quick actions */}
      <section className="glossy-card p-5 space-y-4">
        <h3 className="text-sm font-bold uppercase tracking-wider">Quick Actions</h3>
        <div className="grid sm:grid-cols-2 gap-3">
          <button
            type="button"
            disabled={syncing}
            onClick={async () => {
              setSyncing(true);
              try {
                const r = await syncFn({ data: { adminEmployeeId } });
                if (r.ok) toast.success("Score sync triggered.");
                else toast.error(`Sync returned ${r.status ?? "error"}`);
                await qc.invalidateQueries({ queryKey: ["admin-sync-logs"] });
                await qc.invalidateQueries({ queryKey: ["matches"] });
              } catch (err) {
                toast.error(err instanceof Error ? err.message : "Sync failed");
              } finally { setSyncing(false); }
            }}
            className="px-4 py-3 rounded-xl text-xs font-bold uppercase tracking-wider text-white disabled:opacity-60"
            style={{ background: "var(--gradient-primary)", boxShadow: "var(--shadow-glow-primary)" }}
          >
            {syncing ? "Syncing…" : "Trigger Score Sync"}
          </button>
          <button
            type="button"
            disabled={recalcing}
            onClick={async () => {
              setRecalcing(true);
              try {
                const r = await recalcFn({ data: { adminEmployeeId } });
                toast.success(
                  `Recalculated: ${r.predictionsUpdated} prediction(s), ${r.usersRefreshed}/${r.totalUsers} user totals updated.`,
                );
                await qc.invalidateQueries({ queryKey: ["leaderboard"] });
                await qc.invalidateQueries({ queryKey: ["admin-sync-logs"] });
              } catch (err) {
                toast.error(err instanceof Error ? err.message : "Recalculate failed");
              } finally { setRecalcing(false); }
            }}
            className="px-4 py-3 rounded-xl text-xs font-bold uppercase tracking-wider border border-white/15 hover:bg-white/5 disabled:opacity-60"
          >
            {recalcing ? "Recalculating…" : "Recalculate Leaderboard"}
          </button>
        </div>
      </section>

      {/* Match editor */}
      <section className="glossy-card p-5 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-bold uppercase tracking-wider">Match Score Editor</h3>
          <span className="text-[10px] text-muted-foreground">{matches.length} matches</span>
        </div>

        <label className="block space-y-1">
          <span className="text-[10px] uppercase tracking-widest text-muted-foreground">
            Select Match
          </span>
          <select
            value={selectedMatch}
            onChange={(e) => onSelectMatch(e.target.value)}
            className="w-full rounded-lg px-3 py-2 text-sm bg-black/40 border border-white/10 outline-none"
          >
            <option value="">— Choose a match —</option>
            {matches.map((m) => (
              <option key={m.id} value={m.id}>
                [{m.status}] {m.home_team} vs {m.away_team} — {formatIstShort(m.match_time)}
              </option>
            ))}
          </select>
        </label>

        {current && (
          <>
            <div className="grid grid-cols-3 gap-3">
              <label className="space-y-1">
                <span className="text-[10px] uppercase tracking-widest text-muted-foreground">
                  {current.home_team}
                </span>
                <input
                  type="number"
                  min={0}
                  max={50}
                  value={editHome}
                  onChange={(e) => setEditHome(Number(e.target.value))}
                  className="w-full rounded-lg px-3 py-2 text-sm bg-black/40 border border-white/10 outline-none text-center font-bold"
                />
              </label>
              <label className="space-y-1">
                <span className="text-[10px] uppercase tracking-widest text-muted-foreground">
                  {current.away_team}
                </span>
                <input
                  type="number"
                  min={0}
                  max={50}
                  value={editAway}
                  onChange={(e) => setEditAway(Number(e.target.value))}
                  className="w-full rounded-lg px-3 py-2 text-sm bg-black/40 border border-white/10 outline-none text-center font-bold"
                />
              </label>
              <label className="space-y-1">
                <span className="text-[10px] uppercase tracking-widest text-muted-foreground">
                  Status
                </span>
                <select
                  value={editStatus}
                  onChange={(e) => setEditStatus(e.target.value)}
                  className="w-full rounded-lg px-3 py-2 text-sm bg-black/40 border border-white/10 outline-none"
                >
                  {["scheduled", "live", "halftime", "completed", "cancelled"].map((s) => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
              </label>
            </div>

            <div className="flex flex-wrap gap-3">
              <button
                type="button"
                onClick={async () => {
                  try {
                    await updateScoresFn({
                      data: {
                        adminEmployeeId,
                        matchId: current.id,
                        homeScore: editHome,
                        awayScore: editAway,
                        status: editStatus as any,
                      },
                    });
                    toast.success("Scores updated.");
                    await qc.invalidateQueries({ queryKey: ["admin-tools-matches"] });
                    await qc.invalidateQueries({ queryKey: ["matches"] });
                  } catch (err) {
                    toast.error(err instanceof Error ? err.message : "Update failed");
                  }
                }}
                className="px-5 py-2.5 rounded-xl text-xs font-bold uppercase tracking-wider text-white"
                style={{ background: "var(--gradient-primary)" }}
              >
                Save Scores
              </button>
              <button
                type="button"
                onClick={async () => {
                  if (!window.confirm(
                    `Mark ${current.home_team} ${editHome}-${editAway} ${current.away_team} as COMPLETED and award points?`,
                  )) return;
                  try {
                    const r = await completeFn({
                      data: {
                        adminEmployeeId,
                        matchId: current.id,
                        homeScore: editHome,
                        awayScore: editAway,
                      },
                    });
                    toast.success(`Match completed — ${r.usersRefreshed} user total(s) refreshed.`);
                    await qc.invalidateQueries({ queryKey: ["admin-tools-matches"] });
                    await qc.invalidateQueries({ queryKey: ["matches"] });
                    await qc.invalidateQueries({ queryKey: ["leaderboard"] });
                  } catch (err) {
                    toast.error(err instanceof Error ? err.message : "Complete failed");
                  }
                }}
                className="px-5 py-2.5 rounded-xl text-xs font-bold uppercase tracking-wider text-white"
                style={{ background: "linear-gradient(135deg, #16a34a 0%, #4ade80 100%)" }}
              >
                <CheckCircle2 className="inline -mt-0.5 mr-1" size={14} />
                Complete & Award Points
              </button>
            </div>
          </>
        )}
      </section>

      {/* Sync logs */}
      <section className="glossy-card p-5 space-y-4">
        <div className="flex flex-wrap items-center gap-3">
          <h3 className="text-sm font-bold uppercase tracking-wider">Sync Activity Logs</h3>
          <div className="flex-1" />
          <div className="flex gap-1 p-1 rounded-lg bg-black/40 border border-white/10">
            {(["all", "failures"] as const).map((f) => (
              <button
                key={f}
                type="button"
                onClick={() => setLogFilter(f)}
                className="px-3 py-1 rounded-md text-[10px] font-bold uppercase tracking-wider"
                style={
                  logFilter === f
                    ? { background: "var(--gradient-primary)", color: "#fff" }
                    : { color: "rgba(209,212,209,0.65)" }
                }
              >
                {f === "all" ? "All Runs" : "Failed Only"}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={() => qc.invalidateQueries({ queryKey: ["admin-sync-logs"] })}
            className="text-[10px] uppercase tracking-wider text-[var(--primary-glow)] hover:underline"
          >
            Refresh
          </button>
        </div>
        <SyncLogTable logs={logsQ.data?.logs ?? []} loading={logsQ.isLoading} />
        <p className="text-[10px] text-muted-foreground">Times shown in {IST_LABEL}. Auto-refreshes every 15 seconds.</p>
      </section>
    </div>
  );
}

function SyncLogTable({ logs, loading }: { logs: SyncLogRow[]; loading: boolean }) {
  if (loading) return <p className="text-sm text-muted-foreground">Loading logs…</p>;
  if (logs.length === 0) {
    return (
      <div className="text-center py-8 text-sm text-muted-foreground border border-white/10 rounded-lg">
        No sync activity yet.
      </div>
    );
  }
  return (
    <div className="overflow-x-auto rounded-lg border border-white/10">
      <table className="w-full text-xs">
        <thead className="bg-white/5 text-muted-foreground uppercase tracking-wider">
          <tr>
            <th className="text-left px-3 py-2">When</th>
            <th className="text-left px-3 py-2">Source</th>
            <th className="text-left px-3 py-2">Status</th>
            <th className="text-right px-3 py-2">Recv</th>
            <th className="text-right px-3 py-2">Updated</th>
            <th className="text-right px-3 py-2">Created</th>
            <th className="text-right px-3 py-2">Scored</th>
            <th className="text-right px-3 py-2">Users</th>
            <th className="text-right px-3 py-2">Failed</th>
            <th className="text-left px-3 py-2">Detail</th>
          </tr>
        </thead>
        <tbody>
          {logs.map((l) => {
            const ok = l.status === "success" && l.failed_count === 0;
            const color = ok
              ? "rgba(74,222,128,0.85)"
              : l.status === "partial"
              ? "rgba(250,204,21,0.9)"
              : "rgba(248,113,113,0.9)";
            return (
              <tr key={l.id} className="border-t border-white/5 align-top">
                <td className="px-3 py-2 whitespace-nowrap">{formatIstShort(l.created_at)}</td>
                <td className="px-3 py-2 font-mono">{l.source}</td>
                <td className="px-3 py-2">
                  <span style={{ color }} className="font-bold uppercase tracking-wider text-[10px]">
                    {l.status}
                  </span>
                </td>
                <td className="px-3 py-2 text-right">{l.received}</td>
                <td className="px-3 py-2 text-right">{l.updated}</td>
                <td className="px-3 py-2 text-right">{l.created}</td>
                <td className="px-3 py-2 text-right">{l.predictions_scored}</td>
                <td className="px-3 py-2 text-right">{l.users_refreshed}</td>
                <td className="px-3 py-2 text-right" style={l.failed_count > 0 ? { color: "rgba(248,113,113,0.9)" } : undefined}>
                  {l.failed_count}
                </td>
                <td className="px-3 py-2 text-muted-foreground max-w-xs">
                  {l.error_message && (
                    <span className="block text-red-300/90">{l.error_message}</span>
                  )}
                  {Array.isArray(l.failures) && l.failures.length > 0 && (
                    <details>
                      <summary className="cursor-pointer text-[11px]">
                        {l.failures.length} failed item(s)
                      </summary>
                      <ul className="mt-1 space-y-0.5 text-[10px]">
                        {l.failures.slice(0, 5).map((f, i) => (
                          <li key={i} className="font-mono">
                            {f.home_team} vs {f.away_team}: {f.error}
                          </li>
                        ))}
                        {l.failures.length > 5 && (
                          <li className="italic">+{l.failures.length - 5} more</li>
                        )}
                      </ul>
                    </details>
                  )}
                  {l.duration_ms != null && (
                    <span className="text-[10px]">{l.duration_ms}ms</span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}