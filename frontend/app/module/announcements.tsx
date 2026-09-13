import React, { useState } from "react";
import { View, Text, ScrollView, Pressable, StyleSheet, ActivityIndicator, RefreshControl } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { api } from "@/src/api";
import { pickAndUploadImage } from "@/src/uploader";
import { AuthImage } from "@/src/auth-image";
import { colors, fonts, radius, spacing } from "@/src/theme";
import { ScreenHeader, BottomSheet, Field, Button, Empty } from "@/src/ui";

export default function Announcements() {
  const insets = useSafeAreaInsets();
  const qc = useQueryClient();
  const router = useRouter();
  const [show, setShow] = useState(false);
  const [title, setTitle] = useState(""); const [body, setBody] = useState("");
  const [pinned, setPinned] = useState(false);
  const [imgPath, setImgPath] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

  const { data = [], isLoading, refetch, isRefetching } = useQuery({ queryKey: ["announcements"], queryFn: api.announcements });
  const createM = useMutation({
    mutationFn: (d: any) => api.createAnnouncement(d),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["announcements"] }); qc.invalidateQueries({ queryKey: ["dashboard"] }); setShow(false); setTitle(""); setBody(""); setPinned(false); setImgPath(null); },
  });

  const attach = async () => {
    setUploading(true);
    try { const r = await pickAndUploadImage("announcements"); if (r) setImgPath(r.storage_path); }
    finally { setUploading(false); }
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.surface }} testID="announcements-screen">
      <ScreenHeader title="Announcements" subtitle="Community updates" back onBack={() => router.back()}
        right={<Pressable onPress={() => setShow(true)} style={styles.addBtn} testID="new-announcement-button"><Text style={styles.addTxt}>+</Text></Pressable>} />
      <ScrollView contentContainerStyle={{ padding: spacing.xl, paddingBottom: insets.bottom + spacing["3xl"] }}
        refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={colors.brandPrimary} />}>
        {isLoading ? <ActivityIndicator color={colors.brandPrimary} /> :
         data.length === 0 ? <Empty title="No announcements yet" body="Post an update for your committee." testID="ann-empty" /> :
         data.map((a: any) => (
          <View key={a.announcement_id} style={[styles.card, a.pinned && styles.pinned]}>
            {a.pinned ? <View style={styles.pinTag}><Text style={styles.pinText}>📌 PINNED</Text></View> : null}
            <Text style={styles.title}>{a.title}</Text>
            {a.image_url ? (
              <AuthImage storagePath={a.image_url} style={{ width: "100%", height: 200, borderRadius: radius.md, marginTop: spacing.sm }} contentFit="cover" />
            ) : null}
            <Text style={styles.body}>{a.body}</Text>
            <Text style={styles.meta}>{a.author} · {a.author_role}</Text>
          </View>
        ))}
      </ScrollView>
      <BottomSheet visible={show} onClose={() => setShow(false)} title="Post announcement" testID="new-ann-sheet">
        <Field label="Title" value={title} onChangeText={setTitle} placeholder="Aarti timing changed" />
        <Field label="Message" value={body} onChangeText={setBody} multiline numberOfLines={4} placeholder="Details..." />
        <Pressable onPress={attach} style={styles.attach} testID="attach-image-button" disabled={uploading}>
          {uploading ? <ActivityIndicator color={colors.brandPrimary} /> :
            <Text style={{ color: colors.brandPrimary, fontWeight: "700" }}>
              {imgPath ? "✓ Photo attached · tap to change" : "📷 Attach a photo (optional)"}
            </Text>}
        </Pressable>
        <Pressable onPress={() => setPinned(!pinned)} style={styles.pinToggle} testID="pin-toggle">
          <View style={[styles.checkbox, pinned && { backgroundColor: colors.brandPrimary, borderColor: colors.brandPrimary }]}>
            {pinned ? <Text style={{ color: colors.onBrand, fontWeight: "800" }}>✓</Text> : null}
          </View>
          <Text style={{ color: colors.onSurface, fontWeight: "600" }}>Pin to top</Text>
        </Pressable>
        <Button label={createM.isPending ? "Posting…" : "Post announcement"} disabled={createM.isPending || !title.trim() || !body.trim()}
          onPress={() => createM.mutate({ title, body, pinned, image_url: imgPath })} testID="save-ann-button" />
      </BottomSheet>
    </View>
  );
}

const styles = StyleSheet.create({
  addBtn: { width: 42, height: 42, borderRadius: 21, backgroundColor: colors.brandPrimary, alignItems: "center", justifyContent: "center" },
  addTxt: { color: colors.onBrand, fontSize: 26, lineHeight: 28, fontWeight: "300" },
  card: { backgroundColor: colors.surfaceSecondary, padding: spacing.lg, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, marginBottom: spacing.md },
  pinned: { borderColor: colors.brandSecondary, backgroundColor: "#FFFDF5" },
  pinTag: { alignSelf: "flex-start", paddingHorizontal: 10, paddingVertical: 3, backgroundColor: colors.brandSecondary, borderRadius: radius.pill, marginBottom: 6 },
  pinText: { color: colors.onBrandSecondary, fontSize: 10, fontWeight: "700", letterSpacing: 0.5 },
  title: { fontFamily: fonts.display, fontSize: 20, fontWeight: "600", color: colors.onSurface },
  body: { color: colors.onSurfaceTertiary, fontSize: 14, marginTop: 6, lineHeight: 20 },
  meta: { color: colors.muted, fontSize: 11, marginTop: spacing.md, letterSpacing: 0.5, textTransform: "uppercase", fontWeight: "600" },
  pinToggle: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: spacing.lg },
  checkbox: { width: 22, height: 22, borderRadius: 6, borderWidth: 2, borderColor: colors.borderStrong, alignItems: "center", justifyContent: "center" },
  attach: { paddingVertical: 12, paddingHorizontal: spacing.lg, borderRadius: radius.md, borderWidth: 1, borderColor: colors.brandPrimary, borderStyle: "dashed", alignItems: "center", marginBottom: spacing.md },
});
