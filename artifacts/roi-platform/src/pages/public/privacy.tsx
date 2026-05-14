import { PublicLayout } from "@/components/layout/public-layout";
import { SITE_NAME } from "@/lib/brand";

export default function Privacy() {
  return (
    <PublicLayout>
      <div className="max-w-3xl mx-auto px-4 py-20">
        <h1 className="text-4xl font-display font-extrabold mb-4">Privacy Policy</h1>
        <p className="text-muted-foreground mb-12">Last updated: March 2026</p>
        <div className="prose prose-invert max-w-none space-y-6 text-muted-foreground leading-relaxed">
          <h2 className="text-xl font-bold text-foreground">1. Information We Collect</h2>
          <p>We collect your name, email address, and investment data when you register and use our platform.</p>
          <h2 className="text-xl font-bold text-foreground">2. How We Use Your Information</h2>
          <p>Your data is used solely to operate and improve {SITE_NAME}. We do not sell or share your personal information with third parties.</p>
          <h2 className="text-xl font-bold text-foreground">3. Data Security</h2>
          <p>We use industry-standard security measures to protect your data including encryption at rest and in transit.</p>
          <h2 className="text-xl font-bold text-foreground">4. Your Rights</h2>
          <p>You may request deletion of your account and associated data at any time by contacting our support team.</p>
          <h2 className="text-xl font-bold text-foreground">5. Contact</h2>
          <p>For privacy concerns, contact us at privacy@telugu-earning-hub.com</p>
        </div>
      </div>
    </PublicLayout>
  );
}
