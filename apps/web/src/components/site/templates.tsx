import type { PublishedResort } from "@rh/shared";
import { SITE_TEMPLATES } from "@rh/shared";
import Sanctuary from "./sanctuary";
import Verandah from "./verandah";
import Ledger from "./ledger";

export type TemplateComponent = (props: { resort: PublishedResort }) => React.JSX.Element;

/**
 * The name a row holds, turned into the component that draws it.
 *
 * `SITE_TEMPLATES` in @rh/shared is the vocabulary — what the editor offers and
 * what the API will accept — and this is the other half of it. They are checked
 * against each other in the spec rather than trusted to stay in step: a key on
 * the shelf with no component here is a resort's site rendering nothing.
 */
const BY_KEY: Record<string, TemplateComponent> = {
  sanctuary: Sanctuary,
  verandah: Verandah,
  ledger: Ledger,
};

/**
 * Never null.
 *
 * A row can name a template that has since been retired, and a resort's site
 * going blank because somebody tidied a list is not a failure worth having. The
 * first design on the shelf is a fine thing to be shown instead.
 */
export function templateFor(key: string): TemplateComponent {
  return BY_KEY[key] ?? BY_KEY[SITE_TEMPLATES[0]!.key]!;
}
