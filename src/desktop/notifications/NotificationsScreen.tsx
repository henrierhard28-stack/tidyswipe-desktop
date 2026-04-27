import { useEffect, useState } from "react";
import { X, Bell, Send, Trash2, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "../auth/AuthProvider";

type Props = {
  onClose: () => void;
};

type Notif = {
  id: string;
  title: string;
  body: string;
  created_at: string;
};

export default function NotificationsScreen({ onClose }: Props) {
  const { user, isAdmin } = useAuth();
  const [notifs, setNotifs] = useState<Notif[]>([]);
  const [readIds, setReadIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);

  // Admin compose form
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);

  const load = async () => {
    if (!user) return;
    const [{ data: list }, { data: reads }] = await Promise.all([
      supabase.from("notifications").select("id,title,body,created_at").order("created_at", { ascending: false }),
      supabase.from("notification_reads").select("notification_id").eq("user_id", user.id),
    ]);
    setNotifs(list ?? []);
    setReadIds(new Set((reads ?? []).map((r) => r.notification_id)));
    setLoading(false);
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  // Mark all as read on open
  useEffect(() => {
    if (!user || notifs.length === 0) return;
    const unread = notifs.filter((n) => !readIds.has(n.id));
    if (unread.length === 0) return;
    void supabase
      .from("notification_reads")
      .insert(unread.map((n) => ({ notification_id: n.id, user_id: user.id })))
      .then(() => {
        setReadIds((prev) => {
          const next = new Set(prev);
          unread.forEach((n) => next.add(n.id));
          return next;
        });
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [notifs.length]);

  const send = async () => {
    if (!user || !title.trim() || !body.trim()) return;
    if (!isAdmin) {
      setFeedback("Erreur : ce compte n'a pas les droits admin.");
      return;
    }
    setSending(true);
    setFeedback(null);
    const { error } = await supabase.from("notifications").insert({
      title: title.trim(),
      body: body.trim(),
      created_by: user.id,
    });
    if (error) {
      setFeedback(`Erreur : ${error.message}`);
    } else {
      setTitle("");
      setBody("");
      setFeedback("Notification envoyée à tous les utilisateurs.");
      void load();
    }
    setSending(false);
  };

  const remove = async (id: string) => {
    await supabase.from("notifications").delete().eq("id", id);
    void load();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-6"
      style={{ backgroundColor: "rgba(0,0,0,0.7)", backdropFilter: "blur(8px)" }}
      onClick={onClose}
    >
      <div
        className="w-full max-w-[560px] max-h-[86vh] rounded-[14px] overflow-hidden flex flex-col"
        style={{
          backgroundColor: "var(--bg-app)",
          border: "1px solid var(--border-subtle)",
          boxShadow: "0 30px 80px -20px rgba(0,0,0,0.7)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          className="relative flex items-center justify-center px-5 h-[44px] shrink-0"
          style={{ borderBottom: "1px solid var(--border-subtle)" }}
        >
          <span className="text-[13px] font-semibold flex items-center gap-1.5" style={{ color: "#ededed" }}>
            <Bell size={13} /> Notifications
          </span>
          <button onClick={onClose} className="absolute right-3 p-1.5 rounded-md hover:bg-white/5" style={{ color: "#9a9a9a" }}>
            <X size={16} />
          </button>
        </div>

        <div className="overflow-y-auto px-6 py-5 flex-1">
          {isAdmin && (
            <div
              className="rounded-[10px] p-4 mb-5"
              style={{ backgroundColor: "var(--bg-card)", border: "1px solid #1c1d20" }}
            >
              <div className="text-[11px] font-semibold uppercase tracking-[0.08em] mb-3" style={{ color: "var(--accent-blue)" }}>
                Envoyer une notification (admin)
              </div>
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Titre"
                className="w-full mb-2 px-3 py-2 rounded-md text-[13px] outline-none"
                style={{ backgroundColor: "#0c0d0f", border: "1px solid #1c1d20", color: "#ededed" }}
              />
              <textarea
                value={body}
                onChange={(e) => setBody(e.target.value)}
                placeholder="Message à envoyer à tous les utilisateurs"
                rows={3}
                className="w-full mb-3 px-3 py-2 rounded-md text-[13px] outline-none resize-none"
                style={{ backgroundColor: "#0c0d0f", border: "1px solid #1c1d20", color: "#ededed" }}
              />
              <button
                onClick={send}
                disabled={sending || !title.trim() || !body.trim()}
                className="w-full h-9 rounded-md text-[12px] font-semibold flex items-center justify-center gap-1.5 hover:opacity-90 transition-opacity disabled:opacity-40"
                style={{ backgroundColor: "var(--accent-blue)", color: "white" }}
              >
                {sending ? <Loader2 size={12} className="animate-spin" /> : <Send size={12} />}
                Envoyer à tous
              </button>
              {feedback && (
                <div className="mt-2 text-[11px]" style={{ color: feedback.startsWith("Erreur") ? "#ff8a82" : "var(--accent-blue)" }}>
                  {feedback}
                </div>
              )}
            </div>
          )}
          {!isAdmin && (
            <div className="rounded-[10px] p-4 mb-5 text-[12px]" style={{ backgroundColor: "var(--bg-card)", border: "1px solid #1c1d20", color: "#9a9a9a" }}>
              Connectez-vous avec un compte administrateur pour envoyer une notification.
            </div>
          )}

          <div className="text-[11px] font-semibold uppercase tracking-[0.08em] mb-3" style={{ color: "#9a9a9a" }}>
            Reçues
          </div>
          {loading ? (
            <div className="text-[12px] flex items-center gap-2" style={{ color: "#6b6e74" }}>
              <Loader2 size={12} className="animate-spin" /> Chargement…
            </div>
          ) : notifs.length === 0 ? (
            <div className="text-[12px] py-6 text-center" style={{ color: "#6b6e74" }}>
              Aucune notification pour le moment.
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              {notifs.map((n) => {
                const isRead = readIds.has(n.id);
                return (
                  <div
                    key={n.id}
                    className="rounded-[10px] p-4"
                    style={{
                      backgroundColor: "var(--bg-card)",
                      border: `1px solid ${isRead ? "#1c1d20" : "rgba(10,132,255,0.4)"}`,
                    }}
                  >
                    <div className="flex items-start justify-between gap-2 mb-1">
                      <div className="text-[13px] font-semibold" style={{ color: "#ededed" }}>
                        {n.title}
                      </div>
                      {isAdmin && (
                        <button
                          onClick={() => void remove(n.id)}
                          className="p-1 rounded hover:bg-white/5 shrink-0"
                          style={{ color: "#6b6e74" }}
                          aria-label="Supprimer"
                          title="Supprimer"
                        >
                          <Trash2 size={12} />
                        </button>
                      )}
                    </div>
                    <div className="text-[12px] whitespace-pre-wrap" style={{ color: "#c4c5c8" }}>
                      {n.body}
                    </div>
                    <div className="text-[10px] mt-2" style={{ color: "#6b6e74" }}>
                      {new Date(n.created_at).toLocaleString("fr-FR")}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
