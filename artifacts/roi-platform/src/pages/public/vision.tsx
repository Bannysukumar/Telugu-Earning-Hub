import { PublicLayout } from "@/components/layout/public-layout";
import { Card, CardContent } from "@/components/ui/core";
import { SITE_NAME } from "@/lib/brand";
import { formatINR } from "@/lib/utils";
import { Eye, Heart, LineChart, Target } from "lucide-react";
import { usePlatformFeatures } from "@/hooks/use-platform-features";

export default function Vision() {
  const { binaryPlanEnabled } = usePlatformFeatures();
  return (
    <PublicLayout>
      <div className="max-w-4xl mx-auto px-4 py-20">
        <div className="text-center mb-16">
          <h1 className="text-4xl md:text-5xl font-display font-extrabold mb-4">
            Our <span className="text-gradient">Vision</span>
          </h1>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
            What we are building — and how we measure success for every investor on {SITE_NAME}.
          </p>
        </div>

        <div className="prose prose-invert max-w-none mb-16 space-y-6 text-muted-foreground leading-relaxed">
          <p>
            {binaryPlanEnabled
              ? `We are building a disciplined community where small cheques (${formatINR(200)}) compound through binary structure, transparent ledgers, and automation that runs on a fixed IST payout cadence.`
              : "We are building a disciplined community funded through transparent wallets, scheduled ROI, and referral growth — with automation on a fixed IST payout cadence."}
          </p>
          <p>
            {binaryPlanEnabled
              ? "Success means everyone understands the per-position 2× cap, how to stack multiple activations of the same plan, and how binary pairs plus optional ROI interact before they fund a wallet."
              : "Success means everyone understands the per-position 2× cap, how to stack multiple activations of the same plan, and how ROI plus referral bonuses interact before they fund a wallet."}
          </p>
          <p>
            Long term, {SITE_NAME} should stand for sustainable MLM design: capped liabilities, upgrade paths after each cycle, and admin tooling that can pause or explain any position instantly.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {[
            { icon: Eye, title: "Clarity first", desc: "You always know how your plan works: rate, schedule, caps, and history." },
            {
              icon: LineChart,
              title: "Measured growth",
              desc: binaryPlanEnabled
                ? "Binary pair income, direct bonuses, and ROI all feed one wallet with a shared 2× ceiling per cycle."
                : "Direct bonuses and ROI feed one wallet with a shared 2× ceiling per cycle.",
            },
            { icon: Target, title: "Defined outcomes", desc: `Each ${formatINR(200)} activation stops paying once ${formatINR(400)} is credited — then you rejoin or climb the upgrade ladder.` },
            { icon: Heart, title: "Community trust", desc: "Support, fair processes, and admin controls aligned with investor protection." },
          ].map((item, i) => (
            <Card key={i}>
              <CardContent className="p-6 flex gap-4">
                <div className="p-3 bg-primary/10 rounded-xl shrink-0 h-fit">
                  <item.icon className="h-6 w-6 text-primary" />
                </div>
                <div>
                  <h3 className="font-display font-semibold text-lg mb-1">{item.title}</h3>
                  <p className="text-sm text-muted-foreground leading-relaxed">{item.desc}</p>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </PublicLayout>
  );
}
