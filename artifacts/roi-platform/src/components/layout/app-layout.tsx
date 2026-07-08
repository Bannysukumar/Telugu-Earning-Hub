import { Link, useLocation } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import {
  LayoutDashboard,
  Wallet,
  ArrowRightLeft,
  User,
  LogOut,
  Users,
  Layers,
  Activity,
  Menu,
  X,
  Bell,
  History,
  ScrollText,
  Settings,
  Banknote,
  UserPlus,
  GitBranch,
  SendHorizontal,
  Gift,
  Percent,
  Sparkles,
} from "lucide-react";
import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  getGetMyBinaryTreeQueryOptions,
  getGetMyDirectLevelQueryOptions,
  getGetMySponsorTreeQueryOptions,
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/core";
import { cn } from "@/lib/utils";
import { BrandMark } from "@/lib/brand";
import { usePlatformFeatures } from "@/hooks/use-platform-features";

export function AppLayout({ children, isAdmin = false }: { children: React.ReactNode, isAdmin?: boolean }) {
  const { user, logout } = useAuth();
  const queryClient = useQueryClient();
  const [location] = useLocation();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const { binaryPlanEnabled } = usePlatformFeatures();

  useEffect(() => {
    if (!user) return;
    void queryClient.prefetchQuery(getGetMyDirectLevelQueryOptions());
    void queryClient.prefetchQuery(getGetMySponsorTreeQueryOptions({ maxDepth: 5 }));
    if (binaryPlanEnabled) {
      void queryClient.prefetchQuery(getGetMyBinaryTreeQueryOptions({ maxDepth: 5 }));
    }
  }, [user, queryClient, binaryPlanEnabled]);

  const userRoutes = [
    { name: "Dashboard", path: "/dashboard", icon: LayoutDashboard },
    { name: "Smart Growth ₹200", path: "/smart-growth", icon: Sparkles },
    { name: "Direct level", path: "/direct-level", icon: UserPlus },
    { name: "Investment team tree", path: "/investment-tree-level", icon: Layers },
    ...(binaryPlanEnabled ? [{ name: "Binary tree", path: "/tree-level", icon: GitBranch }] : []),
    { name: "My Investments", path: "/investments", icon: Activity },
    { name: "Income History", path: "/income-history", icon: History },
    { name: "Withdraw Funds", path: "/withdraw", icon: ArrowRightLeft },
    { name: "Add funds", path: "/add-fund", icon: Banknote },
    { name: "Send funds", path: "/transfer-funds", icon: SendHorizontal },
    { name: "Gift a plan", path: "/gift-plan", icon: Gift },
    { name: "My Profile", path: "/profile", icon: User },
  ];

  const adminRoutes = [
    { name: "Overview", path: "/admin/dashboard", icon: LayoutDashboard },
    { name: "Direct level", path: "/admin/direct-level", icon: UserPlus },
    { name: "Investment team tree", path: "/admin/investment-tree-level", icon: Layers },
    ...(binaryPlanEnabled ? [{ name: "Binary tree", path: "/admin/tree-level", icon: GitBranch }] : []),
    { name: "Manage Users", path: "/admin/users", icon: Users },
    { name: "Investment Plans", path: "/admin/plans", icon: Layers },
    { name: "Smart Growth Plan", path: "/admin/growth-plan", icon: Sparkles },
    { name: "Level income", path: "/admin/level-income", icon: Percent },
    { name: "All Investments", path: "/admin/investments", icon: Activity },
    { name: "Income Logs", path: "/admin/income-logs", icon: ScrollText },
    { name: "Withdrawal Requests", path: "/admin/withdrawals", icon: ArrowRightLeft },
    { name: "Withdrawal fees", path: "/admin/withdrawal-fees", icon: Percent },
    { name: "Deposits (QR)", path: "/admin/deposits", icon: Banknote },
    { name: "Settings", path: "/admin/settings", icon: Settings },
  ];

  const routes = isAdmin ? adminRoutes : userRoutes;

  return (
    <div className="min-h-screen bg-background flex flex-col md:flex-row text-foreground">
      {/* Mobile Header */}
      <div className="md:hidden flex items-center justify-between p-4 border-b border-border bg-card">
        <BrandMark
          href={isAdmin ? "/admin/dashboard" : "/dashboard"}
          logoClassName="h-8 w-8"
          textClassName="text-lg"
        />
        <button onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)} className="text-foreground">
          {isMobileMenuOpen ? <X /> : <Menu />}
        </button>
      </div>

      {/* Sidebar */}
      <aside className={cn(
        "fixed inset-y-0 left-0 z-50 w-72 bg-card border-r border-border flex flex-col transition-transform duration-300 md:relative md:translate-x-0",
        isMobileMenuOpen ? "translate-x-0" : "-translate-x-full"
      )}>
        <div className="h-20 flex items-center px-6 border-b border-border gap-2 min-w-0">
          <BrandMark
            href={isAdmin ? "/admin/dashboard" : "/dashboard"}
            className="min-w-0 flex-1"
            logoClassName="h-8 w-8 shrink-0"
            textClassName="text-lg xl:text-2xl truncate"
          />
          {isAdmin ? (
            <span className="text-xs bg-primary/20 text-primary px-2 py-0.5 rounded shrink-0">ADMIN</span>
          ) : null}
        </div>
        
        <div className="flex-1 overflow-y-auto py-6 px-4 space-y-1">
          {routes.map((route) => {
            const Icon = route.icon;
            const isActive = location === route.path;
            return (
              <Link 
                key={route.path} 
                href={route.path}
                onClick={() => setIsMobileMenuOpen(false)}
                className={cn(
                  "flex items-center gap-3 px-4 py-3 rounded-xl font-medium transition-all group",
                  isActive 
                    ? "bg-primary/10 text-primary" 
                    : "text-muted-foreground hover:bg-secondary hover:text-foreground"
                )}
              >
                <Icon className={cn("h-5 w-5", isActive ? "text-primary" : "text-muted-foreground group-hover:text-foreground")} />
                {route.name}
              </Link>
            );
          })}
        </div>

        <div className="p-4 border-t border-border bg-background/30">
          <div className="flex items-center gap-3 px-4 py-3 mb-2">
            <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center text-primary font-bold">
              {user?.name.charAt(0)}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold truncate">{user?.name}</p>
              <p className="text-xs text-muted-foreground truncate">{user?.email}</p>
            </div>
          </div>
          <Button variant="ghost-danger" className="w-full justify-start gap-3" onClick={logout}>
            <LogOut className="h-5 w-5" /> Logout
          </Button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col min-w-0 h-screen overflow-hidden">
        {/* Topbar Desktop */}
        <header className="hidden md:flex h-20 items-center justify-between px-8 border-b border-border bg-background/50 backdrop-blur-sm sticky top-0 z-30">
          <h1 className="text-2xl font-display font-bold">
            {routes.find(r => r.path === location)?.name || 'Dashboard'}
          </h1>
          <div className="flex items-center gap-4">
            <Button variant="outline" size="icon" className="rounded-full">
              <Bell className="h-5 w-5" />
            </Button>
            <div className="bg-secondary px-4 py-2 rounded-full flex items-center gap-2">
              <Wallet className="h-4 w-4 text-primary" />
              <span className="font-semibold">₹{user?.walletBalance.toLocaleString('en-IN')}</span>
            </div>
          </div>
        </header>

        <div className="flex-1 overflow-auto p-4 md:p-8">
          {children}
        </div>
      </main>

      {/* Mobile overlay */}
      {isMobileMenuOpen && (
        <div 
          className="fixed inset-0 bg-black/60 z-40 md:hidden backdrop-blur-sm"
          onClick={() => setIsMobileMenuOpen(false)}
        />
      )}
    </div>
  );
}
