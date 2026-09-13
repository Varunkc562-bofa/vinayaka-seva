import { Alert, Platform, Linking } from "react-native";
import * as ImagePicker from "expo-image-picker";
import { uploadFile } from "@/src/api";

// Request media library permission (contextual, with settings fallback)
export async function ensureMediaPermission(): Promise<boolean> {
  const cur = await ImagePicker.getMediaLibraryPermissionsAsync();
  if (cur.granted) return true;
  if (!cur.canAskAgain) {
    Alert.alert("Photo access needed",
      "Please enable Photos permission in Settings to attach pictures.",
      [{ text: "Cancel", style: "cancel" }, { text: "Open Settings", onPress: () => Linking.openSettings() }]);
    return false;
  }
  const req = await ImagePicker.requestMediaLibraryPermissionsAsync();
  return !!req.granted;
}

// Pick a single image from library (returns storage_path or null)
export async function pickAndUploadImage(folder: string): Promise<{ storage_path: string; url: string } | null> {
  const ok = await ensureMediaPermission();
  if (!ok) return null;
  const res = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ["images"] as any,
    quality: 0.75,
    allowsMultipleSelection: false,
  });
  if (res.canceled || !res.assets?.[0]) return null;
  const asset = res.assets[0];
  const type = asset.mimeType || "image/jpeg";
  const name = asset.fileName || `photo_${Date.now()}.jpg`;
  try {
    const r = await uploadFile(asset.uri, folder, name, type);
    return { storage_path: r.storage_path, url: r.url };
  } catch (e: any) {
    Alert.alert("Upload failed", e?.message || "Please try again.");
    return null;
  }
}
