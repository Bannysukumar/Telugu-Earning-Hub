import { Link } from "wouter";
import { useLogin } from "@workspace/api-client-react";
import { useAuth } from "@/hooks/use-auth";
import { Button, Input, Label, Card } from "@/components/ui/core";
import { Mail, Lock } from "lucide-react";
import { BrandMark } from "@/lib/brand";
import { toast } from "sonner";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";

const loginSchema = z.object({
  email: z.string().email("Invalid email address"),
  password: z.string().min(1, "Password is required"),
});

type LoginForm = z.infer<typeof loginSchema>;

export default function Login() {
  const { login: setAuth } = useAuth();
  const { mutate: doLogin, isPending } = useLogin();
  const { register, handleSubmit, formState: { errors } } = useForm<LoginForm>({
    resolver: zodResolver(loginSchema)
  });

  const onSubmit = (data: LoginForm) => {
    doLogin({ data }, {
      onSuccess: (res) => {
        setAuth(res.token, res.user);
        toast.success("Welcome back!");
        window.location.href = res.user.role === 'admin' ? '/admin/dashboard' : '/dashboard';
      },
      onError: (err: any) => {
        toast.error(err.message || "Invalid credentials");
      }
    });
  };

  return (
    <div className="min-h-screen flex bg-background relative">
      <div className="absolute inset-0 z-0">
        <img src={`${import.meta.env.BASE_URL}images/hero-bg.png`} className="w-full h-full object-cover opacity-20 mix-blend-screen" alt="bg"/>
      </div>
      
      <div className="flex-1 flex items-center justify-center p-4 relative z-10">
        <Card className="w-full max-w-md p-8 glass-card">
          <div className="flex justify-center mb-8">
            <BrandMark
              href="/"
              showText={false}
              className="group"
              logoClassName="h-14 w-14 group-hover:scale-105 transition-transform"
            />
          </div>
          
          <h2 className="text-2xl font-display font-bold text-center mb-2">Welcome Back</h2>
          <p className="text-center text-muted-foreground mb-8">Sign in to manage your investments</p>
          
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
            <div className="space-y-2">
              <Label>Email</Label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
                <Input {...register("email")} className="pl-10" placeholder="you@example.com" />
              </div>
              {errors.email && <p className="text-sm text-destructive">{errors.email.message}</p>}
            </div>
            
            <div className="space-y-2">
              <div className="flex justify-between">
                <Label>Password</Label>
                <Link href="/forgot-password" className="text-xs text-primary hover:underline font-medium">
                  Forgot password?
                </Link>
              </div>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
                <Input type="password" {...register("password")} className="pl-10" placeholder="••••••••" />
              </div>
              {errors.password && <p className="text-sm text-destructive">{errors.password.message}</p>}
            </div>
            
            <Button type="submit" className="w-full" size="lg" isLoading={isPending}>
              Sign In
            </Button>
          </form>
          
          <p className="text-center mt-6 text-sm text-muted-foreground">
            Don't have an account? <Link href="/register" className="text-primary hover:underline font-medium">Sign up</Link>
          </p>
        </Card>
      </div>
    </div>
  );
}
