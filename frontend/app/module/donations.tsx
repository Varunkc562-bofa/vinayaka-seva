import React, { useState, useMemo } from "react";
import { View, Text, ScrollView, Pressable, StyleSheet, ActivityIndicator, RefreshControl } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { api } from "@/src/api";
import { colors, fonts, radius, spacing } from "@/src/theme";
import { ScreenHeader, BottomSheet, Field, Button, Empty, fmtINR } from "@/src/ui";

const MODES = ["cash", "upi", "bank"];

export default function Donations() {
  const insets = useSafeAreaInsets();
  const qc = useQueryClient();
  const router = useRouter();
  const [show, setShow] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [donor, setDonor] = useState(""); const [pledged, setPledged] = useState("");
  const [paid, setPaid] = useState(""); const [mode, setMode] = useState("cash");
  const [note, setNote] = useState(""); const [phone, setPhone] = useState("");
  const [sendSms, setSendSms] = useState(true);

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
    setEditing(null); setDonor(""); setPledged(""); setPaid(""); setMode("cash"); setNote(""); setPhone(""); setSendSms(true);
    setShow(true);
  };
  const openEdit = (d: any) => {
    setEditing(d);
    setDonor(d.donor_name || "");
    setPledged(String(d.amount || ""));
    setPaid(String(d.paid_amount ?? d.amount ?? ""));
    setMode(d.mode || "cash");
    setNote(d.note || "");
    setPhone(d.phone || "");
    setSendSms(false);
    setShow(true);
  };

  const createM = useMutation({
    mutationFn: (d: any) => api.createDonation(d),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["donations"] }); qc.invalidateQueries({ queryKey: ["dashboard"] }); qc.invalidateQueries({ queryKey: ["pendingDues"] }); setShow(false); },
  });
  const editM = useMutation({
    mutationFn: ({ id, d }: any) => api.editDonation(id, d),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["donations"] }); qc.invalidateQueries({ queryKey: ["dashboard"] }); qc.invalidateQueries({ queryKey: ["pendingDues"] }); setShow(false); },
  });

  const save = () => {
    const amountVal = parseFloat(pledged) || 0;
    const paidVal = paid === "" ? amountVal : (parseFloat(paid) || 0);
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

  const disabled = !donor.trim() || !pledged || (createM.isPending || editM.isPending);
  const remaining = Math.max(0, (parseFloat(pledged) || 0) - (paid === "" ? (parseFloat(pledged) || 0) : (parseFloat(paid) || 0)));

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
              </View>
              <Text style={[styles.amt, complete ? { color: colors.success } : { color: colors.warning }]}>{fmtINR(p)}</Text>
            </Pressable>
          );
        })}
      </ScrollView>
      <BottomSheet visible={show} onClose={() => setShow(false)} title={editing ? "Edit donation" : "Log a donation"} testID="donation-sheet">
        <Field label="Donor name" value={donor} onChangeText={setDonor} placeholder="Ramesh Kulkarni" />
        <Field label="Pledged amount (₹)" value={pledged} onChangeText={setPledged} keyboardType="numeric" placeholder="1100" />
        <Field label={`Paid amount (₹) · leave blank if fully paid`} value={paid} onChangeText={setPaid} keyboardType="numeric" placeholder={pledged || "0"} />
        {remaining > 0 ? (
          <View style={styles.dueBanner}>
            <Text style={styles.dueBannerText}>⚠️ {fmtINR(remaining)} will be tracked as pending due</Text>
          </View>
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
        <Field label="Donor phone (for SMS receipt)" value={phone} onChangeText={setPhone} keyboardType="phone-pad" placeholder="+919876543210" autoCapitalize="none" />
        {!editing ? (
          <Pressable onPress={() => setSendSms(!sendSms)} style={{ flexDirection: "row", alignItems: "center", gap: 10, marginBottom: spacing.lg }} testID="send-sms-toggle">
            <View style={{ width: 22, height: 22, borderRadius: 6, borderWidth: 2, borderColor: sendSms ? colors.brandPrimary : colors.borderStrong, backgroundColor: sendSms ? colors.brandPrimary : "transparent", alignItems: "center", justifyContent: "center" }}>
              {sendSms ? <Text style={{ color: colors.onBrand, fontWeight: "800" }}>✓</Text> : null}
            </View>
            <Text style={{ color: colors.onSurface, fontWeight: "600", fontSize: 14 }}>Send SMS thank-you to donor</Text>
          </Pressable>
        ) : null}
        <Button label={(createM.isPending || editM.isPending) ? "Saving…" : (editing ? "Save changes" : "Save donation")} disabled={disabled} onPress={save} testID="save-donation-button" />
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
  amt: { fontFamily: fonts.display, fontSize: 18, fontWeight: "700" },
  optLbl: { fontSize: 12, color: colors.muted, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 6, fontWeight: "600" },
  dueBanner: { backgroundColor: "#FFF3E0", borderColor: colors.warning, borderWidth: 1, borderRadius: radius.md, padding: 10, marginBottom: spacing.md },
  dueBannerText: { color: colors.warning, fontSize: 12, fontWeight: "700" },
});
