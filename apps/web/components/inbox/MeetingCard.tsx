"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import { ClockIcon } from "@/components/icons";
import { Button } from "@/components/ui/Button";
import { ApiError } from "@/lib/api/client";
import type { MeetingSlot, ThreadMeetingTask } from "@/lib/api/types";
import {
  proposeMeetingTimes,
  scheduleMeeting,
} from "@/lib/services/tasks.service";

function errorText(error: unknown, fallback: string): string {
  return error instanceof ApiError ? error.message : fallback;
}

/** Same clock as the text in the reply box. */
function slotLabel(slot: MeetingSlot, timeZone: string): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone,
    weekday: "long",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  }).format(new Date(slot.start));
}

/**
 * A thread's meeting request: "Propose times" writes free slots from the
 * calendar into the reply box (nothing is sent), and once the other person
 * has picked one, "Create event" books it. Booking always takes this click.
 */
export function MeetingCard({
  task,
  threadId,
  onProposal,
}: {
  task: ThreadMeetingTask;
  threadId: string;
  /** Hands the text to the reply box. */
  onProposal: (text: string) => void;
}) {
  const queryClient = useQueryClient();
  const refresh = () =>
    queryClient.invalidateQueries({ queryKey: ["thread", threadId] });

  const proposeMutation = useMutation({
    mutationFn: () => proposeMeetingTimes(task.id),
    onSuccess: ({ text }) => {
      onProposal(text);
      void refresh();
    },
  });

  const proposal = task.meetingProposal;

  if (task.calendarEventUrl) {
    return (
      <Shell>
        <p className="min-w-0 flex-1 text-emerald-800">Event created.</p>
        <a
          href={task.calendarEventUrl}
          target="_blank"
          rel="noreferrer"
          className="font-medium text-emerald-700 hover:underline"
        >
          View in calendar
        </a>
      </Shell>
    );
  }

  if (task.status !== "PENDING") return null;

  return (
    <Shell>
      <div className="min-w-0 flex-1 basis-60 space-y-2">
        <p className="text-zinc-700">
          <span className="font-medium">Meeting request:</span>{" "}
          {task.description}
        </p>
        {proposal && (
          <CreateEvent
            key={`${task.proposedAt}-${task.pickedSlotIndex}`}
            task={task}
            onCreated={refresh}
          />
        )}
        {proposeMutation.isError && (
          <p className="text-red-600">
            {errorText(proposeMutation.error, "Could not propose times.")}
          </p>
        )}
      </div>
      <Button
        variant="secondary"
        size="sm"
        loading={proposeMutation.isPending}
        onClick={() => proposeMutation.mutate()}
      >
        {proposal ? "Propose new times" : "Propose times"}
      </Button>
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex shrink-0 flex-wrap items-start gap-3 border-b border-indigo-100 bg-indigo-50/60 px-4 py-2.5 text-xs">
      <ClockIcon className="mt-0.5 h-4 w-4 shrink-0 text-indigo-500" />
      {children}
    </div>
  );
}

function CreateEvent({
  task,
  onCreated,
}: {
  task: ThreadMeetingTask;
  onCreated: () => Promise<unknown>;
}) {
  const proposal = task.meetingProposal!;
  const picked = task.pickedSlotIndex;
  const [slotIndex, setSlotIndex] = useState(picked ?? 0);
  const [title, setTitle] = useState(proposal.title);
  const [invite, setInvite] = useState(Boolean(proposal.attendeeEmail));

  const createMutation = useMutation({
    mutationFn: () => {
      const slot = proposal.slots[slotIndex];
      return scheduleMeeting(task.id, {
        calendarAccountId: proposal.calendarAccountId,
        start: slot.start,
        end: slot.end,
        title: title.trim(),
        attendeeEmail: invite ? (proposal.attendeeEmail ?? undefined) : undefined,
      });
    },
    onSuccess: () => onCreated(),
  });

  return (
    <div className="space-y-2 rounded-md border border-indigo-200 bg-white p-2.5">
      <p className="text-zinc-600">
        {picked !== null
          ? "They picked a time. Check it and create the event:"
          : "Times offered. When they answer, create the event for the one they picked:"}
      </p>
      <div className="space-y-1">
        {proposal.slots.map((slot, index) => (
          <label key={slot.start} className="flex items-center gap-2">
            <input
              type="radio"
              name={`slot-${task.id}`}
              checked={slotIndex === index}
              onChange={() => setSlotIndex(index)}
            />
            <span className="text-zinc-800">
              {slotLabel(slot, proposal.timezone)}
            </span>
            {picked === index && (
              <span className="rounded-full bg-emerald-50 px-1.5 py-0.5 text-[10px] font-medium text-emerald-700">
                Their pick
              </span>
            )}
          </label>
        ))}
      </div>
      <input
        value={title}
        onChange={(event) => setTitle(event.target.value)}
        aria-label="Event title"
        className="w-full rounded-md border border-zinc-300 px-2 py-1 text-xs focus:border-indigo-500 focus:outline-none"
      />
      {proposal.attendeeEmail && (
        <label className="flex items-center gap-2 text-zinc-600">
          <input
            type="checkbox"
            checked={invite}
            onChange={(event) => setInvite(event.target.checked)}
          />
          <span className="min-w-0 break-words">
            Invite {proposal.attendeeEmail} (sends them a calendar invite and a
            short confirmation reply in this thread)
          </span>
        </label>
      )}
      {createMutation.isError && (
        <p className="text-red-600">
          {errorText(createMutation.error, "Could not create the event.")}
        </p>
      )}
      <Button
        size="sm"
        loading={createMutation.isPending}
        disabled={!title.trim()}
        onClick={() => createMutation.mutate()}
      >
        Create event
      </Button>
    </div>
  );
}
