import React, { useState, useMemo, useCallback } from "react";
import { View, Text, ScrollView, Pressable, StyleSheet, ActivityIndicator, RefreshControl } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter, useFocusEffect } from "expo-router";
import { api } from "@/src/api";
import { pickAndUploadImage } from "@/src/uploader";
import { AuthImage } from "@/src/auth-image";
import { useAuth } from "@/src/auth";
import { intents } from "@/src/intents";
import { colors, fonts, radius, spacing } from "@/src/theme";
import { ScreenHeader, BottomSheet, Field, Button, Empty, fmtINR } from "@/src/ui";

const CATS = ["decoration", "pooja", "food", "cultural", "security", "misc"];

export default function Expenses() {
  const insets = useSafeAreaInsets();
  const qc = useQueryClient();
  const router = useRouter();
  const { user } = useAuth();
  const [show, setShow] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [amt, setAmt] = useState(""); const [cat, setCat] = useState("decoration");
  const [vendor, setVendor] = useState(""); const [desc, setDesc] = useState("");
  const [billPath, setBillPath] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

  const { data = [], isLoading, refetch, isRefetching } = useQuery({ queryKey: ["expenses"], queryFn: api.expenses });
  const total = useMemo(() => data.reduce((s: number, e: any) => s + (e.amount || 0), 0), [data]);
  const canApprove = ["President", "Treasurer", "Vice President"].includes(user?.role || "");

  const resetForm = () => { setEditing(null); setAmt(""); setVendor(""); setDesc(""); setBillPath(null); setCat("decoration"); setConfirmDel(false); };
  const openNew = () => { resetForm(); setShow(true); };
  const openEdit = (e: any) => {
    setEditing(e); setAmt(String(e.amount || "")); setCat(e.category || "decoration");
    setVendor(e.vendor || ""); setDesc(e.description || ""); setBillPath(e.bill_url || null);
    setShow(true);
  };

  const createM = useMutation({
    mutationFn: (d: any) => api.createExpense(d),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["expenses"] }); qc.invalidateQueries({ queryKey: ["dashboard"] }); setShow(false); resetForm(); },
  });
  const editM = useMutation({
    mutationFn: ({ id, d }: any) => api.editExpense(id, d),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["expenses"] }); qc.invalidateQueries({ queryKey: ["dashboard"] }); setShow(false); resetForm(); },
  });
  const deleteM = useMutation({
    mutationFn: (id: string) => api.deleteExpense(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["expenses"] }); qc.invalidateQueries({ queryKey: ["dashboard"] }); setShow(false); resetForm(); setConfirmDel(false); },
  });
  const [confirmDel, setConfirmDel] = useState(false);
  const approveM = useMutation({
    mutationFn: (id: string) => api.approveExpense(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["expenses"] }),
  });

  const attachBill = async () => {
    setUploading(true);
    try { const r = await pickAndUploadImage("expenses"); if (r) setBillPath(r.storage_path); }
    finally { setUploading(false); }
  };

  // Auto-open the sheet when arrived via a Quick Action intent
  useFocusEffect(
    useCallback(() => {
      if (intents.consume("new-expense")) {
        openNew();
      }
    }, [])
  );

  const save = () => {
    const payload: any = { amount: parseFloat(amt) || 0, category: cat, vendor, description: desc, bill_url: billPath };
    if (editing) editM.mutate({ id: editing.expense_id, d: payload });
    else createM.mutate(payload);
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.surface }} testID="expenses-screen">
      <ScreenHeader title="Expenses" subtitle="Track every rupee spent" back onBack={() => router.back()}
        right={<Pressable onPress={openNew} style={styles.addBtn} testID="new-expense-button"><Text style={styles.addTxt}>+</Text></Pressable>} />
      <ScrollView contentContainerStyle={{ padding: spacing.xl, paddingBottom: insets.bottom + spacing["3xl"] }}
        refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={colors.brandPrimary} />}>
        <View style={styles.hero}>
          <Text style={styles.heroLbl}>TOTAL SPENT</Text>
          <Text style={styles.heroVal}>{fmtINR(total)}</Text>
          <Text style={styles.heroMeta}>{data.length} entries</Text>
        </View>
        {isLoading ? <ActivityIndicator color={colors.brandPrimary} /> :
         data.length === 0 ? <Empty title="No expenses yet" body="Tap + to add your first expense." testID="expenses-empty" /> :
         data.map((e: any) => (
          <Pressable key={e.expense_id} onPress={() => openEdit(e)} style={styles.card} testID={`expense-row-${e.expense_id}`}>
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" }}>
              <View style={{ flex: 1 }}>
                <View style={styles.catPill}><Text style={styles.catText}>{e.category}</Text></View>
                <Text style={styles.vendor}>{e.vendor || "—"}</Text>
                {e.description ? <Text style={styles.desc}>{e.description}</Text> : null}
                <Text style={styles.meta}>By {e.created_by} · {e.approved ? "Approved" : "Pending"} · Tap to edit</Text>
              </View>
              <Text style={styles.amt}>{fmtINR(e.amount)}</Text>
            </View>
            {e.bill_url ? (
              <AuthImage storagePath={e.bill_url} style={{ width: "100%", height: 160, borderRadius: radius.md, marginTop: spacing.sm }} contentFit="cover" />
            ) : null}
            {!e.approved && canApprove ? (
              <Pressable onPress={(ev) => { ev.stopPropagation?.(); approveM.mutate(e.expense_id); }} style={styles.approveBtn} testID={`approve-${e.expense_id}`}>
                <Text style={styles.approveTxt}>Approve</Text>
              </Pressable>
            ) : null}
          </Pressable>
        ))}
      </ScrollView>
      <BottomSheet visible={show} onClose={() => setShow(false)} title={editing ? "Edit expense" : "Add expense"} testID="expense-sheet">
        <Field label="Amount (₹)" value={amt} onChangeText={setAmt} keyboardType="numeric" placeholder="1500" />
        <Text style={{ fontSize: 12, color: colors.muted, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 6, fontWeight: "600" }}>Category</Text>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.sm, marginBottom: spacing.lg }}>
          {CATS.map(c => (
            <Pressable key={c} onPress={() => setCat(c)} testID={`ecat-${c}`}
              style={{ paddingHorizontal: spacing.md, paddingVertical: 10, borderRadius: radius.pill, backgroundColor: cat === c ? colors.brandPrimary : colors.surfaceSecondary, borderWidth: 1, borderColor: cat === c ? colors.brandPrimary : colors.border }}>
              <Text style={{ color: cat === c ? colors.onBrand : colors.onSurfaceTertiary, fontWeight: "600", textTransform: "capitalize" }}>{c}</Text>
            </Pressable>
          ))}
        </View>
        <Field label="Vendor" value={vendor} onChangeText={setVendor} placeholder="Marigold Mart" />
        <Field label="Description" value={desc} onChangeText={setDesc} placeholder="Flowers for main pandal" />
        <Pressable onPress={attachBill} style={styles.attach} testID="attach-bill-button" disabled={uploading}>
          {uploading ? <ActivityIndicator color={colors.brandPrimary} /> :
            <Text style={{ color: colors.brandPrimary, fontWeight: "700" }}>
              {billPath ? "✓ Bill photo attached · tap to change" : "🧾 Attach bill photo (optional)"}
            </Text>}
        </Pressable>
        <Button label={(createM.isPending || editM.isPending) ? "Saving…" : (editing ? "Save changes" : "Save expense")} disabled={createM.isPending || editM.isPending || !amt}
          onPress={save} testID="save-expense-button" />
        {editing ? (
          <Pressable
            onPress={() => {
              if (!confirmDel) setConfirmDel(true);
              else deleteM.mutate(editing.expense_id);
            }}
            style={[styles.deleteBtn, confirmDel && styles.deleteBtnConfirm]}
            testID="delete-expense-button"
          >
            <Text style={[styles.deleteBtnText, confirmDel && { color: colors.onError }]}>
              {deleteM.isPending ? "Deleting…" : confirmDel ? "Tap again to confirm delete" : "🗑  Delete this expense"}
            </Text>
          </Pressable>
        ) : null}
      </BottomSheet>
    </View>
  );
}

const styles = StyleSheet.create({
  addBtn: { width: 42, height: 42, borderRadius: 21, backgroundColor: colors.brandPrimary, alignItems: "center", justifyContent: "center" },
  addTxt: { color: colors.onBrand, fontSize: 26, lineHeight: 28, fontWeight: "300" },
  hero: { backgroundColor: colors.error, borderRadius: radius.lg, padding: spacing.xl, marginBottom: spacing.xl },
  heroLbl: { color: "rgba(255,255,255,0.7)", fontSize: 11, letterSpacing: 1, fontWeight: "700" },
  heroVal: { color: colors.onError, fontFamily: fonts.display, fontSize: 42, fontWeight: "700", marginTop: 6 },
  heroMeta: { color: "rgba(255,255,255,0.85)", fontSize: 13, marginTop: 6 },
  card: { backgroundColor: colors.surfaceSecondary, padding: spacing.lg, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, marginBottom: spacing.sm },
  catPill: { alignSelf: "flex-start", paddingHorizontal: 10, paddingVertical: 3, backgroundColor: colors.brandTertiary, borderRadius: radius.pill, marginBottom: 4 },
  catText: { color: colors.brandPrimary, fontSize: 10, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.5 },
  vendor: { fontFamily: fonts.display, fontSize: 17, fontWeight: "600", color: colors.onSurface },
  desc: { color: colors.onSurfaceTertiary, fontSize: 13, marginTop: 2 },
  meta: { color: colors.muted, fontSize: 11, marginTop: 4 },
  amt: { color: colors.error, fontFamily: fonts.display, fontSize: 20, fontWeight: "700" },
  approveBtn: { marginTop: spacing.md, alignSelf: "flex-start", paddingHorizontal: spacing.lg, paddingVertical: 8, borderRadius: radius.pill, backgroundColor: colors.success },
  approveTxt: { color: colors.onSuccess, fontWeight: "700", fontSize: 12, textTransform: "uppercase", letterSpacing: 0.5 },
  attach: { paddingVertical: 12, paddingHorizontal: spacing.lg, borderRadius: radius.md, borderWidth: 1, borderColor: colors.brandPrimary, borderStyle: "dashed", alignItems: "center", marginBottom: spacing.md },
  deleteBtn: { marginTop: spacing.md, paddingVertical: 14, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.error, alignItems: "center" },
  deleteBtnConfirm: { backgroundColor: colors.error, borderColor: colors.error },
  deleteBtnText: { color: colors.error, fontWeight: "700", fontSize: 14 },
});
