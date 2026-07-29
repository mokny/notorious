import { useState, type FormEvent } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import { authApi } from "../lib/api/resources.js";
import { ApiError } from "../lib/api/client.js";
import { useAuth } from "../context/AuthContext.js";
import { Button } from "../components/ui/Button.js";
import { TextField } from "../components/ui/TextField.js";

export function RegisterPage() {
  const { user, refetch } = useAuth();
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setSubmitting] = useState(false);

  if (user) return <Navigate to="/" replace />;

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await authApi.register({ name, email, password });
      await refetch();
      navigate("/");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Registration failed");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-sm space-y-6">
        <div className="text-center">
          <h1 className="text-2xl font-semibold">Create your account</h1>
          <p className="mt-1 text-sm text-ink-muted">A personal workspace is created automatically</p>
        </div>
        <form onSubmit={handleSubmit} className="space-y-3 rounded-xl border border-border bg-surface-raised p-6">
          <TextField placeholder="Full name" value={name} onChange={(e) => setName(e.target.value)} required />
          <TextField type="email" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          <TextField
            type="password"
            placeholder="Password (min. 8 characters)"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            minLength={8}
            required
          />
          {error && <p className="text-sm text-red-500">{error}</p>}
          <Button type="submit" variant="primary" className="w-full" disabled={isSubmitting}>
            {isSubmitting ? "Creating account…" : "Create account"}
          </Button>
        </form>
        <p className="text-center text-sm text-ink-muted">
          Already have an account?{" "}
          <Link to="/login" className="text-accent hover:underline">
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
