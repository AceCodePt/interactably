import "./vendor/interactably-core.js";
import "./vendor/modifiable.js";
import "./vendor/dirtyable.js";
import "./vendor/listable.js";
import "./vendor/revealable.js";
import "./vendor/requestable.js";
import "./vendor/prevent-default.js";
import { defineInteractableHost } from "./vendor/interactably-core.js";

// modifiable/dirtyable/listable register their own tags (input, output, select,
// textarea, ul, ol, tbody) as interactable-<tag> hosts. The remaining hosts are
// trigger-only tags and the tags of the tag-less implementations (revealable,
// requestable, prevent-default), which the page defines:
defineInteractableHost("button");
defineInteractableHost("form");
defineInteractableHost("section");
defineInteractableHost("div");

// Mount the demo only once every implementation and host is registered, so each
// element is created already upgraded with its full implements list.
const demo = document.getElementById("demo");
if (demo instanceof HTMLTemplateElement) {
  document.body.append(demo.content);
}