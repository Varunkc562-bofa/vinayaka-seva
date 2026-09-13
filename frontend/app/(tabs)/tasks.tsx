import React, { useState } from "react";
import { View, Text, ScrollView, Pressable, StyleSheet, ActivityIndicator, RefreshControl } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import * as Haptics from "expo-haptics";
import { api } from "@/src/api";
import { useAuth } from "@/src/auth";
import { colors, fonts, radius, spacing } from "@/src/theme";
import { ScreenHeader, ChipRow, BottomSheet, Field, Button, Empty, priorityColor } from "@/src/ui";

const STATUS = [
  { label: "All", value: "all" }, { label: "To do", value: "todo" },
  { label: "Doing", value: "doing" }, { label: "Done", value: "done" },
];
const PRIORITY = [
  { label: "Low", value: "low" }, { label: "Medium", value: "medium" },
  { label: "High", value: "high" }, { label: "Critical", value: "critical" },
];
const OFFICERS = ["President", "Vice President", "Secretary"];

export default function Tasks() {
  const insets = useSafeAreaInsets();
  const qc = useQueryClient();
  const { user } = useAuth();
  const [filter, setFilter] = useState("all");
  const [scope, setScope] = useState<"mine" | "all">("all");
  const [show, setShow] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [title, setTitle] = useState("");
  const [desc, setDesc] = useState("");
  const [priority, setPriority] = useState("medium");
  const [confirmDel, setConfirmDel] = useState(false);

  const { data: tasks = [], isLoading, refetch, isRefetching } = useQuery({
    queryKey: ["tasks", scope],
    queryFn: () => api.tasks(scope === "mine"),
  });

  const reset = () => {
    qc.invalidateQueries({ queryKey: ["tasks"] });
    qc.invalidateQueries({ queryKey: ["dashboard"] });
    setShow(false); setEditing(null); setTitle(""); setDesc(""); setPriority("medium"); setConfirmDel(false);
  };

  const createM = useMutation({
    mutationFn: (d: any) => api.createTask(d),
    onSuccess: reset,
  });

  const editM = useMutation({
    mutationFn: ({ id, data }: any) => api.updateTask(id, data),
    onSuccess: reset,
  });

  const updateM = useMutation({
    mutationFn: ({ id, data }: any) => api.updateTask(id, data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["tasks"] }); qc.invalidateQueries({ queryKey: ["dashboard"] }); },
  });

  const deleteM = useMutation({
    mutationFn: (id: string) => api.deleteTask(id),
    onSuccess: reset,
  });

  const filtered = filter === "all" ? tasks : tasks.filter((t: any) => t.status === filter);

  const canManage = (t: any) =>
    OFFICERS.includes(user?.role || "") ||
    t?.created_by === user?.user_id || t?.created_by_name === user?.name ||
    t?.assignee_id === user?.user_id;

  const canDelete = (t: any) =>
    OFFICERS.includes(user?.role || "") ||
    t?.created_by === user?.user_id || t?.created_by_name === user?.name;

  const openNew = () => {
    setEditing(null); setTitle(""); setDesc(""); setPriority("medium"); setConfirmDel(false); setShow(true);
  };

  const openEdit = (t: any) => {
    if (!canManage(t)) return;
    Haptics.selectionAsync();
    setEditing(t);
    setTitle(t.title || "");
    setDesc(t.description || "");
    setPriority(t.priority || "medium");
    setConfirmDel(false);
    setShow(true);
  };

  const toggleDone = (t: any) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    updateM.mutate({ id: t.task_id, data: { status: t.status === "done" ? "todo" : "done" } });
  };

  const cycleStatus = (t: any) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const next = t.status === "todo" ? "doing" : t.status === "doing" ? "done" : "todo";
    updateM.mutate({ id: t.task_id, data: { status: next } });
  };

  const save = () => {
    const payload: any = { title, description: desc, priority };
    if (editing) editM.mutate({ id: editing.task_id, data: payload });
    else createM.mutate({ ...payload, status: "todo" });
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.surface }} testID="tasks-screen">
      <ScreenHeader
        title="My Work"
        subtitle="Seva assigned to the committee"
        right={
          <View style={{ flexDirection: "row", gap: 6 }}>
            <Pressable onPress={() => setScope(scope === "mine" ? "all" : "mine")} style={styles.scopeBtn} testID="scope-toggle">
              <Text style={styles.scopeText}>{scope === "mine" ? "Mine" : "All"}</Text>
            </Pressable>
            <Pressable onPress={openNew} style={styles.addBtn} testID="new-task-button">
              <Text style={styles.addTxt}>+</Text>
            </Pressable>
          </View>
        }
      />
      <View style={{ paddingVertical: spacing.md, backgroundColor: colors.surface, borderBottomWidth: 1, borderBottomColor: colors.border }}>
        <ChipRow items={STATUS} value={filter} onChange={setFilter} />
      </View>

      <ScrollView
        contentContainerStyle={{ padding: spacing.xl, paddingBottom: insets.bottom + spacing["3xl"] }}
        refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={colors.brandPrimary} />}
      >
        {isLoading ? <ActivityIndicator color={colors.brandPrimary} /> :
         filtered.length === 0 ? <Empty title="All tasks complete" body="Great seva! Add a new task with the + button." testID="tasks-empty" /> :
         filtered.map((t: any) => (
          <View key={t.task_id} style={styles.card}>
            <View style={{ flexDirection: "row", alignItems: "flex-start" }}>
              <Pressable onPress={() => toggleDone(t)} style={[styles.check, t.status === "done" && styles.checkOn]} testID={`task-check-${t.task_id}`}>
                {t.status === "done" ? <Text style={{ color: colors.onBrand, fontWeight: "800" }}>✓</Text> : null}
              </Pressable>
              <Pressable style={{ flex: 1 }} onPress={() => openEdit(t)} onLongPress={() => openEdit(t)} testID={`task-row-${t.task_id}`}>
                <Text style={[styles.title, t.status === "done" && styles.done]}>{t.title}</Text>
                {t.description ? <Text style={styles.desc}>{t.description}</Text> : null}
                <View style={styles.metaRow}>
                  <View style={[styles.badge, { backgroundColor: priorityColor(t.priority) + "22" }]}>
                    <Text style={[styles.badgeText, { color: priorityColor(t.priority) }]}>{t.priority}</Text>
                  </View>
                  <Pressable onPress={() => cycleStatus(t)} style={[styles.badge, { backgroundColor: colors.surfaceTertiary }]} testID={`task-status-${t.task_id}`}>
                    <Text style={[styles.badgeText, { color: colors.onSurfaceTertiary }]}>{t.status}</Text>
                  </Pressable>
                  {t.assignee_name ? <Text style={styles.assignee}>· {t.assignee_name}</Text> : null}
                  {canManage(t) ? <Text style={styles.editHint}>· tap to edit</Text> : null}
                </View>
              </Pressable>
            </View>
          </View>
        ))}
      </ScrollView>

      <BottomSheet visible={show} onClose={() => setShow(false)} title={editing ? "Edit task" : "Add a new task"} testID="task-sheet">
        <Field label="Title" value={title} onChangeText={setTitle} placeholder="e.g. Book pandal decorator" />
        <Field label="Description" value={desc} onChangeText={setDesc} multiline numberOfLines={3} placeholder="Details" />
        <Text style={{ fontSize: 12, color: colors.muted, letterSpacing: 0.5, textTransform: "uppercase", marginBottom: 6, fontWeight: "600" }}>Priority</Text>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.sm, marginBottom: spacing.lg }}>
          {PRIORITY.map(p => (
            <Pressable key={p.value} onPress={() => setPriority(p.value)} testID={`pri-${p.value}`}
              style={{ paddingHorizontal: spacing.md, paddingVertical: 10, borderRadius: radius.pill, borderWidth: 1, backgroundColor: priority === p.value ? priorityColor(p.value) : colors.surfaceSecondary, borderColor: priority === p.value ? priorityColor(p.value) : colors.border }}>
              <Text style={{ color: priority === p.value ? colors.onBrand : colors.onSurfaceTertiary, fontWeight: "600", fontSize: 13 }}>{p.label}</Text>
            </Pressable>
          ))}
        </View>
        <Button
          label={(createM.isPending || editM.isPending) ? "Saving…" : (editing ? "Save changes" : "Create task")}
          onPress={save}
          disabled={createM.isPending || editM.isPending || !title.trim()}
          testID="save-task-button"
        />
        {editing && canDelete(editing) ? (
          <Pressable
            onPress={() => confirmDel ? deleteM.mutate(editing.task_id) : setConfirmDel(true)}
            style={[styles.delBtn, confirmDel && styles.delBtnConfirm]}
            testID="delete-task-button"
          >
            <Text style={[styles.delTxt, confirmDel && { color: colors.onError }]}>
              {deleteM.isPending ? "Deleting…" : confirmDel ? "Tap again to confirm delete" : "🗑  Delete this task"}
            </Text>
          </Pressable>
        ) : null}
      </BottomSheet>
    </View>
  );
}

const styles = StyleSheet.create({
  scopeBtn: { paddingHorizontal: 12, height: 42, borderRadius: radius.pill, backgroundColor: colors.surfaceTertiary, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: colors.border },
  scopeText: { color: colors.onSurface, fontWeight: "700", fontSize: 12 },
  addBtn: { width: 42, height: 42, borderRadius: 21, backgroundColor: colors.brandPrimary, alignItems: "center", justifyContent: "center" },
  addTxt: { color: colors.onBrand, fontSize: 26, lineHeight: 28, fontWeight: "300" },
  card: { backgroundColor: colors.surfaceSecondary, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: spacing.lg, marginBottom: spacing.md },
  check: { width: 28, height: 28, borderRadius: 8, borderWidth: 2, borderColor: colors.borderStrong, marginRight: spacing.md, marginTop: 2, alignItems: "center", justifyContent: "center" },
  checkOn: { backgroundColor: colors.success, borderColor: colors.success },
  title: { fontSize: 17, fontFamily: fonts.display, fontWeight: "600", color: colors.onSurface },
  done: { textDecorationLine: "line-through", color: colors.muted },
  desc: { color: colors.onSurfaceTertiary, fontSize: 13, marginTop: 4, lineHeight: 18 },
  metaRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm, marginTop: spacing.md, flexWrap: "wrap" },
  badge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: radius.pill },
  badgeText: { fontSize: 11, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.5 },
  assignee: { color: colors.muted, fontSize: 12 },
  editHint: { color: colors.muted, fontSize: 11, letterSpacing: 0.5, textTransform: "uppercase", fontWeight: "600" },
  delBtn: { marginTop: spacing.md, paddingVertical: 14, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.error, alignItems: "center" },
  delBtnConfirm: { backgroundColor: colors.error, borderColor: colors.error },
  delTxt: { color: colors.error, fontWeight: "700", fontSize: 14 },
});
