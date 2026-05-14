import { PublicLayout } from "@/components/layout/public-layout";
import { Card, CardContent, Button, Input, Label, Textarea } from "@/components/ui/core";
import { Mail, Phone, MapPin } from "lucide-react";
import { toast } from "sonner";

export default function Contact() {
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    toast.success("Your message has been sent! We will get back to you within 24 hours.");
  };

  return (
    <PublicLayout>
      <div className="max-w-5xl mx-auto px-4 py-20">
        <div className="text-center mb-16">
          <h1 className="text-4xl md:text-5xl font-display font-extrabold mb-4">
            Get in <span className="text-gradient">Touch</span>
          </h1>
          <p className="text-lg text-muted-foreground">Have a question? We're here to help.</p>
        </div>

        <div className="grid md:grid-cols-2 gap-12">
          <div className="space-y-8">
            {[
              { icon: Mail, title: "Email Us", info: "support@telugu-earning-hub.com" },
              { icon: Phone, title: "Call Us", info: "+91 99999 88888" },
              { icon: MapPin, title: "Office", info: "Mumbai, Maharashtra, India" },
            ].map((item, i) => (
              <div key={i} className="flex items-start gap-4">
                <div className="p-3 bg-primary/10 rounded-xl">
                  <item.icon className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <h3 className="font-bold">{item.title}</h3>
                  <p className="text-muted-foreground">{item.info}</p>
                </div>
              </div>
            ))}
          </div>

          <Card>
            <CardContent className="p-6">
              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <Label>Full Name</Label>
                  <Input className="mt-1" placeholder="Your name" required />
                </div>
                <div>
                  <Label>Email</Label>
                  <Input type="email" className="mt-1" placeholder="you@example.com" required />
                </div>
                <div>
                  <Label>Message</Label>
                  <Textarea className="mt-1" placeholder="Your message..." rows={4} required />
                </div>
                <Button type="submit" className="w-full">Send Message</Button>
              </form>
            </CardContent>
          </Card>
        </div>
      </div>
    </PublicLayout>
  );
}
