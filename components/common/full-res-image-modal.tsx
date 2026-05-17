"use client";

import { Expand } from "lucide-react";
import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DEFAULT_IMAGE_HEIGHT,
  DEFAULT_IMAGE_WIDTH,
} from "@/lib/recipes/constants";
import { cn } from "@/lib/utils";

interface FullResImageModalProps {
  /** Base bitmap URL with no query params, e.g. "/api/bitmap/my-recipe.bmp" */
  imageUrl: string;
  label?: string;
  isPortrait?: boolean;
  className?: string;
}

export function FullResImageModal({
  imageUrl,
  label = "Full resolution preview",
  isPortrait = false,
  className,
}: FullResImageModalProps) {
  const [open, setOpen] = useState(false);

  const width = isPortrait ? DEFAULT_IMAGE_HEIGHT : DEFAULT_IMAGE_WIDTH;
  const height = isPortrait ? DEFAULT_IMAGE_WIDTH : DEFAULT_IMAGE_HEIGHT;
  const src = `${imageUrl}?width=${width}&height=${height}`;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={cn(
          "inline-flex items-center gap-1.5 rounded-md px-2 py-1.5 text-xs font-medium",
          "text-muted-foreground transition-colors hover:bg-muted hover:text-foreground",
          className,
        )}
        aria-label="View at full resolution"
      >
        <Expand className="h-3.5 w-3.5" />
        1:1
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent
          className="max-w-none w-fit max-h-[calc(100vh-4rem)] max-w-[calc(100vw-2rem)] overflow-auto p-0"
          aria-describedby={undefined}
        >
          <DialogTitle className="sr-only">{label}</DialogTitle>
          <picture>
            <source srcSet={src} type="image/bmp" />
            <img
              src={src}
              alt={label}
              width={width}
              height={height}
              style={{ imageRendering: "pixelated", display: "block" }}
            />
          </picture>
        </DialogContent>
      </Dialog>
    </>
  );
}
