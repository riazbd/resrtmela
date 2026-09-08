"use client";

/**
 * The last boundary: an error thrown by the root layout itself, where no
 * provider, no styling and no navigation is available. It has to render its
 * own <html> and cannot import anything that assumes context.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en">
      <body style={{ fontFamily: "Segoe UI, Arial, sans-serif", padding: "48px", textAlign: "center", color: "#0f172a" }}>
        <h1 style={{ fontSize: 18, fontWeight: 700 }} lang="bn">অ্যাপটি চালু হতে পারেনি</h1>
        <p style={{ color: "#64748b", fontSize: 14 }}>The application failed to start.</p>
        {error.digest && (
          <p style={{ color: "#94a3b8", fontSize: 12 }}>Reference {error.digest}</p>
        )}
        <button
          onClick={reset}
          style={{ marginTop: 16, background: "#0f766e", color: "#fff", border: 0, borderRadius: 8, padding: "10px 20px", fontSize: 14, cursor: "pointer" }}
        >
          আবার চেষ্টা করুন · Try again
        </button>
      </body>
    </html>
  );
}
