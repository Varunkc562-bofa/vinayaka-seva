import React, { useState } from "react";
import { View, Text, ScrollView, Pressable, StyleSheet, ActivityIndicator, RefreshControl, Dimensions } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { api } from "@/src/api";
import { pickAndUploadImage } from "@/src/uploader";
import { AuthImage } from "@/src/auth-image";
import { colors, fonts, radius, spacing } from "@/src/theme";
import { ScreenHeader, ChipRow, BottomSheet, Field, Button, Empty } from "@/src/ui";

const CATS = [
  { label: "All", value: "all" }, { label: "Aarti", value: "aarti" },
  { label: "Decoration", value: "decoration" }, { label: "Cultural", value: "cultural" },
  { label: "Annadanam", value: "annadanam" }, { label: "General", value: "general" },
];
const CAT_OPTS = CATS.slice(1);

export default function Gallery() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const qc = useQueryClient();
  const [filter, setFilter] = useState("all");
  const [uploading, setUploading] = useState(false);
  const [showCat, setShowCat] = useState(false);
  const [pending, setPending] = useState<{ storage_path: string } | null>(null);
  const [caption, setCaption] = useState("");
  const [cat, setCat] = useState("general");

  const { data = [], isLoading, refetch, isRefetching } = useQuery({ queryKey: ["gallery"], queryFn: api.gallery });
  const filtered = filter === "all" ? data : data.filter((p: any) => p.category === filter);

  const addM = useMutation({
    mutationFn: (d: any) => api.addGallery(d),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["gallery"] }); setShowCat(false); setPending(null); setCaption(""); setCat("general"); },
  });

  const onPick = async () => {
    setUploading(true);
    try {
      const r = await pickAndUploadImage("gallery");
      if (r) { setPending({ storage_path: r.storage_path }); setShowCat(true); }
    } finally { setUploading(false); }
  };

  const W = Dimensions.get("window").width;
  const tileW = (W - spacing.xl * 2 - spacing.sm) / 2;

  return (
    <View style={{ flex: 1, backgroundColor: colors.surface }} testID="gallery-screen">
      <ScreenHeader title="Gallery" subtitle="Moments of seva" back onBack={() => router.back()}
        right={<Pressable onPress={onPick} style={styles.addBtn} testID="gallery-upload-button" disabled={uploading}>
          {uploading ? <ActivityIndicator color={colors.onBrand} /> : <Text style={styles.addTxt}>+</Text>}
        </Pressable>} />

      <View style={{ paddingVertical: spacing.md, backgroundColor: colors.surface, borderBottomWidth: 1, borderBottomColor: colors.border }}>
        <ChipRow items={CATS} value={filter} onChange={setFilter} />
      </View>

      <ScrollView contentContainerStyle={{ padding: spacing.xl, paddingBottom: insets.bottom + spacing["3xl"] }}
        refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={colors.brandPrimary} />}>
        {isLoading ? <ActivityIndicator color={colors.brandPrimary} /> :
         filtered.length === 0 ? <Empty title="No photos yet" body="Tap + to share aarti, decoration or cultural moments." testID="gallery-empty" /> :
         <View style={styles.grid}>
           {filtered.map((p: any) => (
             <View key={p.photo_id} style={[styles.tile, { width: tileW }]}>
               <AuthImage storagePath={p.storage_path} style={{ width: "100%", height: tileW, borderRadius: radius.md }} contentFit="cover" />
               <View style={styles.tileFoot}>
                 <View style={styles.catPill}><Text style={styles.catTxt}>{p.category}</Text></View>
                 {p.caption ? <Text style={styles.caption} numberOfLines={2}>{p.caption}</Text> : null}
                 <Text style={styles.by}>by {p.by_name}</Text>
               </View>
             </View>
           ))}
         </View>}
      </ScrollView>

      <BottomSheet visible={showCat} onClose={() => { setShowCat(false); setPending(null); }} title="Add to gallery" testID="gallery-sheet">
        <Field label="Caption (optional)" value={caption} onChangeText={setCaption} placeholder="Evening aarti" />
        <Text style={{ fontSize: 12, color: colors.muted, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 6, fontWeight: "600" }}>Category</Text>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.sm, marginBottom: spacing.lg }}>
          {CAT_OPTS.map(c => (
            <Pressable key={c.value} onPress={() => setCat(c.value)} testID={`gcat-${c.value}`}
              style={{ paddingHorizontal: spacing.md, paddingVertical: 10, borderRadius: radius.pill, backgroundColor: cat === c.value ? colors.brandPrimary : colors.surfaceSecondary, borderWidth: 1, borderColor: cat === c.value ? colors.brandPrimary : colors.border }}>
              <Text style={{ color: cat === c.value ? colors.onBrand : colors.onSurfaceTertiary, fontWeight: "600" }}>{c.label}</Text>
            </Pressable>
          ))}
        </View>
        <Button label={addM.isPending ? "Saving…" : "Save photo"} disabled={addM.isPending || !pending}
          onPress={() => pending && addM.mutate({ storage_path: pending.storage_path, caption, category: cat })}
          testID="gallery-save-button" />
      </BottomSheet>
    </View>
  );
}

const styles = StyleSheet.create({
  addBtn: { width: 42, height: 42, borderRadius: 21, backgroundColor: colors.brandPrimary, alignItems: "center", justifyContent: "center" },
  addTxt: { color: colors.onBrand, fontSize: 26, lineHeight: 28, fontWeight: "300" },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  tile: { backgroundColor: colors.surfaceSecondary, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, overflow: "hidden" },
  tileFoot: { padding: spacing.sm },
  catPill: { alignSelf: "flex-start", paddingHorizontal: 8, paddingVertical: 2, backgroundColor: colors.brandTertiary, borderRadius: radius.pill, marginBottom: 4 },
  catTxt: { color: colors.brandPrimary, fontSize: 10, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.5 },
  caption: { color: colors.onSurface, fontSize: 13, fontFamily: fonts.display },
  by: { color: colors.muted, fontSize: 11, marginTop: 2 },
});
