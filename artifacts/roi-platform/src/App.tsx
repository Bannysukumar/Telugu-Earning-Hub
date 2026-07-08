import { Switch, Route, Router as WouterRouter, Redirect } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "sonner";
import { AuthProvider, useAuth } from "@/hooks/use-auth";
import { PlatformFeaturesProvider } from "@/hooks/use-platform-features";
import { RequireBinaryPlan } from "@/components/require-binary-plan";
import "@/lib/fetch-interceptor";

import NotFound from "@/pages/not-found";
import Home from "@/pages/public/home";
import PublicPlans from "@/pages/public/plans";
import About from "@/pages/public/about";
import Vision from "@/pages/public/vision";
import Contact from "@/pages/public/contact";
import Privacy from "@/pages/public/privacy";
import Terms from "@/pages/public/terms";
import BinaryPlan from "@/pages/public/binary-plan";
import Login from "@/pages/auth/login";
import Register from "@/pages/auth/register";
import ForgotPassword from "@/pages/auth/forgot-password";
import Dashboard from "@/pages/user/dashboard";
import Investments from "@/pages/user/investments";
import Withdrawals from "@/pages/user/withdrawals";
import Profile from "@/pages/user/profile";
import AdminDashboard from "@/pages/admin/dashboard";
import AdminUsers from "@/pages/admin/users";
import AdminPlans from "@/pages/admin/plans";
import AdminWithdrawals from "@/pages/admin/withdrawals";
import AdminInvestments from "@/pages/admin/investments";
import AdminIncomeLogs from "@/pages/admin/income-logs";
import AdminSettings from "@/pages/admin/settings";
import AdminDeposits from "@/pages/admin/deposits";
import AdminDirectLevel from "@/pages/admin/direct-level";
import AdminTreeLevel from "@/pages/admin/tree-level";
import AdminLevelIncome from "@/pages/admin/level-income";
import AdminWithdrawalFees from "@/pages/admin/withdrawal-fees";
import IncomeHistory from "@/pages/user/income-history";
import AddFund from "@/pages/user/add-fund";
import DirectLevel from "@/pages/user/direct-level";
import TreeLevel from "@/pages/user/tree-level";
import InvestmentTreeLevel from "@/pages/user/investment-tree-level";
import AdminInvestmentTreeLevel from "@/pages/admin/investment-tree-level";
import TransferFunds from "@/pages/user/transfer-funds";
import GiftPlan from "@/pages/user/gift-plan";
import AdminGrowthPlan from "@/pages/admin/growth-plan";
import SmartGrowthPlan from "@/pages/user/smart-growth";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      staleTime: 30000,
    },
  },
});

function ProtectedRoute({ component: Component, adminOnly = false }: { component: React.ComponentType; adminOnly?: boolean }) {
  const { user, isLoading } = useAuth();
  if (isLoading) return <div className="min-h-screen flex items-center justify-center bg-background"><div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" /></div>;
  if (!user) return <Redirect to="/login" />;
  if (adminOnly && user.role !== "admin") return <Redirect to="/dashboard" />;
  return <Component />;
}

function Router() {
  return (
    <Switch>
      <Route path="/" component={Home} />
      <Route path="/about" component={About} />
      <Route path="/vision" component={Vision} />
      <Route path="/plans" component={PublicPlans} />
      <Route path="/binary-plan" component={() => <RequireBinaryPlan><BinaryPlan /></RequireBinaryPlan>} />
      <Route path="/contact" component={Contact} />
      <Route path="/privacy" component={Privacy} />
      <Route path="/terms" component={Terms} />
      <Route path="/login" component={Login} />
      <Route path="/register" component={Register} />
      <Route path="/forgot-password" component={ForgotPassword} />
      <Route path="/dashboard" component={() => <ProtectedRoute component={Dashboard} />} />
      <Route path="/investments" component={() => <ProtectedRoute component={Investments} />} />
      <Route path="/income-history" component={() => <ProtectedRoute component={IncomeHistory} />} />
      <Route path="/withdraw" component={() => <ProtectedRoute component={Withdrawals} />} />
      <Route path="/add-fund" component={() => <ProtectedRoute component={AddFund} />} />
      <Route path="/transfer-funds" component={() => <ProtectedRoute component={TransferFunds} />} />
      <Route path="/gift-plan" component={() => <ProtectedRoute component={GiftPlan} />} />
      <Route path="/smart-growth" component={() => <ProtectedRoute component={SmartGrowthPlan} />} />
      <Route path="/direct-level" component={() => <ProtectedRoute component={DirectLevel} />} />
      <Route
        path="/investment-tree-level"
        component={() => <ProtectedRoute component={InvestmentTreeLevel} />}
      />
      <Route
        path="/tree-level"
        component={() => (
          <ProtectedRoute
            component={() => (
              <RequireBinaryPlan>
                <TreeLevel />
              </RequireBinaryPlan>
            )}
          />
        )}
      />
      <Route path="/profile" component={() => <ProtectedRoute component={Profile} />} />
      <Route path="/admin/dashboard" component={() => <ProtectedRoute component={AdminDashboard} adminOnly />} />
      <Route path="/admin/users" component={() => <ProtectedRoute component={AdminUsers} adminOnly />} />
      <Route path="/admin/plans" component={() => <ProtectedRoute component={AdminPlans} adminOnly />} />
      <Route path="/admin/growth-plan" component={() => <ProtectedRoute component={AdminGrowthPlan} adminOnly />} />
      <Route path="/admin/level-income" component={() => <ProtectedRoute component={AdminLevelIncome} adminOnly />} />
      <Route path="/admin/withdrawals" component={() => <ProtectedRoute component={AdminWithdrawals} adminOnly />} />
      <Route
        path="/admin/withdrawal-fees"
        component={() => <ProtectedRoute component={AdminWithdrawalFees} adminOnly />}
      />
      <Route path="/admin/investments" component={() => <ProtectedRoute component={AdminInvestments} adminOnly />} />
      <Route path="/admin/income-logs" component={() => <ProtectedRoute component={AdminIncomeLogs} adminOnly />} />
      <Route path="/admin/settings" component={() => <ProtectedRoute component={AdminSettings} adminOnly />} />
      <Route path="/admin/deposits" component={() => <ProtectedRoute component={AdminDeposits} adminOnly />} />
      <Route path="/admin/direct-level" component={() => <ProtectedRoute component={AdminDirectLevel} adminOnly />} />
      <Route
        path="/admin/investment-tree-level"
        component={() => <ProtectedRoute component={AdminInvestmentTreeLevel} adminOnly />}
      />
      <Route
        path="/admin/tree-level"
        component={() => (
          <ProtectedRoute
            adminOnly
            component={() => (
              <RequireBinaryPlan>
                <AdminTreeLevel />
              </RequireBinaryPlan>
            )}
          />
        )}
      />
      <Route path="/admin" component={() => <Redirect to="/admin/dashboard" />} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <PlatformFeaturesProvider>
          <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
            <Router />
          </WouterRouter>
        </PlatformFeaturesProvider>
        <Toaster richColors position="top-right" />
      </AuthProvider>
    </QueryClientProvider>
  );
}

export default App;
