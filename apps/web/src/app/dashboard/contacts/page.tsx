"use client";

import * as React from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Download, Plus, Search, Trash2, Upload, Users } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/card";
import { Dialog } from "@/components/ui/dialog";
import { Field, Input, Select, Switch } from "@/components/ui/input";
import { Avatar, EmptyState, PageHeader, PageLoader, Table, Td, Th } from "@/components/ui/misc";
import type { ContactDto } from "@/components/inbox/types";
import { api, errorMessage } from "@/lib/api";
import { useTags } from "@/lib/hooks";
import { formatDate } from "@/lib/utils";

export default function ContactsPage() {
  const qc = useQueryClient();
  const tags = useTags();
  const [search, setSearch] = React.useState("");
  const [debounced, setDebounced] = React.useState("");
  const [tag, setTag] = React.useState("");
  const [page, setPage] = React.useState(1);
  const [selected, setSelected] = React.useState<string[]>([]);
  const [addOpen, setAddOpen] = React.useState(false);
  const [importOpen, setImportOpen] = React.useState(false);

  React.useEffect(() => {
    const t = setTimeout(() => {
      setDebounced(search);
      setPage(1);
    }, 300);
    return () => clearTimeout(t);
  }, [search]);

  const list = useQuery({
    queryKey: ["contacts", debounced, tag, page],
    queryFn: () =>
      api<{ items: ContactDto[]; total: number; pageSize: number }>(
        `/api/contacts?page=${page}${debounced ? `&search=${encodeURIComponent(debounced)}` : ""}${tag ? `&tag=${encodeURIComponent(tag)}` : ""}`,
      ),
  });

  const bulkDelete = useMutation({
    mutationFn: () => api("/api/contacts/bulk-delete", { body: { ids: selected } }),
    onSuccess: () => {
      setSelected([]);
      qc.invalidateQueries({ queryKey: ["contacts"] });
      toast.success("Contacts deleted");
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  async function exportCsv() {
    try {
      const res = await api<Response>("/api/contacts/export", { raw: true });
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `contacts-${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      toast.error(errorMessage(e));
    }
  }

  const items = list.data?.items ?? [];
  const totalPages = list.data ? Math.max(1, Math.ceil(list.data.total / list.data.pageSize)) : 1;
  const allSelected = items.length > 0 && items.every((c) => selected.includes(c.id));

  return (
    <div className="p-6">
      <PageHeader
        title="Contacts"
        description={list.data ? `${list.data.total.toLocaleString()} contacts in this workspace` : undefined}
        actions={
          <>
            <Button variant="outline" onClick={exportCsv}>
              <Download /> Export
            </Button>
            <Button variant="outline" onClick={() => setImportOpen(true)}>
              <Upload /> Import CSV
            </Button>
            <Button onClick={() => setAddOpen(true)}>
              <Plus /> Add contact
            </Button>
          </>
        }
      />
      <div className="mb-4 flex flex-col gap-3 sm:flex-row">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search name, phone or email" className="pl-9" />
        </div>
        <Select
          value={tag}
          onChange={(e) => {
            setTag(e.target.value);
            setPage(1);
          }}
          className="sm:w-48"
        >
          <option value="">All tags</option>
          {tags.data?.map((t) => (
            <option key={t}>{t}</option>
          ))}
        </Select>
        {selected.length > 0 && (
          <Button
            variant="destructive"
            onClick={() => confirm(`Delete ${selected.length} contacts?`) && bulkDelete.mutate()}
            loading={bulkDelete.isPending}
          >
            <Trash2 /> Delete {selected.length}
          </Button>
        )}
      </div>

      {list.isLoading ? (
        <PageLoader />
      ) : items.length === 0 ? (
        <EmptyState
          icon={Users}
          title="No contacts found"
          description="Contacts are created automatically from messages and leads, or you can import a CSV."
        />
      ) : (
        <>
          <Table>
            <thead>
              <tr>
                <Th className="w-10">
                  <input
                    type="checkbox"
                    checked={allSelected}
                    onChange={() => setSelected(allSelected ? [] : items.map((c) => c.id))}
                  />
                </Th>
                <Th>Name</Th>
                <Th>Phone</Th>
                <Th>Email</Th>
                <Th>Tags</Th>
                <Th>Opt-in</Th>
                <Th>Added</Th>
              </tr>
            </thead>
            <tbody>
              {items.map((c) => (
                <tr key={c.id} className="hover:bg-muted/40">
                  <Td>
                    <input
                      type="checkbox"
                      checked={selected.includes(c.id)}
                      onChange={() =>
                        setSelected(selected.includes(c.id) ? selected.filter((x) => x !== c.id) : [...selected, c.id])
                      }
                    />
                  </Td>
                  <Td>
                    <Link href={`/dashboard/contacts/${c.id}`} className="flex items-center gap-3 font-medium hover:text-primary">
                      <Avatar name={c.name || c.phone} className="h-8 w-8" />
                      {c.name || "Unknown"}
                    </Link>
                  </Td>
                  <Td>{c.phone ? `+${c.phone}` : "-"}</Td>
                  <Td className="max-w-[200px] truncate">{c.email || "-"}</Td>
                  <Td>
                    <div className="flex flex-wrap gap-1">
                      {c.tags.slice(0, 3).map((t) => (
                        <Badge key={t}>{t}</Badge>
                      ))}
                      {c.tags.length > 3 && <Badge tone="muted">+{c.tags.length - 3}</Badge>}
                    </div>
                  </Td>
                  <Td>{c.optIn ? <Badge tone="success">Yes</Badge> : <Badge tone="muted">No</Badge>}</Td>
                  <Td className="whitespace-nowrap text-muted-foreground">{formatDate(c.createdAt, false)}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
          <div className="mt-4 flex items-center justify-end gap-2 text-sm">
            <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>
              Previous
            </Button>
            <span className="text-muted-foreground">
              Page {page} of {totalPages}
            </span>
            <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage(page + 1)}>
              Next
            </Button>
          </div>
        </>
      )}

      <AddContactDialog open={addOpen} onClose={() => setAddOpen(false)} />
      <ImportDialog open={importOpen} onClose={() => setImportOpen(false)} />
    </div>
  );
}

function AddContactDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const qc = useQueryClient();
  const [form, setForm] = React.useState({ name: "", phone: "", email: "", tags: "", optIn: false });
  const create = useMutation({
    mutationFn: () =>
      api("/api/contacts", {
        body: {
          name: form.name || null,
          phone: form.phone || null,
          email: form.email || null,
          optIn: form.optIn,
          tags: form.tags.split(",").map((t) => t.trim()).filter(Boolean),
        },
      }),
    onSuccess: () => {
      toast.success("Contact added");
      qc.invalidateQueries({ queryKey: ["contacts"] });
      setForm({ name: "", phone: "", email: "", tags: "", optIn: false });
      onClose();
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Add contact"
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={() => create.mutate()} loading={create.isPending}>
            Save
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label="Name">
          <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        </Field>
        <Field label="WhatsApp number" hint="Include the country code, e.g. +91 98765 43210">
          <Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
        </Field>
        <Field label="Email">
          <Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
        </Field>
        <Field label="Tags" hint="Comma separated">
          <Input value={form.tags} onChange={(e) => setForm({ ...form, tags: e.target.value })} />
        </Field>
        <div className="flex items-center justify-between">
          <span className="text-sm">Opted in to marketing messages</span>
          <Switch checked={form.optIn} onChange={(v) => setForm({ ...form, optIn: v })} />
        </div>
      </div>
    </Dialog>
  );
}

function ImportDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const qc = useQueryClient();
  const [csv, setCsv] = React.useState("");
  const [fileName, setFileName] = React.useState("");
  const [tags, setTags] = React.useState("");
  const [optIn, setOptIn] = React.useState(false);
  const [result, setResult] = React.useState<{ created: number; updated: number; skipped: number; errors: string[] } | null>(null);

  const run = useMutation({
    mutationFn: () =>
      api("/api/contacts/import", {
        body: { csv, optIn, tags: tags.split(",").map((t) => t.trim()).filter(Boolean) },
      }),
    onSuccess: (r: any) => {
      setResult(r);
      qc.invalidateQueries({ queryKey: ["contacts"] });
      qc.invalidateQueries({ queryKey: ["contact-tags"] });
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  const close = () => {
    setCsv("");
    setFileName("");
    setResult(null);
    onClose();
  };

  return (
    <Dialog
      open={open}
      onClose={close}
      title="Import contacts from CSV"
      description="Columns: name, phone, email, tags (separated by |), opt_in, plus any custom field keys."
      footer={
        result ? (
          <Button onClick={close}>Done</Button>
        ) : (
          <>
            <Button variant="outline" onClick={close}>
              Cancel
            </Button>
            <Button onClick={() => run.mutate()} disabled={!csv} loading={run.isPending}>
              Import
            </Button>
          </>
        )
      }
    >
      {result ? (
        <div className="space-y-2 text-sm">
          <p>
            <b>{result.created}</b> created, <b>{result.updated}</b> updated, <b>{result.skipped}</b> skipped.
          </p>
          {result.errors.map((e) => (
            <p key={e} className="text-xs text-destructive">
              {e}
            </p>
          ))}
        </div>
      ) : (
        <div className="space-y-4">
          <label className="flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed border-violet-200 bg-violet-50/50 p-8 text-center hover:border-violet-400">
            <Upload className="h-6 w-6 text-primary" />
            <span className="mt-2 text-sm font-medium">{fileName || "Choose a CSV file"}</span>
            <input
              type="file"
              accept=".csv,text/csv"
              className="hidden"
              onChange={async (e) => {
                const f = e.target.files?.[0];
                if (!f) return;
                setFileName(f.name);
                setCsv(await f.text());
              }}
            />
          </label>
          <Field label="Add tags to all imported contacts" hint="Comma separated">
            <Input value={tags} onChange={(e) => setTags(e.target.value)} placeholder="webinar, nov-2026" />
          </Field>
          <div className="flex items-center justify-between">
            <span className="text-sm">These contacts have opted in</span>
            <Switch checked={optIn} onChange={setOptIn} />
          </div>
        </div>
      )}
    </Dialog>
  );
}
