"use client";

import { use } from "react";
import type { PublishedResort } from "@rh/shared";
import { client } from "@/lib/api";
import { PreviewFrame } from "@/components/preview-frame";
import { templateFor } from "@/components/site/templates";

/** A resort's page as it will look, before it is published. */
export default function ResortPreviewPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return (
    <PreviewFrame<PublishedResort>
      load={() => client.site.preview(Number(id))}
      back="/settings"
      render={(resort) => {
        const Template = templateFor(resort.template);
        return <Template resort={resort} />;
      }}
    />
  );
}
