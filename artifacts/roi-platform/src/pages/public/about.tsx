import { PublicLayout } from "@/components/layout/public-layout";
import { Card, CardContent } from "@/components/ui/core";
import { SITE_NAME } from "@/lib/brand";
import { ShieldCheck, TrendingUp, Users, Zap } from "lucide-react";

export default function About() {
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
            {SITE_NAME} was founded with a single mission: to make daily ROI investing accessible, transparent, and automated for everyone. We believe that wealth creation should not be limited to the privileged few.
          </p>
          <p>
            Our platform offers fixed investment plans with a guaranteed 0.5% daily ROI, paid every working day (Monday to Friday). Your investment automatically stops when you earn 2x your principal, or after 400 days — whichever comes first.
          </p>
          <p>
            Every rupee you invest is tracked in real-time. You can see your daily earnings, total returns, and wallet balance at any moment from your dashboard.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {[
            { icon: ShieldCheck, title: "Secure & Transparent", desc: "All transactions are recorded and verifiable. We operate with full transparency." },
            { icon: TrendingUp, title: "Daily ROI", desc: "Earn 0.5% daily on weekdays. Your wallet is credited automatically every day." },
            { icon: Users, title: "Dedicated Support", desc: "Our team is available to assist you with any questions or concerns." },
            { icon: Zap, title: "Automated Payouts", desc: "ROI is credited automatically. No manual processes, no delays." },
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
