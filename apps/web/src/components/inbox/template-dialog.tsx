"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Field, Input, Select } from "@/components/ui/input";
import { useTemplates } from "@/lib/hooks";

export function TemplateSendDialog({
  open,
  onClose,
  channelId,
  onSend,
  sending,
}: {
  open: boolean;
  onClose: () => void;
  channelId: string;
  sending?: boolean;
  onSend: (data: { templateId: string; params: string[]; headerMediaUrl?: string }) => void;
}) {
  const templates = useTemplates(channelId, true);
  const [templateId, setTemplateId] = React.useState("");
  const [params, setParams] = React.useState<string[]>([]);
  const [headerMediaUrl, setHeaderMediaUrl] = React.useState("");
  const template = templates.data?.find((t) => t.id === templateId);

  React.useEffect(() => {
    if (template) setParams(Array.from({ length: template.variableCount }, (_, i) => (i === 0 ? "{{name}}" : "")));
  }, [template]);

  const needsMedia = template && ["image", "video", "document"].includes(template.headerFormat ?? "");

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Send a template"
      description="Approved templates can be sent at any time, including outside the 24-hour window."
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            disabled={!template || (needsMedia && !headerMediaUrl)}
            loading={sending}
            onClick={() => onSend({ templateId, params, headerMediaUrl: headerMediaUrl || undefined })}
          >
            Send template
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label="Template">
          <Select value={templateId} onChange={(e) => setTemplateId(e.target.value)}>
            <option value="">Select an approved template</option>
            {templates.data?.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name} ({t.language})
              </option>
            ))}
          </Select>
        </Field>
        {templates.data?.length === 0 && (
          <p className="text-sm text-muted-foreground">
            No approved templates for this channel. Sync or create templates on the Templates page.
          </p>
        )}
        {template && (
          <>
            <div className="whitespace-pre-wrap rounded-lg bg-violet-50 p-3 text-sm">{template.bodyText}</div>
            {params.map((p, i) => (
              <Field key={i} label={`Variable {{${i + 1}}}`} hint="You can use {{name}}, {{phone}}, {{email}} or {{field.key}}">
                <Input value={p} onChange={(e) => setParams(params.map((x, j) => (j === i ? e.target.value : x)))} />
              </Field>
            ))}
            {needsMedia && (
              <Field label={`Header ${template.headerFormat} URL`}>
                <Input value={headerMediaUrl} onChange={(e) => setHeaderMediaUrl(e.target.value)} placeholder="https://" />
              </Field>
            )}
          </>
        )}
      </div>
    </Dialog>
  );
}
