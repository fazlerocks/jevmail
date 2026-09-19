/** The Gmail "M", used to mark where the mail comes from. */
export default function GmailMark({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size * 0.75} viewBox="0 0 52 39" aria-label="Gmail" role="img">
      <path d="M3.5 39h8.3V18.8L0 9.9v25.6C0 37.4 1.6 39 3.5 39z" fill="#4285F4" />
      <path d="M40.2 39h8.3c2 0 3.5-1.6 3.5-3.5V9.9L40.2 18.8V39z" fill="#34A853" />
      <path d="M40.2 3.5v15.3L52 9.9V5.3c0-4.4-5-6.9-8.5-4.2l-3.3 2.4z" fill="#FBBC04" />
      <path d="M11.8 18.8V3.5L26 14.1 40.2 3.5v15.3L26 29.4 11.8 18.8z" fill="#EA4335" />
      <path d="M0 5.3v4.6l11.8 8.9V3.5L8.5 1.1C5 -1.6 0 .9 0 5.3z" fill="#C5221F" />
    </svg>
  );
}
