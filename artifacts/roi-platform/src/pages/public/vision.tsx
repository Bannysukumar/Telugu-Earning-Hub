import { PublicLayout } from "@/components/layout/public-layout";
import { Card, CardContent } from "@/components/ui/core";
import { SITE_NAME } from "@/lib/brand";
import { Eye, Heart, LineChart, Target } from "lucide-react";

export default function Vision() {
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
            We envision a platform where routine savings can grow through transparent, rules-based daily returns — with automation handling disbursements so investors spend less time chasing updates and more time planning their goals.
          </p>
          <p>
            Success means reliable weekday accruals, clear stop rules at 2× principal or 400 days, and tools that let you see every credit in one place. We are investing in security, auditability, and a calm, professional experience across mobile and desktop.
          </p>
          <p>
            Long term, we want {SITE_NAME} to be synonymous with disciplined ROI investing in our community: no hype, no referral games — just clear plans, admin oversight when needed, and technology you can trust.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {[
            { icon: Eye, title: "Clarity first", desc: "You always know how your plan works: rate, schedule, caps, and history." },
            { icon: LineChart, title: "Measured growth", desc: "Returns follow published rules; automation runs on a fixed IST schedule." },
            { icon: Target, title: "Defined outcomes", desc: "Plans complete at 2× or 400 days — predictable boundaries, not open-ended promises." },
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
