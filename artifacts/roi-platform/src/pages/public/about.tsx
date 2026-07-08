import { PublicLayout } from "@/components/layout/public-layout";
import { Card, CardContent } from "@/components/ui/core";
import { SITE_NAME } from "@/lib/brand";
import { formatINR } from "@/lib/utils";
import { ShieldCheck, TrendingUp, Users, Zap } from "lucide-react";
import { usePlatformFeatures } from "@/hooks/use-platform-features";

export default function About() {
  const { binaryPlanEnabled } = usePlatformFeatures();
  return (
    <PublicLayout>
      <div className="max-w-4xl mx-auto px-4 py-20">
        <div className="text-center mb-16">
          <h1 className="text-4xl md:text-5xl font-display font-extrabold mb-4">
            About <span className="text-gradient">{SITE_NAME}</span>
          </h1>
          <p className="text-lg text-muted-foreground">
            A transparent, automated investment platform built on trust and technology.
          </p>
        </div>

        <div className="prose prose-invert max-w-none mb-16 space-y-6 text-muted-foreground leading-relaxed">
          <p>
            {binaryPlanEnabled
              ? `${SITE_NAME} focuses on a single flagship cycle: the Smart Binary MLM plan with a ${formatINR(200)} joining amount, left/right volume matching, optional daily ROI for members who do not promote, and a hard ${formatINR(400)} (2×) earning ceiling per activation.`
              : `${SITE_NAME} offers wallet-funded investment plans with scheduled daily ROI on business days, direct referral rewards, and a clear 2× earning cap per activation.`}
          </p>
          <p>
            Withdrawals use your wallet balance with a {formatINR(100)} minimum request and the maintenance fee shown in your dashboard. You may activate the same plan multiple
            times — each purchase is a separate position with its own 2× cap.
            {binaryPlanEnabled
              ? " When one position hits its cap, ROI, binary income, and direct bonuses pause on that position only until you activate again or upgrade."
              : " When one position hits its cap, ROI and direct bonuses pause on that position only until you activate again or upgrade."}
          </p>
          <p>
            Every rupee you invest is tracked in real-time. You can see your daily earnings, total returns, and wallet balance at any moment from your dashboard.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {[
            { icon: ShieldCheck, title: "Secure & Transparent", desc: "All transactions are recorded and verifiable. We operate with full transparency." },
            ...(binaryPlanEnabled
              ? [{ icon: TrendingUp, title: "Binary + ROI lanes", desc: "Builders earn direct binary income when both direct legs activate (no level binary); passive members can use scheduled ROI within the same 2× cap." }]
              : [{ icon: TrendingUp, title: "ROI + referrals", desc: "Earn scheduled daily ROI within your plan cap, plus direct referral bonuses when your team activates." }]),
            {
              icon: Users,
              title: "Stack plans freely",
              desc: "Activate the same package again while an earlier one is still running. Transfers and gifting another member require you to have at least one active plan.",
            },
            { icon: Zap, title: "Automated wallet credits", desc: "ROI and bonuses credit automatically; history stays exportable from your dashboard." },
          ].map((item, i) => (
            <Card key={i}>
              <CardContent className="p-6 flex gap-4">
                <div className="p-3 bg-primary/10 rounded-xl">
                  <item.icon className="h-6 w-6 text-primary" />
                </div>
                <div>
                  <h3 className="font-bold mb-1">{item.title}</h3>
                  <p className="text-sm text-muted-foreground">{item.desc}</p>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </PublicLayout>
  );
}
