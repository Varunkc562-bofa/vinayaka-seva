import React, { useState } from "react";
import { View, Text, ScrollView, Pressable, StyleSheet, ActivityIndicator, Modal, RefreshControl } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/src/api";
import { useAuth } from "@/src/auth";
import { colors, fonts, radius, spacing } from "@/src/theme";
import { ScreenHeader, ChipRow, Empty, BottomSheet, Field, Button } from "@/src/ui";

const ROLES = [
  "President","Vice President","Secretary","Joint Secretary","Treasurer",
  "Pooja Coordinator","Volunteer Coordinator","Food Coordinator","Decoration Coordinator",
  "Cultural Coordinator","Security Coordinator","Media Coordinator",
  "General Committee Member","Volunteer","Regular Member",
];

export default function Community() {
  const insets = useSafeAreaInsets();
  const qc = useQueryClient();
  const { user } = useAuth();
  const [tab, setTab] = useState<"events" | "members">("events");
  const [showNew, setShowNew] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [title, setTitle] = useState(""); const [loc, setLoc] = useState("");
  const [starts, setStarts] = useState(""); const [cat, setCat] = useState("cultural");
  const [confirmDel, setConfirmDel] = useState(false);
  const [rolePickFor, setRolePickFor] = useState<any>(null);

  const events = useQuery({ queryKey: ["events"], queryFn: api.events });
  const members = useQuery({ queryKey: ["members"], queryFn: api.members });

  const resetForm = () => { setShowNew(false); setEditing(null); setTitle(""); setLoc(""); setStarts(""); setCat("cultural"); setConfirmDel(false); };
  const createEv = useMutation({
    mutationFn: (d: any) => api.createEvent(d),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["events"] }); resetForm(); },
  });
  const editEv = useMutation({
    mutationFn: ({ id, d }: any) => api.editEvent(id, d),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["events"] }); resetForm(); },
  });
  const deleteEv = useMutation({
    mutationFn: (id: string) => api.deleteEvent(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["events"] }); qc.invalidateQueries({ queryKey: ["rsvpSummary"] }); resetForm(); },
  });
  const updateRole = useMutation({
    mutationFn: ({ id, role }: any) => api.updateRole(id, role),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["members"] }); setRolePickFor(null); },
  });

  const canManageRoles = ["President", "Vice President", "Secretary"].includes(user?.role || "");
  const canEditEvent = (e: any) => ["President","Vice President","Secretary"].includes(user?.role || "") || e?.created_by === user?.name;

  const openNew = () => { resetForm(); setShowNew(true); };
  const openEdit = (e: any) => {
    if (!canEditEvent(e)) return;
    setEditing(e); setTitle(e.title || ""); setLoc(e.location || "");
    const d = new Date(e.starts_at);
    if (!isNaN(d.getTime())) {
      const pad = (n: number) => String(n).padStart(2, "0");
      setStarts(`${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`);
    } else setStarts("");
    setCat(e.category || "cultural"); setConfirmDel(false); setShowNew(true);
  };

  const save = () => {
    const payload = { title, location: loc, category: cat, starts_at: parseDate(starts) };
    if (editing) editEv.mutate({ id: editing.event_id, d: payload });
    else createEv.mutate(payload);
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.surface }} testID="community-screen">
      <ScreenHeader
        title="Community"
        subtitle="Events, members & seva teams"
        right={tab === "events" ? (
          <Pressable onPress={openNew} style={styles.addBtn} testID="new-event-button">
            <Text style={styles.addTxt}>+</Text>
          </Pressable>
        ) : null}
      />

      <View style={{ paddingVertical: spacing.md, backgroundColor: colors.surface, borderBottomWidth: 1, borderBottomColor: colors.border }}>
        <ChipRow items={[{ label: "Events", value: "events" }, { label: "Members", value: "members" }]} value={tab} onChange={(v) => setTab(v as any)} />
      </View>

      <ScrollView
        contentContainerStyle={{ padding: spacing.xl, paddingBottom: insets.bottom + spacing["3xl"] }}
        refreshControl={<RefreshControl refreshing={events.isRefetching || members.isRefetching} onRefresh={() => { events.refetch(); members.refetch(); }} tintColor={colors.brandPrimary} />}
      >
        {tab === "events" ? (
          events.isLoading ? <ActivityIndicator color={colors.brandPrimary} /> :
          events.data?.length === 0 ? <Empty title="No events yet" body="Add pooja, cultural, or annadanam events." testID="events-empty" /> :
          events.data.map((e: any) => (
            <Pressable key={e.event_id} onPress={() => openEdit(e)} style={styles.card} testID={`event-row-${e.event_id}`}>
              <View style={styles.tagRow}>
                <View style={styles.catPill}><Text style={styles.catText}>{e.category}</Text></View>
                <Text style={styles.date}>{fmtDate(e.starts_at)}</Text>
              </View>
              <Text style={styles.eTitle}>{e.title}</Text>
              {e.description ? <Text style={styles.eBody}>{e.description}</Text> : null}
              {e.location ? <Text style={styles.eMeta}>📍 {e.location}{canEditEvent(e) ? " · Tap to edit" : ""}</Text> : (canEditEvent(e) ? <Text style={styles.eMeta}>Tap to edit</Text> : null)}
            </Pressable>
          ))
        ) : (
          members.isLoading ? <ActivityIndicator color={colors.brandPrimary} /> :
          members.data?.length === 0 ? <Empty title="No members yet" testID="members-empty" /> :
          members.data.map((m: any) => (
            <Pressable key={m.user_id} onPress={() => canManageRoles && setRolePickFor(m)} style={styles.memberRow} testID={`member-${m.user_id}`}>
              <View style={styles.avatar}><Text style={styles.avatarText}>{(m.name || "?").slice(0, 1).toUpperCase()}</Text></View>
              <View style={{ flex: 1 }}>
                <Text style={styles.mName}>{m.name}</Text>
                <Text style={styles.mRole}>{m.role}</Text>
              </View>
              {canManageRoles ? <Text style={{ color: colors.brandPrimary, fontSize: 12, fontWeight: "700" }}>EDIT</Text> : null}
            </Pressable>
          ))
        )}
      </ScrollView>

      <BottomSheet visible={showNew} onClose={() => { setShowNew(false); setEditing(null); setConfirmDel(false); }} title={editing ? "Edit event" : "New event"} testID="new-event-sheet">
        <Field label="Title" value={title} onChangeText={setTitle} placeholder="Ganesh Aarti" />
        <Field label="Location" value={loc} onChangeText={setLoc} placeholder="Community pandal" />
        <Field label="Starts at (YYYY-MM-DD HH:MM)" value={starts} onChangeText={setStarts} placeholder="2026-08-27 18:00" />
        <Text style={{ fontSize: 12, color: colors.muted, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 6, fontWeight: "600" }}>Category</Text>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.sm, marginBottom: spacing.lg }}>
          {["pooja", "cultural", "annadanam", "general"].map(c => (
            <Pressable key={c} onPress={() => setCat(c)} testID={`cat-${c}`}
              style={{ paddingHorizontal: spacing.md, paddingVertical: 10, borderRadius: radius.pill, backgroundColor: cat === c ? colors.brandPrimary : colors.surfaceSecondary, borderWidth: 1, borderColor: cat === c ? colors.brandPrimary : colors.border }}>
              <Text style={{ color: cat === c ? colors.onBrand : colors.onSurfaceTertiary, fontWeight: "600" }}>{c}</Text>
            </Pressable>
          ))}
        </View>
        <Button label={(createEv.isPending || editEv.isPending) ? "Saving…" : (editing ? "Save changes" : "Save event")} disabled={createEv.isPending || editEv.isPending || !title.trim()}
          onPress={save} testID="save-event-button" />
        {editing ? (
          <Pressable onPress={() => confirmDel ? deleteEv.mutate(editing.event_id) : setConfirmDel(true)}
            style={[styles.delBtn, confirmDel && styles.delBtnConfirm]} testID="delete-event-button">
            <Text style={[styles.delTxt, confirmDel && { color: colors.onError }]}>
              {deleteEv.isPending ? "Deleting…" : confirmDel ? "Tap again to confirm delete" : "🗑  Delete this event"}
            </Text>
          </Pressable>
        ) : null}
      </BottomSheet>

      <Modal visible={!!rolePickFor} transparent animationType="fade" onRequestClose={() => setRolePickFor(null)}>
        <Pressable style={styles.backdrop} onPress={() => setRolePickFor(null)}>
          <Pressable style={styles.roleSheet} onPress={() => {}}>
            <Text style={styles.roleTitle}>Assign role</Text>
            <Text style={styles.roleSub}>{rolePickFor?.name}</Text>
            <ScrollView style={{ maxHeight: 400, marginTop: spacing.md }}>
              {ROLES.map(r => (
                <Pressable key={r} onPress={() => updateRole.mutate({ id: rolePickFor.user_id, role: r })}
                  style={[styles.roleItem, rolePickFor?.role === r && { backgroundColor: colors.brandTertiary }]} testID={`role-opt-${r}`}>
                  <Text style={{ color: rolePickFor?.role === r ? colors.brandPrimary : colors.onSurface, fontWeight: rolePickFor?.role === r ? "700" : "500" }}>{r}</Text>
                </Pressable>
              ))}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

function fmtDate(iso: string) {
  try { const d = new Date(iso); return d.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" }) + " · " + d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" }); } catch { return iso; }
}
function parseDate(s: string) {
  const [d, t = "10:00"] = s.split(" ");
  return new Date(`${d}T${t.length === 5 ? t + ":00" : t}Z`).toISOString();
}

const styles = StyleSheet.create({
  addBtn: { width: 42, height: 42, borderRadius: 21, backgroundColor: colors.brandPrimary, alignItems: "center", justifyContent: "center" },
  addTxt: { color: colors.onBrand, fontSize: 26, lineHeight: 28, fontWeight: "300" },
  card: { backgroundColor: colors.surfaceSecondary, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: spacing.lg, marginBottom: spacing.md },
  tagRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: spacing.sm },
  catPill: { paddingHorizontal: 12, paddingVertical: 4, backgroundColor: colors.brandTertiary, borderRadius: radius.pill },
  catText: { color: colors.brandPrimary, fontSize: 11, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.5 },
  date: { color: colors.muted, fontSize: 12 },
  eTitle: { fontFamily: fonts.display, fontSize: 20, fontWeight: "600", color: colors.onSurface },
  eBody: { color: colors.onSurfaceTertiary, fontSize: 14, marginTop: 4, lineHeight: 20 },
  eMeta: { color: colors.muted, fontSize: 12, marginTop: 8 },
  memberRow: { flexDirection: "row", alignItems: "center", backgroundColor: colors.surfaceSecondary, padding: spacing.md, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, marginBottom: spacing.sm },
  avatar: { width: 46, height: 46, borderRadius: 23, backgroundColor: colors.brandTertiary, alignItems: "center", justifyContent: "center", marginRight: spacing.md, borderWidth: 1, borderColor: "rgba(230,81,0,0.2)" },
  avatarText: { color: colors.brandPrimary, fontFamily: fonts.display, fontSize: 20, fontWeight: "700" },
  mName: { fontSize: 16, fontWeight: "600", color: colors.onSurface },
  mRole: { fontSize: 12, color: colors.muted, marginTop: 2 },
  backdrop: { flex: 1, backgroundColor: "rgba(43,34,30,0.5)", justifyContent: "center", padding: spacing.xl },
  roleSheet: { backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.xl, maxHeight: "80%" },
  roleTitle: { fontFamily: fonts.display, fontSize: 22, fontWeight: "600", color: colors.onSurface },
  roleSub: { color: colors.muted, marginTop: 2 },
  roleItem: { paddingVertical: 14, paddingHorizontal: spacing.md, borderRadius: radius.md, marginBottom: 4 },
  delBtn: { marginTop: spacing.md, paddingVertical: 14, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.error, alignItems: "center" },
  delBtnConfirm: { backgroundColor: colors.error, borderColor: colors.error },
  delTxt: { color: colors.error, fontWeight: "700", fontSize: 14 },
});
