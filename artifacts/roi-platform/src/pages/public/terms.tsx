import { PublicLayout } from "@/components/layout/public-layout";
import { SITE_NAME } from "@/lib/brand";

export default function Terms() {
  return (
    <PublicLayout>
      <div className="max-w-3xl mx-auto px-4 py-20">
        <h1 className="text-4xl font-display font-extrabold mb-4">Terms & Conditions</h1>
        <p className="text-muted-foreground mb-12">Last updated: March 2026</p>
        <div className="prose prose-invert max-w-none space-y-6 text-muted-foreground leading-relaxed">
          <h2 className="text-xl font-bold text-foreground">1. Investment Terms</h2>
          <p>Daily ROI of 0.5% is applied Monday to Friday only. ROI stops automatically when the total earned reaches 2x the investment amount or after 400 business days, whichever comes first.</p>
          <h2 className="text-xl font-bold text-foreground">2. Withdrawals</h2>
          <p>Minimum withdrawal amount is ₹500. Withdrawal requests are processed within 3-5 business days after admin approval.</p>
          <h2 className="text-xl font-bold text-foreground">3. Account Responsibilities</h2>
          <p>You are responsible for maintaining the confidentiality of your account credentials. {SITE_NAME} is not liable for losses due to unauthorized access.</p>
          <h2 className="text-xl font-bold text-foreground">4. No Referral System</h2>
          <p>{SITE_NAME} does not operate any referral, MLM, or pyramid scheme. All earnings come solely from your own investments.</p>
          <h2 className="text-xl font-bold text-foreground">5. Changes to Terms</h2>
          <p>We reserve the right to update these terms at any time. Continued use of the platform constitutes acceptance of the revised terms.</p>
        </div>
      </div>
    </PublicLayout>
  );
}
