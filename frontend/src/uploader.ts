import { Alert, Linking, Platform } from "react-native";
import * as ImagePicker from "expo-image-picker";
import { uploadFile } from "@/src/api";

// Request media library permission (contextual, with settings fallback)
export async function ensureMediaPermission(): Promise<boolean> {
  // Browsers open a native file chooser and do not need Expo media permission.
  if (Platform.OS === "web") return true;
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

// Map file extension → MIME type. Fallback to octet-stream.
const MIME_BY_EXT: Record<string, string> = {
  jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png",
  gif: "image/gif", webp: "image/webp", bmp: "image/bmp",
  heic: "image/heic", heif: "image/heif", tif: "image/tiff", tiff: "image/tiff",
  svg: "image/svg+xml", avif: "image/avif", ico: "image/x-icon",
};
const EXT_BY_MIME: Record<string, string> = Object.fromEntries(
  Object.entries(MIME_BY_EXT).map(([e, m]) => [m, e])
);

function extFromUri(uri: string): string | null {
  const clean = uri.split("?")[0].split("#")[0];
  const dot = clean.lastIndexOf(".");
  if (dot < 0) return null;
  const ext = clean.slice(dot + 1).toLowerCase();
  return ext.length <= 5 && /^[a-z0-9]+$/.test(ext) ? ext : null;
}

function pickNameAndType(asset: any): { name: string; type: string } {
  const uriExt = extFromUri(asset.uri || "");
  const providedMime = (asset.mimeType || "").toLowerCase();
  const providedName = asset.fileName || "";
  const providedExt = extFromUri(providedName);

  // Prefer real extension from filename, then uri, then mime.
  let ext = providedExt || uriExt || EXT_BY_MIME[providedMime] || null;
  // Prefer mime that matches ext; else use provided mime; else map ext.
  let type =
    (ext && MIME_BY_EXT[ext]) ||
    providedMime ||
    (uriExt ? MIME_BY_EXT[uriExt] : "") ||
    "application/octet-stream";
  if (!ext && type.startsWith("image/")) ext = EXT_BY_MIME[type] || "jpg";
  if (!ext) ext = "jpg";
  const name = providedName && providedExt ? providedName : `photo_${Date.now()}.${ext}`;
  return { name, type };
}

// Pick a single image from library — accepts every image format the OS exposes
// (JPG, PNG, HEIC, WEBP, GIF, BMP, etc). Returns storage_path or null.
export async function pickAndUploadImage(folder: string): Promise<{ storage_path: string; url: string } | null> {
  const ok = await ensureMediaPermission();
  if (!ok) return null;
  const res = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ["images"] as any,
    quality: 0.85,
    allowsMultipleSelection: false,
    // Do NOT force any conversion; we want the original format preserved.
    exif: false,
  });
  if (res.canceled || !res.assets?.[0]) return null;
  const asset = res.assets[0];
  const { name, type } = pickNameAndType(asset);
  try {
    const r = await uploadFile(asset.uri, folder, name, type);
    return { storage_path: r.storage_path, url: r.url };
  } catch (e: any) {
    Alert.alert("Upload failed", e?.message || "Please try again.");
    return null;
  }
}
