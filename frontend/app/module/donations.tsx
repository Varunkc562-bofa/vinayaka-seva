import React, { useState, useMemo, useCallback } from "react";
import { View, Text, ScrollView, Pressable, StyleSheet, ActivityIndicator, RefreshControl, Linking, Platform } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter, useFocusEffect } from "expo-router";
import { api } from "@/src/api";
import { useAuth } from "@/src/auth";
import { intents } from "@/src/intents";
import { colors, fonts, radius, spacing } from "@/src/theme";
import { ScreenHeader, BottomSheet, Field, Button, Empty, fmtINR } from "@/src/ui";

const MODES = ["cash", "upi", "bank"];

export default function Donations() {
  const insets = useSafeAreaInsets();
  const qc = useQueryClient();
  const router = useRouter();
  const { user } = useAuth();
  const [show, setShow] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [donor, setDonor] = useState(""); const [amount, setAmount] = useState("");
  const [isPartial, setIsPartial] = useState(false);
  const [paid, setPaid] = useState("");
  const [mode, setMode] = useState("cash");
  const [note, setNote] = useState(""); const [phone, setPhone] = useState("");
  const [sendSms, setSendSms] = useState(true);
  const [confirmDel, setConfirmDel] = useState(false);

  const { data: donations = [], isLoading, refetch, isRefetching } = useQuery({
    queryKey: ["donations"], queryFn: api.donations,
  });

  const totals = useMemo(() => {
    let collected = 0, pledgedT = 0, pending = 0;
    for (const d of donations as any[]) {
      const amt = d.amount || 0;
      const p = (d.paid_amount ?? amt);
      pledgedT += amt;
      collected += p;
      pending += Math.max(0, amt - p);
    }
    return { collected, pledgedT, pending };
  }, [donations]);

  const openNew = () => {
    setEditing(null); setDonor(""); setAmount(""); setPaid(""); setIsPartial(false);
    setMode("cash"); setNote(""); setPhone(""); setSendSms(true); setConfirmDel(false);
    setShow(true);
  };
  const openEdit = (d: any) => {
    setEditing(d);
    setDonor(d.donor_name || "");
    setAmount(String(d.amount || ""));
    const p = d.paid_amount ?? d.amount ?? 0;
    setIsPartial(p < (d.amount || 0));
    setPaid(String(p));
    setMode(d.mode || "cash");
    setNote(d.note || "");
    setPhone(d.phone || "");
    setSendSms(false); setConfirmDel(false);
    setShow(true);
  };

  // Open the sheet automatically when arriving via a Quick Action intent.
  useFocusEffect(
    useCallback(() => {
      if (intents.consume("new-donation")) {
        openNew();
      }
    }, [])
  );

  const createM = useMutation({
    mutationFn: (d: any) => api.createDonation(d),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["donations"] }); qc.invalidateQueries({ queryKey: ["dashboard"] }); qc.invalidateQueries({ queryKey: ["pendingDues"] }); setShow(false); },
  });
  const editM = useMutation({
    mutationFn: ({ id, d }: any) => api.editDonation(id, d),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["donations"] }); qc.invalidateQueries({ queryKey: ["dashboard"] }); qc.invalidateQueries({ queryKey: ["pendingDues"] }); setShow(false); },
  });
  const deleteM = useMutation({
    mutationFn: (id: string) => api.deleteDonation(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["donations"] }); qc.invalidateQueries({ queryKey: ["dashboard"] }); qc.invalidateQueries({ queryKey: ["pendingDues"] }); setShow(false); setConfirmDel(false); },
  });
  const save = () => {
    const amountVal = parseFloat(amount) || 0;
    const paidVal = isPartial ? (parseFloat(paid) || 0) : amountVal;
    const payload: any = {
      donor_name: donor.trim(),
      amount: amountVal,
      paid_amount: Math.max(0, Math.min(paidVal, amountVal)),
      mode, note,
      phone: phone.trim() || null,
    };
    if (editing) editM.mutate({ id: editing.donation_id, d: payload });
    else createM.mutate({ ...payload, send_sms: sendSms });
  };

  const disabled = !donor.trim() || !amount || (createM.isPending || editM.isPending);
  const shortfall = isPartial ? Math.max(0, (parseFloat(amount) || 0) - (parseFloat(paid) || 0)) : 0;
  const shareReceipt = (donation: any) => {
    const paidAmount = donation.paid_amount ?? donation.amount ?? 0;
    const receipt = [
      "VINAYAKA SEVA - DONATION RECEIPT",
      "------------------------------",
      `Donor: ${donation.donor_name || donor}`,
      `Amount received: ${fmtINR(paidAmount)}`,
      `Payment mode: ${(donation.mode || mode).toUpperCase()}`,
      `Collected by: ${donation.collected_by || donation.created_by || user?.name || "Vinayaka Seva"}`,
      `Date: ${donation.created_at ? new Date(donation.created_at).toLocaleString() : "-"}`,
      donation.note || note ? `Note: ${donation.note || note}` : "",
      "",
      "Thank you for supporting the seva. Ganpati Bappa Morya!",
    ].filter(Boolean).join("\n");
    const webUrl = `https://wa.me/?text=${encodeURIComponent(receipt)}`;
    const appUrl = `whatsapp://send?text=${encodeURIComponent(receipt)}`;
    Linking.openURL(Platform.OS === "web" ? webUrl : appUrl).catch(() => Linking.openURL(webUrl));
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.surface }} testID="donations-screen">
      <ScreenHeader title="Donations" subtitle="Every rupee, remembered" back onBack={() => router.back()} right={
        <Pressable onPress={openNew} style={styles.addBtn} testID="new-donation-button"><Text style={styles.addTxt}>+</Text></Pressable>
      } />
      <ScrollView contentContainerStyle={{ padding: spacing.xl, paddingBottom: insets.bottom + spacing["3xl"] }}
        refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={colors.brandPrimary} />}>
        <View style={styles.hero}>
          <Text style={styles.heroLbl}>COLLECTED (PAID)</Text>
          <Text style={styles.heroVal}>{fmtINR(totals.collected)}</Text>
          <Text style={styles.heroMeta}>Pledged: {fmtINR(totals.pledgedT)} · Pending dues: {fmtINR(totals.pending)}</Text>
          {totals.pending > 0 ? (
            <Pressable onPress={() => router.push("/module/pending-dues")} style={styles.pendingLink} testID="open-pending-dues">
              <Text style={styles.pendingLinkText}>View pending dues →</Text>
            </Pressable>
          ) : null}
        </View>

        {isLoading ? <ActivityIndicator color={colors.brandPrimary} /> :
         donations.length === 0 ? <Empty title="No donations logged yet" body="Tap + to record your first contribution." testID="donations-empty" /> :
         donations.map((d: any) => {
          const amt = d.amount || 0;
          const p = d.paid_amount ?? amt;
          const rem = Math.max(0, amt - p);
          const complete = rem < 0.01;
          return (
            <Pressable key={d.donation_id} onPress={() => openEdit(d)} style={styles.row} testID={`donation-row-${d.donation_id}`}>
              <View style={styles.avatar}><Text style={styles.aTxt}>{d.donor_name?.slice(0, 1).toUpperCase()}</Text></View>
              <View style={{ flex: 1 }}>
                <View style={styles.rowTop}>
                  <Text style={styles.donor} numberOfLines={1}>{d.donor_name}</Text>
                  {!complete ? <View style={styles.dueTag}><Text style={styles.dueTxt}>DUE {fmtINR(rem)}</Text></View> : null}
                </View>
                <Text style={styles.meta}>{d.mode?.toUpperCase()} · Paid {fmtINR(p)} of {fmtINR(amt)}{d.note ? " · " + d.note : ""}</Text>
                {d.collected_by || d.created_by ? (
                  <Text style={styles.collector}>Collected by {d.collected_by || d.created_by}</Text>
                ) : null}
                <Pressable onPress={() => shareReceipt(d)} style={styles.receiptBtn} testID={`share-receipt-${d.donation_id}`}>
                  <Text style={styles.receiptBtnText}>Share receipt on WhatsApp</Text>
                </Pressable>
              </View>
              <Text style={[styles.amt, complete ? { color: colors.success } : { color: colors.warning }]}>{fmtINR(p)}</Text>
            </Pressable>
          );
        })}
      </ScrollView>
      <BottomSheet visible={show} onClose={() => setShow(false)} title={editing ? "Edit donation" : "Log a donation"} testID="donation-sheet">
        <View style={styles.collectorPill} testID="collector-pill">
          <Text style={styles.collectorPillLbl}>COLLECTED BY</Text>
          <Text style={styles.collectorPillName}>
            {editing ? (editing.collected_by || editing.created_by || user?.name || "You") : (user?.name || "You")}
            {user?.role ? ` · ${user.role}` : ""}
          </Text>
        </View>
        <Field label="Donor name" value={donor} onChangeText={setDonor} placeholder="Ramesh Kulkarni" />
        <Field label="Phone (optional, for SMS receipt)" value={phone} onChangeText={setPhone} keyboardType="phone-pad" placeholder="+919876543210" autoCapitalize="none" />
        <Field label={isPartial ? "Total pledged (₹)" : "Amount given (₹)"} value={amount} onChangeText={setAmount} keyboardType="numeric" placeholder="1100" />
        <Pressable onPress={() => { setIsPartial(!isPartial); if (!isPartial) setPaid(""); }} style={styles.partialToggle} testID="partial-toggle">
          <View style={[styles.checkbox, isPartial && { backgroundColor: colors.brandPrimary, borderColor: colors.brandPrimary }]}>
            {isPartial ? <Text style={{ color: colors.onBrand, fontWeight: "800" }}>✓</Text> : null}
          </View>
          <Text style={{ color: colors.onSurface, fontWeight: "600", fontSize: 13 }}>This is a partial payment (add pending due)</Text>
        </Pressable>
        {isPartial ? (
          <>
            <Field label="Paid now (₹)" value={paid} onChangeText={setPaid} keyboardType="numeric" placeholder="0" />
            {shortfall > 0 ? (
              <View style={styles.dueBanner}>
                <Text style={styles.dueBannerText}>⚠️ {fmtINR(shortfall)} will be tracked as pending due</Text>
              </View>
            ) : null}
          </>
        ) : null}
        <Text style={styles.optLbl}>Mode</Text>
        <View style={{ flexDirection: "row", gap: spacing.sm, marginBottom: spacing.lg }}>
          {MODES.map(m => (
            <Pressable key={m} onPress={() => setMode(m)} testID={`mode-${m}`}
              style={{ flex: 1, paddingVertical: 12, borderRadius: radius.pill, backgroundColor: mode === m ? colors.brandPrimary : colors.surfaceSecondary, borderWidth: 1, borderColor: mode === m ? colors.brandPrimary : colors.border, alignItems: "center" }}>
              <Text style={{ color: mode === m ? colors.onBrand : colors.onSurfaceTertiary, fontWeight: "700", textTransform: "uppercase", fontSize: 12 }}>{m}</Text>
            </Pressable>
          ))}
        </View>
        <Field label="Note (optional)" value={note} onChangeText={setNote} placeholder="Family donation" />
        {!editing ? (
          <Pressable onPress={() => setSendSms(!sendSms)} style={{ flexDirection: "row", alignItems: "center", gap: 10, marginBottom: spacing.lg }} testID="send-sms-toggle">
            <View style={[styles.checkbox, sendSms && { backgroundColor: colors.brandPrimary, borderColor: colors.brandPrimary }]}>
              {sendSms ? <Text style={{ color: colors.onBrand, fontWeight: "800" }}>✓</Text> : null}
            </View>
            <Text style={{ color: colors.onSurface, fontWeight: "600", fontSize: 13 }}>Send SMS thank-you (if phone given)</Text>
          </Pressable>
        ) : null}
        <Button label={(createM.isPending || editM.isPending) ? "Saving…" : (editing ? "Save changes" : "Save donation")} disabled={disabled} onPress={save} testID="save-donation-button" />
        {editing ? <Button label="Share receipt on WhatsApp" tone="gold" onPress={() => shareReceipt(editing)} testID="share-edit-receipt-button" style={{ marginTop: spacing.md }} /> : null}
        {editing ? (
          <Pressable
            onPress={() => {
              if (!confirmDel) setConfirmDel(true);
              else deleteM.mutate(editing.donation_id);
            }}
            style={[styles.deleteBtn, confirmDel && styles.deleteBtnConfirm]}
            testID="delete-donation-button"
          >
            <Text style={[styles.deleteBtnText, confirmDel && { color: colors.onError }]}>
              {deleteM.isPending ? "Deleting…" : confirmDel ? "Tap again to confirm delete" : "🗑  Delete this donation"}
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
  hero: { backgroundColor: colors.brandPrimary, borderRadius: radius.lg, padding: spacing.xl, marginBottom: spacing.xl },
  heroLbl: { color: "rgba(255,255,255,0.7)", fontSize: 11, letterSpacing: 1, fontWeight: "700" },
  heroVal: { color: colors.onBrand, fontFamily: fonts.display, fontSize: 42, fontWeight: "700", marginTop: 6 },
  heroMeta: { color: colors.brandSecondary, fontSize: 13, marginTop: 6 },
  pendingLink: { alignSelf: "flex-start", marginTop: spacing.md, paddingHorizontal: 12, paddingVertical: 6, borderRadius: radius.pill, backgroundColor: "rgba(255,255,255,0.15)" },
  pendingLinkText: { color: colors.onBrand, fontSize: 12, fontWeight: "700" },
  row: { flexDirection: "row", alignItems: "center", backgroundColor: colors.surfaceSecondary, padding: spacing.md, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, marginBottom: spacing.sm },
  rowTop: { flexDirection: "row", alignItems: "center", gap: 6 },
  avatar: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.brandTertiary, alignItems: "center", justifyContent: "center", marginRight: spacing.md },
  aTxt: { color: colors.brandPrimary, fontWeight: "700", fontFamily: fonts.display },
  donor: { color: colors.onSurface, fontWeight: "600", fontSize: 15, flexShrink: 1 },
  dueTag: { paddingHorizontal: 8, paddingVertical: 2, backgroundColor: colors.warning, borderRadius: radius.pill },
  dueTxt: { color: colors.onWarning, fontSize: 10, fontWeight: "800", letterSpacing: 0.5 },
  meta: { color: colors.muted, fontSize: 12, marginTop: 2 },
  collector: { color: colors.brandPrimary, fontSize: 11, marginTop: 4, fontWeight: "600" },
  receiptBtn: { alignSelf: "flex-start", marginTop: 8, paddingHorizontal: 10, paddingVertical: 7, borderRadius: radius.sm, backgroundColor: colors.brandTertiary, borderWidth: 1, borderColor: colors.border },
  receiptBtnText: { color: colors.brandPrimary, fontSize: 11, fontWeight: "800" },
  amt: { fontFamily: fonts.display, fontSize: 18, fontWeight: "700" },
  optLbl: { fontSize: 12, color: colors.muted, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 6, fontWeight: "600" },
  dueBanner: { backgroundColor: "#FFF3E0", borderColor: colors.warning, borderWidth: 1, borderRadius: radius.md, padding: 10, marginBottom: spacing.md },
  dueBannerText: { color: colors.warning, fontSize: 12, fontWeight: "700" },
  partialToggle: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: spacing.md },
  checkbox: { width: 22, height: 22, borderRadius: 6, borderWidth: 2, borderColor: colors.borderStrong, alignItems: "center", justifyContent: "center" },
  deleteBtn: { marginTop: spacing.md, paddingVertical: 14, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.error, alignItems: "center" },
  deleteBtnConfirm: { backgroundColor: colors.error, borderColor: colors.error },
  deleteBtnText: { color: colors.error, fontWeight: "700", fontSize: 14 },
  collectorPill: { backgroundColor: colors.brandTertiary, borderRadius: radius.md, padding: spacing.md, marginBottom: spacing.lg },
  collectorPillLbl: { color: colors.brandPrimary, fontSize: 10, letterSpacing: 1, fontWeight: "700" },
  collectorPillName: { color: colors.brandPrimary, fontSize: 14, fontWeight: "700", marginTop: 2 },
});
