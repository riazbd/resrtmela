"use client";

import type { AgencyPublished } from "@rh/shared";
import { PreviewFrame } from "@/components/preview-frame";
import { AgencyPage } from "@/components/agency-site/agency-page";

/** An agency's page as it will look, before it is published. */
export default function AgencyPreviewPage() {
  return (
    <PreviewFrame<AgencyPublished>
      path="/agent/site/preview"
      back="/agent/website"
      render={(page) => <AgencyPage page={page} />}
    />
  );
}
