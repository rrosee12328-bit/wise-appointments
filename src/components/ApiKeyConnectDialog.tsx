import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface ApiKeyField {
  key: string;
  label: string;
  placeholder: string;
  helpText?: string;
}

interface ApiKeyConnectDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  platformName: string;
  fields: ApiKeyField[];
  onConnect: (values: Record<string, string>) => Promise<void>;
  isLoading?: boolean;
  helpUrl?: string;
}

export function ApiKeyConnectDialog({
  open,
  onOpenChange,
  platformName,
  fields,
  onConnect,
  isLoading = false,
  helpUrl,
}: ApiKeyConnectDialogProps) {
  const [values, setValues] = useState<Record<string, string>>(() =>
    Object.fromEntries(fields.map((f) => [f.key, ""])),
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await onConnect(values);
  };

  const allFilled = fields.every((f) => values[f.key]?.trim());

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Connect {platformName}</DialogTitle>
          <DialogDescription>
            Enter your {platformName} API credentials to sync your appointments with Jey Link.
            {helpUrl && (
              <>
                {" "}
                <a
                  href={helpUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline text-primary"
                >
                  Where do I find this?
                </a>
              </>
            )}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4 py-2">
          {fields.map((field) => (
            <div key={field.key} className="flex flex-col gap-1.5">
              <Label htmlFor={field.key}>{field.label}</Label>
              <Input
                id={field.key}
                type="password"
                placeholder={field.placeholder}
                value={values[field.key]}
                onChange={(e) => setValues((prev) => ({ ...prev, [field.key]: e.target.value }))}
                autoComplete="off"
              />
              {field.helpText && <p className="text-xs text-muted-foreground">{field.helpText}</p>}
            </div>
          ))}
          <DialogFooter className="pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isLoading}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={!allFilled || isLoading}>
              {isLoading ? "Connecting…" : "Connect"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
