import { AppLayout } from "@/components/layout/app-layout";
import {
  useAdminGetSettings,
  useAdminUpdateSettings,
  getAdminGetSettingsQueryKey,
  useAdminGetPaymentSettings,
  useAdminUpdatePaymentSettings,
  getAdminGetPaymentSettingsQueryKey,
} from "@workspace/api-client-react";
import { Button, Card, Input, Label } from "@/components/ui/core";
import { Switch } from "@/components/ui/switch";
import { apiUrl } from "@/lib/api-url";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { QrCode, Settings, Upload } from "lucide-react";

export default function AdminSettings() {
  const { data, isLoading } = useAdminGetSettings();
  const { mutate: save, isPending } = useAdminUpdateSettings();
  const { data: pay, isLoading: payLoading } = useAdminGetPaymentSettings();
  const { mutate: savePay, isPending: paySaving } = useAdminUpdatePaymentSettings();
  const queryClient = useQueryClient();
  const [percent, setPercent] = useState("10");
  const [payEnabled, setPayEnabled] = useState(false);
  const qrInputRef = useRef<HTMLInputElement>(null);
  const [uploadingQr, setUploadingQr] = useState(false);

  useEffect(() => {
    if (data?.withdrawalFeePercent != null) {
      setPercent(String(data.withdrawalFeePercent));
    }
  }, [data?.withdrawalFeePercent]);

  useEffect(() => {
    if (pay?.isPaymentEnabled != null) {
      setPayEnabled(pay.isPaymentEnabled);
    }
  }, [pay?.isPaymentEnabled]);

  const onSave = () => {
    const n = Number(percent);
    if (!Number.isFinite(n) || n < 0 || n > 100) {
      toast.error("Enter a percentage between 0 and 100.");
      return;
    }
    save(
      { data: { withdrawalFeePercent: n } },
      {
        onSuccess: () => {
          toast.success("Withdrawal fee updated.");
          void queryClient.invalidateQueries({ queryKey: getAdminGetSettingsQueryKey() });
        },
        onError: (err: unknown) => toast.error(err instanceof Error ? err.message : "Save failed"),
      },
    );
  };

  const persistPayEnabled = (next: boolean) => {
    setPayEnabled(next);
    savePay(
      { data: { isPaymentEnabled: next } },
      {
        onSuccess: () => {
          toast.success(next ? "QR payments enabled." : "QR payments disabled.");
          void queryClient.invalidateQueries({ queryKey: getAdminGetPaymentSettingsQueryKey() });
        },
        onError: (err: unknown) => {
          setPayEnabled(!next);
          toast.error(err instanceof Error ? err.message : "Save failed");
        },
      },
    );
  };

  const uploadQrFile = async (file: File) => {
    setUploadingQr(true);
    try {
      const fd = new FormData();
      fd.set("qr", file);
      const res = await fetch(apiUrl("/api/admin/payment-settings/qr"), { method: "POST", body: fd });
      const body = (await res.json().catch(() => ({}))) as { error?: string; qrCodeImageUrl?: string };

      if (!res.ok) {
        toast.error(typeof body.error === "string" ? body.error : "Upload failed");
        return;
      }
      toast.success("QR code updated.");
      void queryClient.invalidateQueries({ queryKey: getAdminGetPaymentSettingsQueryKey() });
    } finally {
      setUploadingQr(false);
      if (qrInputRef.current) qrInputRef.current.value = "";
    }
  };

  return (
    <AppLayout isAdmin>
      <div className="mb-8">
        <h2 className="text-3xl font-display font-bold flex items-center gap-2">
          <Settings className="h-8 w-8 text-primary" />
          Platform settings
        </h2>
        <p className="text-muted-foreground mt-1">Withdrawal fees and manual UPI / QR deposit configuration.</p>
      </div>

      <div className="grid gap-8 max-w-2xl">
        <Card className="max-w-md">
          <div className="p-6 border-b border-border">
            <h3 className="font-bold text-lg">Withdrawal fee</h3>
            <p className="text-sm text-muted-foreground mt-1">
              Deducted from the amount the user requests. The full requested amount is held from their wallet; they receive the net after this percentage.
            </p>
          </div>
          <div className="p-6 space-y-4">
            {isLoading ? (
              <p className="text-sm text-muted-foreground">Loading…</p>
            ) : (
              <>
                <div className="space-y-2">
                  <Label htmlFor="fee-pct">Fee percentage (%)</Label>
                  <Input
                    id="fee-pct"
                    type="number"
                    min={0}
                    max={100}
                    step="0.1"
                    value={percent}
                    onChange={(e) => setPercent(e.target.value)}
                  />
                  <p className="text-xs text-muted-foreground">Default when unset in database: 10%.</p>
                </div>
                <Button type="button" onClick={onSave} isLoading={isPending} className="w-full sm:w-auto">
                  Save settings
                </Button>
              </>
            )}
          </div>
        </Card>

        <Card>
          <div className="p-6 border-b border-border flex items-start gap-3">
            <QrCode className="h-8 w-8 text-primary shrink-0" />
            <div>
              <h3 className="font-bold text-lg">QR / manual deposits</h3>
              <p className="text-sm text-muted-foreground mt-1">
                Upload the UPI QR users should scan on <span className="text-foreground/90">Add funds</span>. Replacing the image updates immediately.
              </p>
            </div>
          </div>
          <div className="p-6 space-y-6">
            {payLoading ? (
              <p className="text-sm text-muted-foreground">Loading…</p>
            ) : (
              <>
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                  <div>
                    <Label className="text-base">QR payments</Label>
                    <p className="text-xs text-muted-foreground mt-1">When off, users cannot submit new deposit requests.</p>
                  </div>
                  <Switch checked={payEnabled} onCheckedChange={(v) => persistPayEnabled(v)} disabled={paySaving} />
                </div>

                {pay?.qrCodeImageUrl ? (
                  <div className="rounded-xl border border-border bg-secondary/20 p-4 inline-block">
                    <img
                      src={pay.qrCodeImageUrl}
                      alt="Current QR"
                      className="max-w-[220px] h-auto rounded-lg"
                    />
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">No QR uploaded yet.</p>
                )}

                <div className="space-y-2">
                  <Label htmlFor="qr-up">Replace QR image</Label>
                  <input
                    id="qr-up"
                    ref={qrInputRef}
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    disabled={uploadingQr}
                    className="sr-only"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) void uploadQrFile(f);
                    }}
                  />
                  <p className="text-xs text-muted-foreground">JPEG, PNG, or WebP · max 3 MB</p>
                  <Button
                    type="button"
                    variant="outline"
                    className="gap-2"
                    disabled={uploadingQr}
                    isLoading={uploadingQr}
                    onClick={() => qrInputRef.current?.click()}
                  >
                    <Upload className="h-4 w-4" />
                    Upload QR image
                  </Button>
                </div>

                {pay?.updatedAt ? (
                  <p className="text-xs text-muted-foreground">Last updated (settings doc): {new Date(pay.updatedAt).toLocaleString()}</p>
                ) : null}
              </>
            )}
          </div>
        </Card>
      </div>
    </AppLayout>
  );
}
