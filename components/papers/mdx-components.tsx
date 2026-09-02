// components/papers/mdx-components.tsx
// Component map passed to next-mdx-remote: custom elements available in MDX
// bodies, plus safe defaults for raw HTML elements.

import type { MDXComponents } from "mdx/types";
import { Figure } from "./Figure";
import { Callout } from "./Callout";

export const mdxComponents: MDXComponents = {
  Figure,
  Callout,
  a: (props) => (
    <a
      {...props}
      // External links: no opener access back into the page
      {...(props.href?.startsWith("http")
        ? { target: "_blank", rel: "noopener noreferrer" }
        : {})}
    />
  ),
};
