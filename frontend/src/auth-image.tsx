import React, { useEffect, useState } from "react";
import { Image, ImageProps } from "expo-image";
import { fileUrl } from "@/src/api";

type Props = Omit<ImageProps, "source"> & { storagePath: string };

// Authenticated image view for private storage objects.
export function AuthImage({ storagePath, ...rest }: Props) {
  const [uri, setUri] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    fileUrl(storagePath).then(u => alive && setUri(u));
    return () => { alive = false; };
  }, [storagePath]);
  if (!uri) return <Image {...rest} source={undefined} />;
  return <Image {...rest} source={{ uri }} />;
}
