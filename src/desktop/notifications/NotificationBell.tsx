import { useEffect, useState } from "react";
import { Bell } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "../auth/AuthProvider";

type Notification = {
  id: string;
  title: string;
  body: string;
  created_at: string;
};

type Props = {
  onOpen: () => void;
};

export default function NotificationBell({ onOpen }: Props) {
  const { user } = useAuth();
  const [unread, setUnread] = useState(0);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;

    const compute = async () => {
      const [{ data: notifs }, { data: reads }] = await Promise.all([
        supabase.from("notifications").select("id"),
        supabase.from("notification_reads").select("notification_id").eq("user_id", user.id),
      ]);
      if (cancelled) return;
      const readIds = new Set((reads ?? []).map((r) => r.notification_id));
      const count = (notifs ?? []).filter((n) => !readIds.has(n.id)).length;
      setUnread(count);
    };

    void compute();
    const timer = setInterval(() => void compute(), 60_000);

    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [user?.id]);

  return (
    <button
      onClick={onOpen}
      className="relative p-1.5 rounded-md transition-colors hover:bg-white/5"
      style={{ color: "#e8e8e8" }}
      title="Notifications"
      aria-label="Notifications"
    >
      <Bell size={16} strokeWidth={1.75} />
      {unread > 0 && (
        <span
          className="absolute -top-0.5 -right-0.5 min-w-[16px] h-[16px] px-1 rounded-full flex items-center justify-center text-[9px] font-bold text-white"
          style={{ backgroundColor: "var(--accent-red)" }}
        >
          {unread > 9 ? "9+" : unread}
        </span>
      )}
    </button>
  );
}

export type { Notification };
