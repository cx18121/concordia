import WorldIDVerify from "@/components/WorldIDVerify";

export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-8 p-8">
      <div className="flex flex-col items-center gap-4 text-center">
        <h1 className="text-3xl font-semibold tracking-tight">Community Hedge Fund DAO</h1>
        <p className="text-zinc-500 max-w-sm">
          Verify you are a unique human to join. One person, one account.
        </p>
        <WorldIDVerify />
      </div>
    </main>
  );
}
