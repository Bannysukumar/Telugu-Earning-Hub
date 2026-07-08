import { PublicLayout } from "@/components/layout/public-layout";
import { SITE_NAME } from "@/lib/brand";
import { formatINR } from "@/lib/utils";
import { usePlatformFeatures } from "@/hooks/use-platform-features";

export default function Terms() {
  const { binaryPlanEnabled } = usePlatformFeatures();
  return (
    <PublicLayout>
      <div className="max-w-3xl mx-auto px-4 py-20">
        <h1 className="text-4xl font-display font-extrabold mb-4">Terms & Conditions</h1>
        <p className="text-muted-foreground mb-12">Last updated: March 2026</p>
        <div className="prose prose-invert max-w-none space-y-6 text-muted-foreground leading-relaxed">
          <h2 className="text-xl font-bold text-foreground">1. Investment plans & earnings</h2>
          <p>
            {binaryPlanEnabled
              ? `The flagship package is the Smart Binary MLM plan with a ${formatINR(200)} joining amount. Members may earn through direct referral bonuses, direct binary matching when one direct left and one direct right have activated (no level binary from downline teams), and (where configured) a daily ROI track. Total credited earnings per activation are capped at twice the joining amount (${formatINR(400)} for the ${formatINR(200)} cycle). When the cap is reached, all automated income types stop until the member purchases the plan again or upgrades to a higher tier.`
              : "Members may earn through direct referral bonuses and (where configured on a plan) scheduled daily ROI. Total credited earnings per activation are capped at twice the plan’s maximum return. When the cap is reached, automated income stops until the member activates again or upgrades."}
          </p>
          <h2 className="text-xl font-bold text-foreground">2. Referral requirement</h2>
          <p>
            Withdrawals are available from your wallet balance subject to minimum amounts, fees, and admin approval. Referral bonuses
            {binaryPlanEnabled ? " and binary income" : ""} remain subject to the global 2× cap and any administrative holds.
          </p>
          <h2 className="text-xl font-bold text-foreground">3. Withdrawals & fees</h2>
          <p>
            Minimum withdrawal amount is {formatINR(100)}. A company maintenance fee (default 10% unless otherwise published in-app) applies to each approved withdrawal based on the gross requested amount. Withdrawal requests are processed after admin review within the timelines communicated inside the product.
          </p>
          <h2 className="text-xl font-bold text-foreground">4. Account responsibilities</h2>
          <p>You are responsible for maintaining the confidentiality of your account credentials. {SITE_NAME} is not liable for losses due to unauthorized access.</p>
          <h2 className="text-xl font-bold text-foreground">5. Income representations</h2>
          <p>
            Marketing on this site describes potential outcomes. Actual earnings depend on network activity, pairing availability, and plan configuration. Past performance of any example does not guarantee future results.
          </p>
          <h2 className="text-xl font-bold text-foreground">6. Changes to terms</h2>
          <p>We reserve the right to update these terms at any time. Continued use of the platform constitutes acceptance of the revised terms.</p>
        </div>
      </div>
    </PublicLayout>
  );
}
