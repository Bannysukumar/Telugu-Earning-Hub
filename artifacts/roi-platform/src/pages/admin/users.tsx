import { AppLayout } from "@/components/layout/app-layout";
import { useAdminGetUsers, useAdminUpdateUser, type AdminUser } from "@workspace/api-client-react";
import { Card, Table, TableHeader, TableRow, TableHead, TableBody, TableCell, Badge, Button, Modal, Input, Label } from "@/components/ui/core";
import { formatINR, formatDate } from "@/lib/utils";
import { useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Edit2, ShieldAlert } from "lucide-react";

export default function AdminUsers() {
  const { data: users, isLoading } = useAdminGetUsers();
  const { mutate: updateUser, isPending } = useAdminUpdateUser();
  const queryClient = useQueryClient();

  const [emailSearch, setEmailSearch] = useState("");
  const [editingUser, setEditingUser] = useState<AdminUser | null>(null);
  const [walletBal, setWalletBal] = useState("");

  const filteredUsers = useMemo(() => {
    const list = users ?? [];
    const q = emailSearch.trim().toLowerCase();
    if (!q) return list;
    return list.filter((u) => u.email.toLowerCase().includes(q));
  }, [users, emailSearch]);

  const handleUpdate = () => {
    if (!editingUser) return;
    updateUser({ 
      userId: editingUser.id, 
      data: { walletBalance: Number(walletBal) } 
    }, {
      onSuccess: () => {
        toast.success("User updated");
        queryClient.invalidateQueries();
        setEditingUser(null);
      },
      onError: (err: any) => toast.error(err.message)
    });
  };

  const toggleStatus = (u: AdminUser) => {
    updateUser({ userId: u.id, data: { isActive: !u.isActive } }, {
      onSuccess: () => {
        toast.success(`User ${!u.isActive ? 'activated' : 'deactivated'}`);
        queryClient.invalidateQueries();
      }
    });
  };

  return (
    <AppLayout isAdmin>
      <div className="mb-6 flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
        <div>
          <h2 className="text-3xl font-display font-bold">Manage Users</h2>
          <p className="text-muted-foreground">
            {filteredUsers.length === (users?.length ?? 0)
              ? `${users?.length || 0} registered users`
              : `${filteredUsers.length} of ${users?.length || 0} users match`}
          </p>
        </div>
        <div className="space-y-1 w-full sm:max-w-xs">
          <Label className="text-xs">Search by email</Label>
          <Input
            type="search"
            placeholder="e.g. name@domain.com"
            value={emailSearch}
            onChange={(e) => setEmailSearch(e.target.value)}
            className="h-10 rounded-xl"
          />
        </div>
      </div>

      <Card>
        {isLoading ? <div className="p-8">Loading...</div> : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>User</TableHead>
                <TableHead>Phone</TableHead>
                <TableHead>Wallet Bal</TableHead>
                <TableHead>Invested</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Joined</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredUsers.map((u) => (
                <TableRow key={u.id}>
                  <TableCell>
                    <div className="font-medium">{u.name}</div>
                    <div className="text-xs text-muted-foreground">{u.email}</div>
                    {u.role === 'admin' && <Badge className="mt-1 text-[10px] h-4">ADMIN</Badge>}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">{u.phone || '-'}</TableCell>
                  <TableCell className="font-semibold text-emerald-400">{formatINR(u.walletBalance)}</TableCell>
                  <TableCell>{formatINR(u.totalInvested)}</TableCell>
                  <TableCell>
                    <Badge variant={u.isActive ? "success" : "destructive"}>
                      {u.isActive ? "Active" : "Banned"}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-sm">{formatDate(u.createdAt).split(',')[0]}</TableCell>
                  <TableCell className="text-right space-x-2">
                    <Button variant="outline" size="sm" onClick={() => { setEditingUser(u); setWalletBal(u.walletBalance.toString()); }}>
                      <Edit2 className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost-danger" size="sm" onClick={() => toggleStatus(u)} disabled={u.role === 'admin'}>
                      <ShieldAlert className="h-4 w-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
              {filteredUsers.length === 0 && !isLoading ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center p-8 text-muted-foreground">
                    No users match that email.
                  </TableCell>
                </TableRow>
              ) : null}
            </TableBody>
          </Table>
        )}
      </Card>

      <Modal isOpen={!!editingUser} onClose={() => setEditingUser(null)} title="Edit User Wallet">
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Update Wallet Balance (₹) for {editingUser?.name}</Label>
            <Input type="number" value={walletBal} onChange={(e) => setWalletBal(e.target.value)} />
            <p className="text-xs text-muted-foreground">Use this to process manual deposits.</p>
          </div>
          <div className="flex gap-4 pt-4">
            <Button variant="outline" className="flex-1" onClick={() => setEditingUser(null)}>Cancel</Button>
            <Button className="flex-1" onClick={handleUpdate} isLoading={isPending}>Save Changes</Button>
          </div>
        </div>
      </Modal>
    </AppLayout>
  );
}
