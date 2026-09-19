import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default function SetupPanel({ missing }: { missing: string[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Setup needed</CardTitle>
        <CardDescription>
          Add these to <code className="font-mono">.env.local</code> (copy <code className="font-mono">.env.example</code>), then restart <code className="font-mono">pnpm dev</code>.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ul className="list-disc pl-5 font-mono text-sm">
          {missing.map((k) => <li key={k}>{k}</li>)}
        </ul>
        <p className="mt-3 text-xs text-muted-foreground">
          Google values come from a Web OAuth client at console.cloud.google.com with redirect URI
          <code className="ml-1 font-mono">http://localhost:3000/api/auth/callback/google</code>. The gateway key comes from Vercel → AI Gateway → API Keys.
        </p>
      </CardContent>
    </Card>
  );
}
