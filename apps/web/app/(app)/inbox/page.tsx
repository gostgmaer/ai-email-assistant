import { InboxIcon } from "@/components/icons";

export default function InboxPage() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 bg-zinc-50 text-center">
      <div className="flex h-16 w-16 items-center justify-center rounded-full bg-zinc-100">
        <InboxIcon className="h-8 w-8 text-zinc-400" />
      </div>
      <div>
        <p className="text-sm font-medium text-zinc-900">
          Select a conversation
        </p>
        <p className="mt-1 max-w-xs text-sm text-zinc-500">
          Choose an email from the list to read it here.
        </p>
      </div>
    </div>
  );
}
