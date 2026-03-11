import Link from "next/link";

export default function Home() {
  return (
    <main>
      <h1>Whiskey DB</h1>
      <p>Welcome. Use the Bottles page to browse and add entries.</p>
      <Link href="/bottles">Go to Bottles →</Link>
    </main>
  );
}
