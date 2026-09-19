export default function SetupPanel({ missing }: { missing: string[] }) {
  return (
    <div className="rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-100">
      <p className="font-medium">Setup needed</p>
      <p className="mt-1">
        Add these to <code className="font-mono">.env.local</code> (copy <code className="font-mono">.env.example</code>), then restart <code className="font-mono">pnpm dev</code>:
      </p>
      <ul className="mt-2 list-disc pl-5 font-mono">
        {missing.map((k) => (
          <li key={k}>{k}</li>
        ))}
      </ul>
      <p className="mt-3 text-xs">
        Google values come from a Web OAuth client at console.cloud.google.com with redirect URI
        <code className="ml-1 font-mono">http://localhost:3000/api/auth/callback/google</code>. The gateway key comes from Vercel → AI Gateway → API Keys.
      </p>
    </div>
  );
}
