import ChatClient from "./chat-client";

export default function Home() {
  return (
    <div className="flex flex-col flex-1 items-center bg-zinc-50 font-sans dark:bg-black min-h-screen">
      <main className="flex flex-1 w-full max-w-3xl flex-col items-center py-12 px-6">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-semibold tracking-tight text-black dark:text-zinc-50">
            Alt History Explorer
          </h1>
          <p className="text-zinc-500 dark:text-zinc-400 mt-2 text-sm">
            Pick a moment in history. Change it. See what unfolds.
          </p>
        </div>
        <ChatClient />
      </main>
    </div>
  );
}
