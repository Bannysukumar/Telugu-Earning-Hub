import { AppLayout } from "@/components/layout/app-layout";
import { useAuth } from "@/hooks/use-auth";
import { useUpdateProfile } from "@workspace/api-client-react";
import { Card, CardContent, Button, Input, Label } from "@/components/ui/core";
import { formatINR, formatDate } from "@/lib/utils";
import { User, Mail, Wallet, Calendar, Save } from "lucide-react";
import { toast } from "sonner";
import { useState, useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";

export default function Profile() {
  const { user } = useAuth();
  const [name, setName] = useState(user?.name || "");
  const { mutate: update, isPending } = useUpdateProfile();
  const queryClient = useQueryClient();

  useEffect(() => {
    if (user?.name) setName(user.name);
  }, [user?.name]);

  const handleSave = () => {
    if (!name.trim()) {
      toast.error("Name cannot be empty");
      return;
    }
    update(
      { data: { name } },
      {
        onSuccess: () => {
          toast.success("Profile updated successfully");
          queryClient.invalidateQueries();
        },
        onError: () => toast.error("Failed to update profile"),
      },
    );
  };

  return (
    <AppLayout>
      <div className="mb-8">
        <h2 className="text-3xl font-display font-bold">My Profile</h2>
        <p className="text-muted-foreground">Manage your account information</p>
      </div>

      <div className="max-w-2xl space-y-6">
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center gap-5 mb-8">
              <div className="w-20 h-20 rounded-2xl bg-primary/20 flex items-center justify-center text-primary font-bold text-3xl">
                {user?.name?.charAt(0)?.toUpperCase()}
              </div>
              <div>
                <h3 className="text-xl font-bold">{user?.name}</h3>
                <p className="text-muted-foreground text-sm">{user?.email}</p>
                <span className="inline-flex items-center mt-1 px-2 py-0.5 rounded-full text-xs bg-primary/10 text-primary font-medium capitalize">
                  {user?.role}
                </span>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4 mb-6">
              <div className="bg-secondary/40 rounded-xl p-4 flex items-center gap-3">
                <Wallet className="h-5 w-5 text-emerald-400" />
                <div>
                  <p className="text-xs text-muted-foreground">Wallet Balance</p>
                  <p className="font-bold text-emerald-400">{formatINR(user?.walletBalance || 0)}</p>
                </div>
              </div>
              <div className="bg-secondary/40 rounded-xl p-4 flex items-center gap-3">
                <Calendar className="h-5 w-5 text-blue-400" />
                <div>
                  <p className="text-xs text-muted-foreground">Member Since</p>
                  <p className="font-bold">{user?.createdAt ? formatDate(user.createdAt.toString()).split(",")[0] : "—"}</p>
                </div>
              </div>
            </div>

            <div className="space-y-4">
              <div>
                <Label className="flex items-center gap-2 mb-2">
                  <User className="h-4 w-4" /> Full Name
                </Label>
                <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Your full name" />
              </div>
              <div>
                <Label className="flex items-center gap-2 mb-2">
                  <Mail className="h-4 w-4" /> Email Address
                </Label>
                <Input value={user?.email || ""} disabled className="opacity-60 cursor-not-allowed" />
                <p className="text-xs text-muted-foreground mt-1">Email cannot be changed</p>
              </div>
              <Button onClick={handleSave} isLoading={isPending} className="w-full">
                <Save className="h-4 w-4 mr-2" /> Save Changes
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
}
